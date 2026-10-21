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

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Hand size reference: wrist -> middle MCP distance. */export function handScale(landmarks: Vec2[]): number {
  return Math.max(dist(landmarks[0], landmarks[9]), 1e-4);
}

/** Thumb reach: thumb-tip to index-MCP distance in palm widths (indexMCP->pinkyMCP).
 * Dataset-grounded (HaGRID 60/class, 2026-10-21): curled-thumb poses measure
 * 0.16-0.66 p90 (fist 0.38, one 0.36, peace 0.60), extended-thumb poses
 * 0.83+ p10 (like 0.83, dislike 0.93, ok 1.08, palm 1.14). The previous
 * dist(thumbTip, thumbCMC)/handScale feature never crossed its "up" threshold
 * on real hands (real-thumb p90 0.60 vs the 0.8 cutoff) so the thumb read
 * down on nearly every real pose. */
export function thumbOut(landmarks: Vec2[]): number {
  const palmWidth = Math.max(dist(landmarks[5], landmarks[17]), 1e-4);
  return dist(landmarks[4], landmarks[5]) / palmWidth;
}

/** Thumb-tip to palm-center (middle MCP) distance in palm widths. Splits the
 * all-four-fingers-up pattern: "four" folds the thumb OVER the palm (p90
 * 0.66) while open-palm/stop hands keep it to the side (palm p10 1.31, stop
 * p10 0.69). Boundary 0.68. */
export function thumbToCenter(landmarks: Vec2[]): number {
  const palmWidth = Math.max(dist(landmarks[5], landmarks[17]), 1e-4);
  return dist(landmarks[4], landmarks[9]) / palmWidth;
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

/**
 * Thumb Schmitt trigger over the thumbOut reach metric (not raw extension —
 * real thumbs sit on a continuum; the metric above has dataset margins).
 * ON above 0.78, OFF below 0.62 (fist p90 0.66 vs like/dislike p10 0.83 —
 * the cold threshold sits closer to the extended side because a missed
 * thumbs-up that reads "fist" is the costlier live mistake).
 */
function thumbHyst(wasUp: boolean, reach: number): boolean {
  return wasUp ? reach > 0.62 : reach > 0.78;
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
    const wrist = landmarks[0];

    if (f === 0) {
      // thumb: reach metric (see thumbOut), hysteresis in palm-width units
      const ext = Math.min(1, thumbOut(landmarks) / 1.6);
      extensions.push(ext);
      fingersUp.push(thumbHyst(prev?.fingersUp[f] ?? false, thumbOut(landmarks)));
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
    thumbOut: thumbOut(landmarks),
    thumbToCenter: thumbToCenter(landmarks),
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
 * Classify a static gesture from the finger pattern + thumb reach.
 * up = [thumb, index, middle, ring, pinky]
 *
 * DATASET-GROUNDED 2026-10-21 (HaGRID, 60 real photos/class, 18 classes):
 * rules key off the LONG-FINGER up-pattern (IMRP) and use measured feature
 * margins for the ambiguous splits. The previous hand-authored rules misread
 * real hands at 43.8%: the old thumb feature never fired (open palms read
 * "four", thumbs-up read "fist"), the 👌 was authored as thumb+index+pinky
 * when real OK hands are ring + middle/ring/pinky up, and "rock" was authored
 * thumb+pinky when real horns show index+pinky.
 *
 * Rule thresholds vs measured p10/p90 (thumbOut / thumbToCenter / pinchDistance / thumbDy):
 *   - 1111 split (four vs openPalm): thumb-tip→palm-center reach; four p90
 *     0.66 < 0.68 ≤ stop p10 0.69 / palm p10 1.31. This RESCUES HaGRID "stop"
 *     (open hand, thumb adducted), which no thumbOut threshold could separate.
 *   - 1100 split (peace vs thumb-out three): thumbOut; peace family p90 0.89
 *     vs thumb-three (HaGRID three2) p50 1.05, boundary 0.95.
 *   - 0000 split (fist vs thumb gesture): thumbOut; fist p90 0.66 vs
 *     like/dislike p10 0.83 (also the thumb hysteresis band 0.62/0.78).
 *   - thumbUp vs thumbDown: thumbDy (likes ≤ -1.23 p90, dislikes ≥ +0.98
 *     p10), boundary -0.6, roll proxy as fallback; ties default thumbUp.
 *   - 👌 confirmation: pinchDistance < 0.4 (ok class p90 0.23).
 */
export function classifyGesture(f: HandFeatures): GestureMatch {
  const up = f.fingersUp;
  const [t, i, m, r, p] = up;
  // long-finger pattern, index/middle/ring/pinky — the primary signal
  const pat = `${+i}${+m}${+r}${+p}`;
  const reach = f.thumbOut ?? 0;

  switch (pat) {
    case '1111':
      // all four long fingers up: thumb folded over the palm = four, thumb
      // out to the side = open palm (reset pose). Measured on the tip→center
      // metric: four p90 0.66 vs stop p10 0.69 vs palm p10 1.31.
      return f.thumbToCenter >= 0.68
        ? { gesture: 'openPalm', confidence: 0.93 }
        : { gesture: 'four', confidence: 0.92 };
    case '1110':
      // index+middle+ring — the natural "three"
      return { gesture: 'three', confidence: 0.93 };
    case '0111':
      // middle+ring+pinky up = the real 👌 pose (index curled into the ring);
      // require the ring to actually be closed
      return f.pinchDistance < 0.4
        ? { gesture: 'ok', confidence: 0.9 }
        : { gesture: 'none', confidence: 0.4 };
    case '1100':
      // index+middle: peace — unless the thumb is clearly out (thumb-inclusive
      // three), which HaGRID shows is a real, common variant
      return reach >= 0.95
        ? { gesture: 'three', confidence: 0.82 }
        : { gesture: 'peace', confidence: 0.93 };
    case '1001':
      // index+pinky = horns; the thumb holds m/r down or rides along
      return { gesture: 'rock', confidence: 0.9 };
    case '1000':
      // index only: pinch if the thumb is touching, else point
      return f.pinchDistance < 0.25
        ? { gesture: 'pinch', confidence: 0.9 }
        : { gesture: 'point', confidence: 0.94 };
    case '0001':
      // pinky only + thumb out = shaka; without the thumb it's nothing
      return reach >= 0.5
        ? { gesture: 'rock', confidence: 0.85 }
        : { gesture: 'none', confidence: 0.4 };
    case '0000':
      // nothing long up: extended thumb = like/dislike, else fist
      if (t) {
        const thumbDown = f.thumbDy > -0.6 || Math.abs(f.rollAngle) > 2.2;
        return thumbDown
          ? { gesture: 'thumbDown', confidence: 0.85 }
          : { gesture: 'thumbUp', confidence: 0.9 };
      }
      return { gesture: 'fist', confidence: 0.95 };
    default:
      // 0100, 0010, 0011, 1011, ... — no trained pose; stay silent rather
      // than invent a guess
      return { gesture: 'none', confidence: 0 };
  }
}
