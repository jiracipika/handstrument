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
      extensions.push(Math.min(1, thumbExt / 1.6));
      fingersUp.push(thumbExt > 1.0);
    } else {
      const tipW = dist(tip, wrist);
      const pipW = dist(pip, wrist);
      const ratio = tipW / Math.max(pipW, 1e-4);
      extensions.push(Math.min(1, Math.max(0, (ratio - 0.9) / 0.6)));
      fingersUp.push(ratio > 1.15);
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
 */
export function classifyGesture(f: HandFeatures): GestureMatch {
  const up = f.fingersUp;
  const count = up.filter(Boolean).length;
  const [t, i, m, r, p] = up;

  if (count === 0) return { gesture: 'fist', confidence: 0.95 };

  if (count === 5) return { gesture: 'openPalm', confidence: 0.96 };

  if (i && m && r && p && !t) return { gesture: 'four', confidence: 0.92 };
  if (i && m && r && !p) return { gesture: 'three', confidence: 0.92 };
  if (i && m && !r && !p) return { gesture: 'peace', confidence: 0.93 };
  if (i && !m && !r && !p) return { gesture: 'point', confidence: 0.94 };

  if (t && !i && !m && !r && !p) return { gesture: 'thumbUp', confidence: 0.85 };

  if (t && i && !m && !r && !p) {
    return f.pinchDistance < 0.25
      ? { gesture: 'pinch', confidence: 0.9 }
      : { gesture: 'none', confidence: 0.4 };
  }

  if (t && p && !i && !m && !r) return { gesture: 'rock', confidence: 0.9 };

  if (t && i && m && r && p) {
    return { gesture: 'openPalm', confidence: 0.96 };
  }

  return { gesture: 'none', confidence: 0 };
}
