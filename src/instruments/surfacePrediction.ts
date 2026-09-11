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

/**
 * Adaptive exponential smoother for fingertip position (One-Euro-style):
 * slow movements are heavily damped (kills landmark jitter), fast movements
 * track through (keeps glissandos responsive). Outliers are clamped so a
 * single dropped-tracking frame cannot slam the smoothed point across the
 * frame.
 */
export interface SmoothedPoint {
  (next: Vec2): Vec2;
}

export function createSmoothedPoint(start: Vec2 | number, y = 0): SmoothedPoint {
  let x = typeof start === 'number' ? start : start.x;
  let yy = typeof start === 'number' ? y : start.y;
  let speed = 0;

  return (next: Vec2): Vec2 => {
    const dx = next.x - x;
    const dy = next.y - yy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // clamp the single-frame correction so dropouts do not teleport the point
    const damped = Math.min(dist, 0.25);
    const scale = dist > 0.00001 ? damped / dist : 0;
    const clampedX = x + dx * scale;
    const clampedY = yy + dy * scale;

    // faster motion -> higher alpha -> snappier tracking
    speed = speed * 0.7 + dist * 0.3;
    const alpha = Math.min(0.85, 0.15 + speed * 6);
    x = x + (clampedX - x) * alpha;
    yy = yy + (clampedY - yy) * alpha;
    return { x, y: yy };
  };
}

export interface KeyPressTracker {
  /**
   * Feed one (smoothed) fingertip sample. Returns the note to fire when a NEW
   * key press should sound: press crosses the deep threshold, or the pressed
   * finger slides onto a different key. Same-key re-fires are locked out
   * until the finger lifts off the surface. Returns null when nothing fires.
   */
  update(point: Vec2): string | null;
  /** Note a fresh surface calibration; old press state is stale after recalibration. */
  reset(): void;
}

/**
 * Hysteresis press detection: press commits only past pressY + PRESS_DEPTH,
 * but stays committed until the finger rises above pressY + RELEASE_DEPTH
 * (shallower). Prevents single-frame flicker around the calibration line
 * from machine-gunning notes.
 */
const PRESS_DEPTH = 0.02;
const RELEASE_DEPTH = 0.006;

export function createKeyPressTracker(
  surface: PianoSurfaceCalibration,
  reversed = false,
): KeyPressTracker {
  let pressed = false;
  let lastKey: string | null = null;

  return {
    update(point: Vec2): string | null {
      const key = pianoKeyAt(point, surface, reversed);
      const depth = point.y - surface.pressY;

      if (!pressed) {
        if (key && depth >= PRESS_DEPTH) {
          pressed = true;
          lastKey = key;
          return key;
        }
        return null;
      }

      // pressed: release check uses the shallower threshold
      if (depth < RELEASE_DEPTH) {
        pressed = false;
        lastKey = null;
        return null;
      }

      // still pressed: only fire again when the key CHANGES (glissando)
      if (key && key !== lastKey) {
        lastKey = key;
        return key;
      }
      return null;
    },
    reset(): void {
      pressed = false;
      lastKey = null;
    },
  };
}
