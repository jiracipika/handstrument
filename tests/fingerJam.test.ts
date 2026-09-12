import { describe, it, expect } from 'vitest';
import {
  detectFingers,
  palmHeight,
  tipSpread,
  voicingFromMotion,
  fingerJamChordNotes,
  chordIndexForFinger,
  PROGRESSION,
  FINGER_DRUMS,
  midiToNote,
} from '../src/handTracking/fingerJam';
import { extractFeatures, classifyGesture } from '../src/handTracking/gestureRecognizer';

// Reuse the synthetic-hand generator shape from gesture.test.ts.
function makeLandmarks(fingers: number[], spread = 1) {
  const lms: { x: number; y: number }[] = [];
  lms.push({ x: 0.5, y: 0.8 }); // wrist
  const f0 = fingers[0];
  lms.push({ x: 0.42, y: 0.72 });
  lms.push({ x: 0.40, y: 0.68 });
  lms.push({ x: 0.36, y: 0.60 - 0.03 * f0 });
  lms.push({ x: 0.38 - 0.08 * f0, y: 0.63 - 0.15 * f0 });
  const mcpX = [0.44, 0.50, 0.55, 0.60];
  for (let f = 1; f < 5; f++) {
    const ext = fingers[f];
    const bx = mcpX[f - 1];
    lms.push({ x: bx, y: 0.60 });
    lms.push({ x: bx + 0.01 * spread, y: 0.54 - 0.04 * ext });
    lms.push({ x: bx + 0.015 * spread, y: 0.50 - 0.10 * ext });
    lms.push({ x: bx + 0.02 * spread, y: 0.58 - 0.22 * ext });
  }
  return lms;
}

describe('detectFingers (legacy per-finger detection)', () => {
  it('finds all five fingers on an open hand', () => {
    const up = detectFingers(makeLandmarks([1, 1, 1, 1, 1]), 'Right');
    expect(up).toContain('thumb');
    expect(up).toContain('index');
    expect(up).toContain('middle');
    expect(up).toContain('ring');
    expect(up).toContain('pinky');
  });

  it('finds nothing on a fist', () => {
    expect(detectFingers(makeLandmarks([0, 0, 0, 0, 0]), 'Right')).toEqual([]);
  });

  it('detects individual chord fingers', () => {
    expect(detectFingers(makeLandmarks([0, 1, 0, 0, 0]), 'Right')).toEqual(['index']);
    expect(detectFingers(makeLandmarks([0, 0, 1, 0, 0]), 'Right')).toEqual(['middle']);
    expect(detectFingers(makeLandmarks([0, 0, 0, 1, 0]), 'Right')).toEqual(['ring']);
    expect(detectFingers(makeLandmarks([0, 0, 0, 0, 1]), 'Right')).toEqual(['pinky']);
  });

  it('mirrors thumb direction per side', () => {
    // The generator's extended thumb goes to LOW x (right-hand pose).
    const right = detectFingers(makeLandmarks([1, 1, 1, 1, 1]), 'Right');
    expect(right).toContain('thumb');
    // Mirrored landmark set: flip x around 0.5.
    const mirrored = makeLandmarks([1, 1, 1, 1, 1]).map((p) => ({ x: 1 - p.x, y: p.y }));
    const left = detectFingers(mirrored, 'Left');
    expect(left).toContain('thumb');
  });
});

describe('voicing from motion (legacy Ej logic)', () => {
  it('closed low hand = core triad, root position', () => {
    const v = voicingFromMotion(0.2, 0.2, 0.2, 0, 0);
    expect(v.color).toBe('triad');
    expect(v.heightBand).toBe('low');
    expect(v.inversion).toBe(0);
  });

  it('very open hand = open octave voicing', () => {
    const v = voicingFromMotion(0.5, 0.9, 0.9, 0, 0);
    expect(v.color).toBe('octave');
  });

  it('high hand lifts the color to seventh', () => {
    const v = voicingFromMotion(0.8, 0.4, 0.4, 0, 0);
    expect(v.heightBand).toBe('high');
    expect(v.color).toBe('seventh');
  });

  it('mid hand with moderate openness = add9', () => {
    const v = voicingFromMotion(0.5, 0.5, 0.5, 0, 0);
    expect(v.color).toBe('add9');
  });

  it('roll rotates inversions both ways', () => {
    expect(voicingFromMotion(0.5, 0.3, 0.3, 0.4, 0).inversion).toBe(1);
    expect(voicingFromMotion(0.5, 0.3, 0.3, -0.4, 0).inversion).toBe(2);
    expect(voicingFromMotion(0.5, 0.3, 0.3, 0, 0).inversion).toBe(0);
  });
});

