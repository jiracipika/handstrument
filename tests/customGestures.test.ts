import { describe, it, expect, beforeEach } from 'vitest';
import {
  trainCustomGesture,
  classifyCustom,
  listCustomGestures,
  deleteCustomGesture,
} from '../src/handTracking/customGestures';
import { extractFeatures } from '../src/handTracking/gestureRecognizer';

function makeLandmarks(fingers: number[], spread = 1) {
  const lms: { x: number; y: number }[] = [];
  lms.push({ x: 0.5, y: 0.8 });
  lms.push({ x: 0.42, y: 0.72 });
  lms.push({ x: 0.4, y: 0.68 });
  lms.push({ x: 0.36, y: 0.6 - 0.03 * fingers[0] });
  lms.push({ x: 0.38 - 0.08 * fingers[0], y: 0.63 - 0.15 * fingers[0] });
  const mcpX = [0.44, 0.5, 0.55, 0.6];
  for (let f = 1; f < 5; f++) {
    const ext = fingers[f];
    const bx = mcpX[f - 1];
    lms.push({ x: bx, y: 0.6 });
    lms.push({ x: bx + 0.01 * spread, y: 0.54 - 0.04 * ext });
    lms.push({ x: bx + 0.015 * spread, y: 0.5 - 0.1 * ext });
    lms.push({ x: bx + 0.02 * spread, y: 0.58 - 0.22 * ext });
  }
  return lms;
}

// A synthetic open palm and a synthetic fist as feature batches with jitter.
function featuresFor(fingers: number[], jitter = 0): ReturnType<typeof extractFeatures> {
  const lm = makeLandmarks(fingers).map((p) => ({
    x: p.x + (Math.random() - 0.5) * jitter,
    y: p.y + (Math.random() - 0.5) * jitter,
  }));
  return extractFeatures(lm, undefined, 1 / 15);
}

const PALM = [1, 1, 1, 1, 1];
const FIST = [0, 0, 0, 0, 0];

describe('custom gesture KNN', () => {
  beforeEach(() => {
    for (const g of listCustomGestures()) deleteCustomGesture(g.id);
  });

  it('trains and recognizes the trained pose', () => {
    const palmExamples = Array.from({ length: 6 }, () => featuresFor(PALM, 0.01));
    const id = trainCustomGesture('flat-palm', palmExamples);
    expect(id).toBe('custom:flat-palm');

    const probe = featuresFor(PALM, 0.01);
    const hit = classifyCustom(probe);
    expect(hit).not.toBeNull();
    expect(hit!.id).toBe('custom:flat-palm');
  });

  it('rejects untrained poses (fist vs palm exemplars)', () => {
    const palmExamples = Array.from({ length: 6 }, () => featuresFor(PALM, 0.01));
    trainCustomGesture('flat-palm', palmExamples);
    const fist = classifyCustom(featuresFor(FIST, 0.01));
    // Either rejected (null) or matches at a clearly worse distance than a
    // palm would; both behaviors are acceptable, but it must not be a
    // high-confidence palm match.
    if (fist) {
      expect(fist.id).toBe('custom:flat-palm');
      expect(fist.dist).toBeGreaterThan(1.5);
    }
  });

  it('needs at least 3 examples', () => {
    expect(() => trainCustomGesture('tiny', [featuresFor(PALM)])).toThrow();
  });

  it('deleting removes it from the registry', () => {
    trainCustomGesture('temp', Array.from({ length: 4 }, () => featuresFor(PALM, 0.01)));
    expect(listCustomGestures().some((g) => g.name === 'temp')).toBe(true);
    deleteCustomGesture('custom:temp');
    expect(listCustomGestures().some((g) => g.name === 'temp')).toBe(false);
  });
});
