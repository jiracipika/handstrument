import { describe, expect, it } from 'vitest';
import {
  pianoKeyAt,
  trumpetNoteForValves,
  valveStateFromExtensions,
  createKeyPressTracker,
  createSmoothedPoint,
  type PianoSurfaceCalibration,
} from '../src/instruments/surfacePrediction';

const surface: PianoSurfaceCalibration = { xMin: 0.2, xMax: 0.8, pressY: 0.6 };

describe('piano surface prediction', () => {
  it('maps a pressed index fingertip across calibrated piano keys', () => {
    expect(pianoKeyAt({ x: 0.21, y: 0.66 }, surface)).toBe('C4');
    expect(pianoKeyAt({ x: 0.5, y: 0.66 }, surface)).toBe('F#4');
    expect(pianoKeyAt({ x: 0.79, y: 0.66 }, surface)).toBe('C5');
  });

  it('does not emit a key above the calibrated surface or outside the keyboard', () => {
    expect(pianoKeyAt({ x: 0.5, y: 0.55 }, surface)).toBeNull();
    expect(pianoKeyAt({ x: 0.85, y: 0.7 }, surface)).toBeNull();
  });
});

describe('trumpet valve prediction', () => {
  it('treats curled index, middle, ring fingers as valves 1, 2, 3', () => {
    expect(valveStateFromExtensions([1, 0.2, 0.2, 0.8, 1])).toEqual([true, true, false]);
  });

  it('maps common three-valve combinations to a proof-of-concept note set', () => {
    expect(trumpetNoteForValves([false, false, false])).toBe('C4');
    expect(trumpetNoteForValves([false, true, false])).toBe('D4');
    expect(trumpetNoteForValves([true, false, false])).toBe('E4');
    expect(trumpetNoteForValves([true, true, true])).toBe('G#3');
  });
});

describe('fingertip smoothing (One-Euro-style EMA)', () => {
  it('smooths jitter while preserving deliberate movement', () => {
    const filter = createSmoothedPoint(0.5);
    // tiny jitter around 0.50 should barely move the smoothed value
    let out = 0;
    out = filter({ x: 0.51, y: 0.6 }).x;
    out = filter({ x: 0.49, y: 0.6 }).x;
    out = filter({ x: 0.51, y: 0.6 }).x;
    expect(Math.abs(out - 0.5)).toBeLessThan(0.01);
    // a deliberate large move should mostly track through
    const moved = filter({ x: 0.8, y: 0.6 });
    expect(moved.x).toBeGreaterThan(0.6);
    const settled = filter({ x: 0.8, y: 0.6 });
    expect(settled.x).toBeGreaterThan(0.7);
  });

  it('ignores brief dropout frames instead of slamming to a new position', () => {
    const filter = createSmoothedPoint(0.5);
    filter({ x: 0.5, y: 0.5 });
    const afterGlitch = filter({ x: 0.05, y: 0.9 });
    // first outlier is heavily damped, not taken raw
    expect(afterGlitch.x).toBeGreaterThan(0.3);
    expect(afterGlitch.x).toBeLessThan(0.5);
  });
});

describe('key press tracker (hysteresis + retrigger lockout)', () => {
  it('requires pressDepth beyond the line and releases only above a shallower threshold', () => {
    const tracker = createKeyPressTracker(surface);
    // just barely past the press line: within hysteresis band -> not pressed
    expect(tracker.update({ x: 0.5, y: surface.pressY + 0.005 })).toBeNull();
    // clearly pressed
    expect(tracker.update({ x: 0.5, y: surface.pressY + 0.03 })).toBe('F#4');
    // lifts into the hysteresis band: no refire (a note is not retriggered)
    expect(tracker.update({ x: 0.5, y: surface.pressY + 0.008 })).toBeNull();
    // pressing deep again on the SAME key still does not refire — proves the
    // press state survived the band frame (hysteresis, not a fresh press)
    expect(tracker.update({ x: 0.5, y: surface.pressY + 0.03 })).toBeNull();
    // fully released
    expect(tracker.update({ x: 0.5, y: surface.pressY - 0.02 })).toBeNull();
  });

  it('blocks retriggers of the same key until the finger leaves the surface', () => {
    const tracker = createKeyPressTracker(surface);
    expect(tracker.update({ x: 0.5, y: surface.pressY + 0.03 })).toBe('F#4');
    expect(tracker.update({ x: 0.5, y: surface.pressY + 0.03 })).toBeNull();
    expect(tracker.update({ x: 0.52, y: surface.pressY + 0.03 })).toBeNull(); // same key neighbour
    expect(tracker.update({ x: 0.5, y: surface.pressY - 0.05 })).toBeNull(); // lift
    expect(tracker.update({ x: 0.5, y: surface.pressY + 0.03 })).toBe('F#4'); // fresh press fires
  });

  it('fires a new note immediately when sliding to a different key while pressed', () => {
    const tracker = createKeyPressTracker(surface);
    expect(tracker.update({ x: 0.25, y: surface.pressY + 0.03 })).toBe('C#4');
    expect(tracker.update({ x: 0.75, y: surface.pressY + 0.03 })).toBe('B4'); // glissando
  });
});