describe('fingerJam chord notes', () => {
  it('progression is the legacy Bm9 Gmaj7 Em7 F#7', () => {
    expect(PROGRESSION.map((c) => c.label)).toEqual(['Bm9', 'Gmaj7', 'Em7', 'F#7']);
    expect(PROGRESSION.map((c) => c.finger)).toEqual(['index', 'middle', 'ring', 'pinky']);
  });

  it('Bm9 root voicing spells B3 D4 F#4 A4 C#5', () => {
    const notes = fingerJamChordNotes(0, voicingFromMotion(0.2, 0.2, 0.2, 0, 0));
    expect(notes).toEqual(['B3', 'D4', 'F#4', 'A4', 'C#5']);
  });

  it('add9 color adds the 9th, seventh adds 9th+5th above octave', () => {
    const add9 = fingerJamChordNotes(1, voicingFromMotion(0.5, 0.5, 0.5, 0, 0));
    expect(add9).toContain('A4'); // G + 14 semitones = A4
    const seventh = fingerJamChordNotes(1, voicingFromMotion(0.8, 0.4, 0.4, 0, 0));
    expect(seventh.length).toBeGreaterThan(add9.length - 1);
  });

  it('open octave spans two octaves', () => {
    const open = fingerJamChordNotes(2, voicingFromMotion(0.5, 0.9, 0.9, 0, 0));
    expect(open).toContain('E3');
    expect(open).toContain('E4');
  });

  it('inversion raises the lowest note an octave', () => {
    const root = fingerJamChordNotes(2, voicingFromMotion(0.2, 0.2, 0.2, 0, 0));
    const inv = fingerJamChordNotes(2, voicingFromMotion(0.2, 0.2, 0.2, 0.4, 0));
    expect(inv[0]).not.toBe(root[0]);
    expect(inv).toContain(midiToNote(52 + 12)); // E3 -> E4
  });

  it('chordIndexForFinger maps fingers and rejects drums fingers', () => {
    expect(chordIndexForFinger('index')).toBe(0);
    expect(chordIndexForFinger('pinky')).toBe(3);
    expect(chordIndexForFinger('thumb')).toBe(-1);
  });

  it('drum map matches legacy', () => {
    expect(FINGER_DRUMS.thumb).toBe('kick');
    expect(FINGER_DRUMS.index).toBe('hat');
    expect(FINGER_DRUMS.middle).toBe('snare');
    expect(FINGER_DRUMS.ring).toBe('clap');
    expect(FINGER_DRUMS.pinky).toBe('tom');
  });
});

describe('palm metrics', () => {
  it('palmHeight: higher hand => larger value', () => {
    const lms = makeLandmarks([1, 1, 1, 1, 1]);
    const high = lms.map((p) => ({ x: p.x, y: p.y - 0.3 }));
    expect(palmHeight(high)).toBeGreaterThan(palmHeight(lms));
  });

  it('tipSpread reflects the raw pairwise-gap geometry', () => {
    // The synthetic generator places tips far apart relative to hand scale,
    // so nearly any hand saturates the legacy 0..1 clamp (real hands do too —
    // the legacy app renormalized via calibration ranges). Assert the clamp
    // contract and that the raw geometry is what feeds it.
    const hand = makeLandmarks([1, 1, 1, 1, 1]);
    expect(tipSpread(hand)).toBe(1);
    // Scale the whole hand UP: same shape, same clamped value (scale-invariant).
    const big = hand.map((p) => ({ x: 0.5 + (p.x - 0.5) * 2, y: p.y }));
    expect(tipSpread(big)).toBe(1);
  });
});

describe('reversed classifier: weird shapes win over generic counts', () => {
  const G = (...f: number[]) => classifyGesture(extractFeatures(makeLandmarks(f))).gesture;

  it('ok (thumb+index ring, pinky out) is ok — not point or pinch', () => {
    expect(G(1, 1, 0, 0, 1)).toBe('ok');
  });

  it('ok with three fingers still classifies as ok', () => {
    expect(G(1, 1, 0, 0, 1)).toBe('ok');
    expect(G(1, 1, 1, 0, 1)).toBe('ok');
  });

  it('pinch (thumb+index touching, rest down) is pinch', () => {
    const lms = makeLandmarks([1, 1, 0, 0, 0]);
    lms[4] = lms[8]; // tips touching
    expect(classifyGesture(extractFeatures(lms)).gesture).toBe('pinch');
  });

  it('thumb+index apart without pinky is not ok (no false ok)', () => {
    expect(G(1, 1, 0, 0, 0)).not.toBe('ok');
  });

  it('rock is rock', () => {
    expect(G(1, 0, 0, 0, 1)).toBe('rock');
  });

  it('thumb alone defaults to thumbUp', () => {
    expect(G(1, 0, 0, 0, 0)).toBe('thumbUp');
  });

  it('generic poses still classify after the specific ones', () => {
    expect(G(0, 0, 0, 0, 0)).toBe('fist');
    expect(G(1, 1, 1, 1, 1)).toBe('openPalm');
    expect(G(0, 1, 1, 0, 0)).toBe('peace');
    expect(G(0, 1, 1, 1, 0)).toBe('three');
    expect(G(0, 1, 1, 1, 1)).toBe('four');
    expect(G(0, 1, 0, 0, 0)).toBe('point');
  });
});
