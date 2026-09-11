import type { Vec2 } from '../types';

export type SurfaceInstrumentMode = 'none' | 'piano' | 'trumpet';

export interface PianoSurfaceCalibration {
  /** Horizontal limits of the physical keyboard in normalized camera coordinates. */
  xMin: number;
  xMax: number;
  /** Fingertip y coordinate at the tabletop; larger values are closer to the table. */
  pressY: number;
}

export const DEFAULT_PIANO_SURFACE: PianoSurfaceCalibration = {
  xMin: 0.16,
  xMax: 0.84,
  pressY: 0.62,
};

// Low on the left in RAW camera coords. Callers pass `reversed` when the view
// is mirrored (default): with a mirrored preview the user's right is the raw
// low-x side, so reversing makes pitch ascend toward the user's right.
const PIANO_NOTES = ['C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4', 'C5'];

/**
 * Predict one chromatic key from an index fingertip crossing a calibrated tabletop.
 * This is a geometric POC, not a trained general-purpose keyboard recognizer.
 */
export function pianoKeyAt(
  point: Vec2,
  surface: PianoSurfaceCalibration,
  reversed = false,
): string | null {
  if (point.y < surface.pressY || point.x < surface.xMin || point.x > surface.xMax) return null;
  const t = (point.x - surface.xMin) / Math.max(surface.xMax - surface.xMin, 0.001);
  const idx = Math.round(t * (PIANO_NOTES.length - 1));
  const finalIdx = reversed ? PIANO_NOTES.length - 1 - idx : idx;
  return PIANO_NOTES[Math.max(0, Math.min(PIANO_NOTES.length - 1, finalIdx))];
}

/** Returns valve 1/2/3 pressed booleans from index/middle/ring curl. */
export function valveStateFromExtensions(extensions: number[]): [boolean, boolean, boolean] {
  return [extensions[1] < 0.55, extensions[2] < 0.55, extensions[3] < 0.55];
}

/** Simple playable C-major trumpet fingering slice, centred around C4. */
export function trumpetNoteForValves([one, two, three]: [boolean, boolean, boolean]): string {
  const key = `${Number(one)}${Number(two)}${Number(three)}`;
  return {
    '000': 'C4',
    '010': 'D4',
    '100': 'E4',
    '110': 'F4',
    '011': 'F#4',
    '101': 'G4',
    '111': 'G#3',
    '001': 'B3',
  }[key] ?? 'C4';
}
