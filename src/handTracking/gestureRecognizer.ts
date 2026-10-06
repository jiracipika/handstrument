// Gesture recognition from MediaPipe landmarks. Geometry-based, no screen coords.
import type { GestureMatch, HandFeatures, Vec2 } from '../types';

export const WRIST = 0;
export const THUMB_TIP = 4;
export const INDEX_TIP = 8;
export const MIDDLE_TIP = 12;
export const RING_TIP = 16;
export const PINKY_TIP = 20;

const FINGER_TIPS = [4, 8, 12, 16, 20];
const FINGER_PIPS = [3, 6, 10, 14, 18];
const FINGER_MCPS = [2, 5, 9, 13, 17];

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Hand size reference: wrist -> middle MCP distance. */
export function handScale(landmarks: Vec2[]): number {
  return Math.max(dist(landmarks[0], landmarks[9]), 1e-4);
}

function angleDelta(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * Schmitt trigger for finger extension: turn ON above 0.5, OFF below 0.3.
 * The dead band between the two thresholds prevents flicker when a finger
 * hovers near the extension boundary (common when framing a gesture).
 */
function hystUp(wasUp: boolean, ext: number): boolean {
  return wasUp ? ext > 0.3 : ext > 0.5;
}

/** Extract continuous, resolution-independent features from 21 landmarks. */
export function extractFeatures(landmarks: Vec2[], prev?: HandFeatures, dt = 1 / 30): HandFeatures {
  const s = handScale(landmarks);

  const palmCenter = {
    x: (landmarks[0].x + landmarks[5].x + landmarks[17].x) / 3,
    y: (landmarks[0].y + landmarks[5].y + landmarks[17].y) / 3,
  };

  const extensions: number[] = [];
  const fingersUp: boolean[] = [];

  for (let f = 0; f < 5; f++) {
    const tip = landmarks[FINGER_TIPS[f]];
    const pip = landmarks[FINGER_PIPS[f]];
    const mcp = landmarks[FINGER_MCPS[f]];
    const wrist = landmarks[0];

    if (f === 0) {
      // thumb: distance from index MCP, relative to hand scale
      const thumbExt = dist(tip, mcp) / s;
      const ext = Math.min(1, thumbExt / 1.6);
      extensions.push(ext);
      fingersUp.push(hystUp(prev?.fingersUp[f] ?? false, ext));
    } else {
      const tipW = dist(tip, wrist);
      const pipW = dist(pip, wrist);
      const ratio = tipW / Math.max(pipW, 1e-4);
      const ext = Math.min(1, Math.max(0, (ratio - 0.9) / 0.6));
      extensions.push(ext);
      fingersUp.push(hystUp(prev?.fingersUp[f] ?? false, ext));
    }
  }

  const pinchDistance = dist(landmarks[4], landmarks[8]) / s;

  const tips = [4, 8, 12, 16, 20];
  let spreadSum = 0;
  let pairs = 0;
  for (let i = 0; i < tips.length; i++) {
    for (let j = i + 1; j < tips.length; j++) {
      spreadSum += dist(landmarks[tips[i]], landmarks[tips[j]]);
      pairs++;
    }
  }

  const rollAngle = Math.atan2(
    landmarks[9].x - landmarks[0].x,
    landmarks[0].y - landmarks[9].y,
  );

  const out: HandFeatures = {
    extensions,
    fingersUp,
    pinchDistance,
    spread: spreadSum / pairs / s,
    rollAngle,
    handSize: s,
    thumbDy: (landmarks[THUMB_TIP].y - landmarks[WRIST].y) / s,
    palmCenter,
    velocity: { x: 0, y: 0 },
    rollVelocity: 0,
  };

  if (prev && dt > 0) {
    const a = 0.4;
    out.velocity = {
      x: prev.velocity.x * (1 - a) + ((palmCenter.x - prev.palmCenter.x) / dt) * a,
      y: prev.velocity.y * (1 - a) + ((palmCenter.y - prev.palmCenter.y) / dt) * a,
    };
    out.rollVelocity = prev.rollVelocity * (1 - a) + (angleDelta(prev.rollAngle, rollAngle) / dt) * a;
  }
  return out;
}

/**
 * Classify a static gesture from finger pattern.
 * up = [thumb, index, middle, ring, pinky]
 *
 * ORDER MATTERS: the weird/specific combos are checked FIRST — they are small,
 * precise shapes that generic "count the fingers" rules would otherwise swallow
 * (e.g. thumb+pinky folded near each other reads as "three" if counts run
 * first). Only when no signature matches do we fall through to count-based
 * poses. Each specific case also takes the feature vector so shape (not just
 * finger pattern) can disambiguate: ok vs pinch, thumbUp vs thumbDown.
 */
export function classifyGesture(f: HandFeatures): GestureMatch {
  const up = f.fingersUp;
  const count = up.filter(Boolean).length;
  const [t, i, m, r, p] = up;

  // --- weird shapes first -----------------------------------------------
  // Full hand and full fist short-circuit before the specific shapes: the
  // "ok" signature (thumb+index+pinky) is a subset of openPalm, so the open
  // hand must be checked first or it reads as ok.
  if (count === 5) return { gesture: 'openPalm', confidence: 0.96 };
  if (count === 0) return { gesture: 'fist', confidence: 0.95 };

  // OK: thumb+index form a ring, pinky extended, and NOT all five up.
  if (t && i && p && !m && !r) return { gesture: 'ok', confidence: 0.9 };
  if (t && i && p && (m || r)) return { gesture: 'ok', confidence: 0.85 };

  // Pinch: thumb+index touching, middle/ring/pinky NOT all up. Distinguish
  // from OK by the pinch distance: closed = pinch, open with pinky out = ok.
  if (t && i && !m && !r && !p) {
    return f.pinchDistance < 0.25
      ? { gesture: 'pinch', confidence: 0.9 }
      : { gesture: 'none', confidence: 0.4 };
  }

  // Rock/horns: thumb+pinky only.
  if (t && p && !i && !m && !r) return { gesture: 'rock', confidence: 0.9 };

  // Thumb alone: orientation picks thumbs-up vs thumbs-down. Primary signal
  // is thumb-tip height vs the wrist (DATASET-GROUNDED 2026-10-05: on real
  // HaGRID thumbs-up samples the tip sits 1.07-2.25 hand-units ABOVE the wrist
  // 100% of the time; thumbs-down sits ~1.2 below). The palm-roll proxy stays
  // as the fallback for hands tilted past the vertical regime; ties default
  // to thumbUp (classic "liked" pose).
  if (t && !i && !m && !r && !p) {
    const thumbDown = f.thumbDy > -0.6 || Math.abs(f.rollAngle) > 2.2;
    return thumbDown
      ? { gesture: 'thumbDown', confidence: 0.85 }
      : { gesture: 'thumbUp', confidence: 0.9 };
  }

  // --- generic count-based poses ----------------------------------------
  if (i && m && r && p && !t) return { gesture: 'four', confidence: 0.92 };
  if (i && m && r && !p) return { gesture: 'three', confidence: 0.92 };
  if (i && m && !r && !p) return { gesture: 'peace', confidence: 0.93 };
  if (i && !m && !r && !p) return { gesture: 'point', confidence: 0.94 };

  return { gesture: 'none', confidence: 0 };
}
