import { describe, expect, it } from 'vitest';
import {
  pianoKeyAt,
  trumpetNoteForValves,
  valveStateFromExtensions,
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
