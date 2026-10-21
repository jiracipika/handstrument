import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extractFeatures, classifyGesture } from '../src/handTracking/gestureRecognizer';
import fixture from './fixtures/hagrid-fixture-v1.json';

// DATASET REGRESSION (2026-10-21): the classifier was re-derived against real
// HaGRID hands (60 photos/class; full eval: `npx tsx scripts/eval-dataset.mjs`,
// 872/960 = 90.8% after the rewrite, was 43.8%). This suite pins a committed
// 90-sample subset (every 12th dataset row) so a threshold tweak that helps
// synthetic poses but breaks real hands fails CI.
//
// HaGRID class -> expected handstrument gesture (null = skip).
const EXPECT: Record<string, string | null> = {
  palm: 'openPalm', stop: 'openPalm', stop_inverted: 'openPalm',
  fist: 'fist',
  peace: 'peace', peace_inverted: 'peace',
  two_up: 'peace', two_up_inverted: 'peace',
  one: 'point',
  ok: 'ok',
  like: 'thumbUp', dislike: 'thumbDown',
  rock: 'rock', call: 'rock',
  three2: 'three',
  four: 'four',
  three: null,
  mute: null,
};

const rows = fixture as { c: string; lm: [number, number][] }[];
const judged = rows.filter((r) => EXPECT[r.c] !== null && EXPECT[r.c] !== undefined);

describe('real-hand classification (HaGRID fixture)', () => {
  it('overall accuracy floor holds on real hands', () => {
    let hit = 0;
    for (const r of judged) {
      const got = classifyGesture(extractFeatures(r.lm.map(([x, y]) => ({ x, y })))).gesture;
      if (got === EXPECT[r.c]) hit++;
    }
    // 90.8% full-set; subset runs slightly above — floor leaves regression headroom
    expect(hit / judged.length).toBeGreaterThanOrEqual(0.85);
  });

  it('the thumb poses that used to read "fist"/"four" now classify', () => {
    const acc = (cls: string, want: string) =>
      judged.filter((r) => r.c === cls)
        .filter((r) => classifyGesture(extractFeatures(r.lm.map(([x, y]) => ({ x, y })))).gesture === want).length;
    expect(acc('like', 'thumbUp')).toBeGreaterThanOrEqual(4); // was 0-1/5 pre-rewrite
    expect(acc('palm', 'openPalm')).toBeGreaterThanOrEqual(4); // was 0/5 ("four")
    expect(acc('stop', 'openPalm')).toBeGreaterThanOrEqual(4); // was 0/5 ("four")
    expect(acc('ok', 'ok')).toBeGreaterThanOrEqual(4); // was 0/5 ("none")
    expect(acc('call', 'rock')).toBeGreaterThanOrEqual(4); // was 0-1/5
  });

  it('curled-thumb poses still read fist, not thumb gestures', () => {
    const acc = (cls: string, want: string) =>
      judged.filter((r) => r.c === cls)
        .filter((r) => classifyGesture(extractFeatures(r.lm.map(([x, y]) => ({ x, y })))).gesture === want).length;
    expect(acc('fist', 'fist')).toBeGreaterThanOrEqual(4);
    expect(acc('one', 'point')).toBeGreaterThanOrEqual(4);
    expect(acc('peace', 'peace')).toBeGreaterThanOrEqual(4);
  });
});
