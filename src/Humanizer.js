/**
 * Humanizer.js
 * ─────────────────────────────────────────────────────────────────
 * Applies subtle micro-timing and velocity variation to make
 * generated MIDI feel less mechanical.
 *
 * Rules:
 *   - Downbeats (beat 1, beat 3): minimal timing shift, slight velocity boost
 *   - Upbeats / offbeats: more timing variation, lower velocity
 *   - Drums channel 9: lighter timing touch (drums need to stay tight)
 *   - Consecutive notes same pitch: slight velocity decrease (natural decay)
 * ─────────────────────────────────────────────────────────────────
 */

import { makeRng } from './SongArchitect.js';

/**
 * Humanize an events array in place.
 *
 * @param {Array}  events    Array of { tick, note, velocity, duration }
 * @param {number} ppq
 * @param {number} amount    0.0 = off, 1.0 = max (default 0.35)
 * @param {number} channel   MIDI channel (9 = drums, gets lighter touch)
 * @param {number} seed
 * @returns {Array}  Modified events (same array, mutated)
 */
export function humanize(events, ppq, amount = 0.35, channel = 0, seed = 1, barTicks = ppq * 4) {
  if (amount <= 0) return events;

  const rng         = makeRng(seed ^ 0xFF01);
  const s16         = ppq / 4;
  const stepsPerBar = Math.round(barTicks / s16);
  const isDrums     = channel === 9;

  // Max timing deviation: 1/32 note scaled by amount
  // Drums get 40% of that to stay tight
  const maxTimeDev = s16 * 0.5 * amount * (isDrums ? 0.4 : 1.0);
  const maxVelDev  = Math.round(10 * amount);

  const lastVelByNote = new Map();

  for (const e of events) {
    if (e.note == null) continue;

    // Determine metric position
    const posInBar  = e.tick % barTicks;
    const beat16    = Math.round(posInBar / s16) % stepsPerBar;
    const isDown    = beat16 % 4 === 0;
    const isStrong  = beat16 === 0 || beat16 === Math.floor(stepsPerBar / 2);

    // Timing: downbeats shift less
    const timeFactor = isStrong ? 0.15 : isDown ? 0.4 : 1.0;
    const timeDev    = (rng.next() - 0.5) * 2 * maxTimeDev * timeFactor;
    e.tick = Math.max(0, Math.round(e.tick + timeDev));

    // Velocity: slight variation, downbeats louder
    const velBoost  = isStrong ? rng.int(2, 6) : isDown ? rng.int(0, 3) : rng.int(-4, 2);
    const velRandom = Math.round((rng.next() - 0.5) * 2 * maxVelDev);
    e.velocity = Math.max(1, Math.min(127, e.velocity + velBoost + velRandom));

    // Consecutive same note: slight velocity drop (legato feel)
    const lastVel = lastVelByNote.get(e.note);
    if (lastVel != null && !isDrums) {
      e.velocity = Math.max(1, Math.min(127, Math.round(e.velocity * 0.97 + lastVel * 0.03)));
    }
    lastVelByNote.set(e.note, e.velocity);
  }

  return events;
}

/**
 * Apply swing feel to events.
 * Delays upbeat 16th notes (step dispari) by `swingAmount` fraction of a 16th.
 *
 * @param {Array}  events
 * @param {number} ppq
 * @param {number} swingAmount  0.0 = straight, 0.33 = triplet feel, 0.20 = light groove
 * @returns {Array}
 */
export function applySwing(events, ppq, swingAmount = 0) {
  if (swingAmount <= 0) return events;

  const s16 = ppq / 4;
  // Swing delay: fraction of s16. 0.33 = triplet feel, 0.20 = light groove
  const swingDelay = Math.round(swingAmount * s16);

  for (const e of events) {
    if (e.note == null || e.cc != null) continue;
    // Posizione nel bar in sedicesimi (0-15 per 4/4)
    const posInBar = e.tick % (ppq * 4);
    const step16   = Math.round(posInBar / s16) % 16;
    // Sposta solo i 16esimi DISPARI (upbeat: step 1,3,5,7,9,11,13,15)
    if (step16 % 2 === 1) {
      e.tick += swingDelay;
    }
  }
  return events;
}
