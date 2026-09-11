/**
 * Teachable custom gestures: record exemplar feature vectors for a gesture,
 * recognize later with nearest-neighbor matching over normalized features.
 *
 * Why KNN and not an MLP: hand features are a tiny 12-dim bounded vector,
 * exemplars are captured in-browser in seconds, and nearest-neighbor needs
 * no training pass — capture and it works.
 *
 * Distance: raw feature space with fixed per-dimension weights (features are
 * already resolution-independent and bounded ~0..2). Z-normalization across
 * a single-class corpus makes std≈0 and amplifies capture jitter, so it is
 * deliberately avoided here.
 */
import type { GestureId, HandFeatures } from '../types';

const LS_KEY = 'handstrument:custom-gestures:v1';

// Per-dimension weights: finger extensions (0..1) are the most discriminative
// signal; derived continuous features get smaller weights so no single one
// dominates. Order matches featureVector().
const W = [
  1.0, 1.0, 1.0, 1.0, 1.0, // extensions
  0.7, // pinch distance
  0.5, // spread
  0.4, 0.4, // roll sin/cos
  0.6, // hand size
  0.8, 0.8, // palm x/y
];

/** Fixed-order numeric vector from features (length 12). */
export function featureVector(f: HandFeatures): number[] {
  return [
    ...f.extensions.slice(0, 5),
    f.pinchDistance,
    f.spread,
    Math.sin(f.rollAngle),
    Math.cos(f.rollAngle),
    f.handSize,
    f.palmCenter.x,
    f.palmCenter.y,
  ];
}

export interface CustomGestureExample {
  v: number[];
}

export interface CustomGestureDef {
  id: string; // "custom:<name>"
  name: string;
  examples: CustomGestureExample[];
}

interface Store {
  gestures: CustomGestureDef[];
}

let cache: Store = load();

function load(): Store {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Store) : { gestures: [] };
  } catch {
    return { gestures: [] };
  }
}

function persist(): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(cache));
  } catch {
    /* storage unavailable */
  }
}

export function listCustomGestures(): CustomGestureDef[] {
  return cache.gestures;
}

export function getCustomGesture(id: string): CustomGestureDef | undefined {
  return cache.gestures.find((g) => g.id === id);
}

export function deleteCustomGesture(id: string): void {
  cache = { gestures: cache.gestures.filter((g) => g.id !== id) };
  persist();
}

/** Weighted RMS distance between two feature vectors (0..~1.4 typical). */
export function gestureDistance(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < W.length; i++) {
    const d = (a[i] - b[i]) * W[i];
    s += d * d;
  }
  return Math.sqrt(s / W.length);
}

/**
 * Capture examples for a new gesture. Examples are stored raw; no corpus
 * normalization (see module doc).
 */
export function trainCustomGesture(name: string, examples: HandFeatures[]): GestureId {
  if (examples.length < 3) throw new Error('Need at least 3 examples');
  const id: GestureId = `custom:${name}`;
  // Replace an existing gesture with the same name (re-train).
  const gestures = cache.gestures.filter((g) => g.id !== id);
  cache = {
    gestures: [
      ...gestures,
      { id, name, examples: examples.map((f) => ({ v: featureVector(f) })) },
    ],
  };
  persist();
  return id;
}

/**
 * Classify against taught gestures. Returns the nearest exemplar's gesture
 * or null when nothing is trained or the match exceeds the reject radius.
 */
export function classifyCustom(
  f: HandFeatures,
  rejectDist = 0.28,
): { id: GestureId; name: string; dist: number } | null {
  if (cache.gestures.length === 0) return null;
  const v = featureVector(f);
  let best: { id: GestureId; name: string; dist: number } | null = null;
  for (const g of cache.gestures) {
    for (const e of g.examples) {
      const d = gestureDistance(v, e.v);
      if (!best || d < best.dist) best = { id: g.id as GestureId, name: g.name, dist: d };
    }
  }
  return best && best.dist <= rejectDist ? best : null;
}
