import { describe, it, expect } from 'vitest';
import { SOUND_PRESETS, instantJamMapping } from '../src/audio/mappings';
import { INSTRUMENTS, instrumentById } from '../src/audio/audioEngine';

describe('sound presets', () => {
  it('every preset references valid instrument ids', () => {
    for (const p of SOUND_PRESETS) {
      expect(
        INSTRUMENTS.some((i) => i.id === p.instrumentLeft),
        `preset ${p.id}: unknown left instrument ${p.instrumentLeft}`,
      ).toBe(true);
      expect(
        INSTRUMENTS.some((i) => i.id === p.instrumentRight),
        `preset ${p.id}: unknown right instrument ${p.instrumentRight}`,
      ).toBe(true);
    }
  });

  it('effect keys and wet values are sane', () => {
    for (const p of SOUND_PRESETS) {
      for (const [k, v] of Object.entries(p.effects ?? {})) {
        expect(v.enabled).toBe(true);
        expect(v.wet).toBeGreaterThan(0);
        expect(v.wet).toBeLessThanOrEqual(1);
        expect(['reverb', 'delay', 'chorus', 'distortion', 'tremolo', 'phaser']).toContain(k);
      }
    }
  });

  it('preset ids are unique', () => {
    const ids = SOUND_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('instrument catalog', () => {
  it('instrument ids are unique', () => {
    const ids = INSTRUMENTS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has at least 20 instruments', () => {
    expect(INSTRUMENTS.length).toBeGreaterThanOrEqual(20);
  });

  it('fallback for unknown id is the first preset', () => {
    expect(instrumentById('nonexistent').id).toBe(INSTRUMENTS[0].id);
  });
});

describe('instant jam mapping sanity', () => {
  it('fist always maps to stop', () => {
    expect(instantJamMapping('left').fist).toEqual({ kind: 'stop' });
    expect(instantJamMapping('right').fist).toEqual({ kind: 'stop' });
  });

  it('drum actions reference valid drums', () => {
    const valid = ['kick', 'snare', 'hat', 'clap', 'tom', 'cowbell'];
    for (const hand of ['left', 'right'] as const) {
      for (const a of Object.values(instantJamMapping(hand))) {
        if (a && a.kind === 'drum') expect(valid).toContain(a.drum);
      }
    }
  });
});
