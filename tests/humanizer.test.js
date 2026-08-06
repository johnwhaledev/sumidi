import { describe, it, expect } from 'vitest';
import { humanize, applySwing } from '../src/Humanizer.js';

describe('Humanizer', () => {
  it('con amount=0 non modifica gli eventi', () => {
    const events = [{ tick: 0, note: 60, velocity: 90, duration: 480 }];
    const result = humanize(events, 480, 0, 0, 1);
    expect(result).toEqual([{ tick: 0, note: 60, velocity: 90, duration: 480 }]);
  });

  it('con amount>0 mantiene i tick non-negativi e le velocity nel range MIDI', () => {
    const events = Array.from({ length: 20 }, (_, i) => ({
      tick: i * 240, note: 60 + (i % 5), velocity: 90, duration: 240,
    }));
    const result = humanize(events, 480, 0.5, 0, 42);
    for (const ev of result) {
      expect(ev.tick).toBeGreaterThanOrEqual(0);
      expect(ev.velocity).toBeGreaterThanOrEqual(1);
      expect(ev.velocity).toBeLessThanOrEqual(127);
    }
  });

  it('applySwing con swingAmount=0 non lancia eccezioni', () => {
    const events = [{ tick: 0, note: 60, velocity: 90, duration: 240 }];
    expect(() => applySwing(events, 480, 0)).not.toThrow();
  });
});
