import { describe, it, expect } from 'vitest';
import { extractFeatures, classifyGesture, handScale } from '../src/handTracking/gestureRecognizer';
import {
  newGestureState,
  updateGestureState,
  detectMotion,
  resetGestureState,
} from '../src/handTracking/gestureSmoothing';
import { chordNoteNames, chordLabel, noteToMidi } from '../src/audio/chords';
import { instantJamMapping, describeAction } from '../src/audio/mappings';

// Synthetic landmark generator: builds a plausible 21-point hand.
// fingers: array of 5 extension factors 0=curlled 1=extended
function makeLandmarks(fingers: number[], spread = 1) {
  const lms: { x: number; y: number }[] = [];
  const wrist = { x: 0.5, y: 0.8 };
  lms.push(wrist);
  // thumb: f0=1 -> extended out to the side; f0=0 -> tucked against palm
  const f0 = fingers[0];
  lms.push({ x: 0.42, y: 0.72 });
  lms.push({ x: 0.40, y: 0.68 });
  lms.push({ x: 0.36, y: 0.60 - 0.03 * f0 });
  lms.push({ x: 0.38 - 0.08 * f0, y: 0.63 - 0.15 * f0 });
  const mcpX = [0.44, 0.50, 0.55, 0.60];
  for (let f = 1; f < 5; f++) {
    const ext = fingers[f];
    const bx = mcpX[f - 1];
    lms.push({ x: bx, y: 0.60 });                                    // MCP
    lms.push({ x: bx + 0.01 * spread, y: 0.54 - 0.04 * ext });       // PIP
    lms.push({ x: bx + 0.015 * spread, y: 0.50 - 0.10 * ext });      // DIP
    lms.push({ x: bx + 0.02 * spread, y: 0.58 - 0.22 * ext });       // TIP
  }
  return lms;
}

const G = (...f: number[]) => classifyGesture(extractFeatures(makeLandmarks(f))).gesture;

describe('gesture classification from synthetic landmarks', () => {
  it('open palm (all fingers extended)', () => {
    expect(G(1, 1, 1, 1, 1)).toBe('openPalm');
  });
  it('fist (all curled)', () => {
    expect(G(0, 0, 0, 0, 0)).toBe('fist');
  });
  it('point (index only)', () => {
    expect(G(0, 1, 0, 0, 0)).toBe('point');
  });
  it('peace (index+middle)', () => {
    expect(G(0, 1, 1, 0, 0)).toBe('peace');
  });
  it('three (index+middle+ring)', () => {
    expect(G(0, 1, 1, 1, 0)).toBe('three');
  });
  it('four (four fingers, no thumb)', () => {
    expect(G(0, 1, 1, 1, 1)).toBe('four');
  });
});

describe('feature extraction', () => {
  it('handScale is positive and stable', () => {
    const s1 = handScale(makeLandmarks([1, 1, 1, 1, 1]));
    expect(s1).toBeGreaterThan(0);
  });
  it('pinch distance shrinks when thumb+index tips converge', () => {
    const open = extractFeatures(makeLandmarks([1, 1, 1, 1, 1]));
    // custom landmarks with tips touching
    const lms = makeLandmarks([1, 1, 0, 0, 0]);
    lms[4] = lms[8]; // thumb tip = index tip
    const pinched = extractFeatures(lms);
    expect(pinched.pinchDistance).toBeLessThan(open.pinchDistance);
  });
  it('normalizes by hand size (resolution independent)', () => {
    const a = extractFeatures(makeLandmarks([1, 1, 1, 1, 1]));
    const b = extractFeatures(makeLandmarks([1, 1, 1, 1, 1], 1.3));
    expect(a.fingersUp).toEqual(b.fingersUp);
  });
});

describe('gesture state machine', () => {
  it('requires stability window before activation', () => {
    const st = newGestureState();
    const match = { gesture: 'openPalm' as const, confidence: 0.95 };
    const cfg = { stabilityMs: 150, cooldownMs: 300, confidenceThreshold: 0.75, motionVelocityThreshold: 1 };
    expect(updateGestureState(st, match, 0, cfg)).toBeNull();
    expect(updateGestureState(st, match, 100, cfg)).toBeNull();
    expect(updateGestureState(st, match, 160, cfg)).toBe('openPalm');
  });
  it('does not retrigger while sustained', () => {
    const st = newGestureState();
    const match = { gesture: 'fist' as const, confidence: 0.95 };
    const cfg = { stabilityMs: 100, cooldownMs: 300, confidenceThreshold: 0.75, motionVelocityThreshold: 1 };
    updateGestureState(st, match, 0, cfg);
    updateGestureState(st, match, 120, cfg);
    expect(updateGestureState(st, match, 200, cfg)).toBeNull();
  });
  it('low confidence blocks activation', () => {
    const st = newGestureState();
    const out = updateGestureState(st, { gesture: 'openPalm', confidence: 0.3 }, 500, { stabilityMs: 100, cooldownMs: 300, confidenceThreshold: 0.75, motionVelocityThreshold: 1 });
    expect(out).toBeNull();
    expect(st.activeGesture).toBeNull();
  });
  it('gesture change resets stability clock', () => {
    const st = newGestureState();
    const cfg = { stabilityMs: 100, cooldownMs: 300, confidenceThreshold: 0.75, motionVelocityThreshold: 1 };
    expect(updateGestureState(st, { gesture: 'openPalm', confidence: 0.9 }, 0, cfg)).toBeNull();
    expect(updateGestureState(st, { gesture: 'openPalm', confidence: 0.9 }, 150, cfg)).toBe('openPalm');
    expect(updateGestureState(st, { gesture: 'peace', confidence: 0.9 }, 160, cfg)).toBeNull();
    expect(updateGestureState(st, { gesture: 'peace', confidence: 0.9 }, 200, cfg)).toBeNull();
    expect(updateGestureState(st, { gesture: 'peace', confidence: 0.9 }, 280, cfg)).toBe('peace');
  });
  it('resetGestureState clears everything', () => {
    const st = newGestureState();
    updateGestureState(st, { gesture: 'fist', confidence: 0.95 }, 0, { stabilityMs: 50, cooldownMs: 300, confidenceThreshold: 0.75, motionVelocityThreshold: 1 });
    resetGestureState(st);
    expect(st.activeGesture).toBeNull();
    expect(st.detectedGesture).toBe('none');
  });
});

describe('motion detection', () => {
  const mkFeatures = (x: number) => ({
    palmCenter: { x, y: 0.5 },
    velocity: { x: 0, y: 0 },
    rollAngle: 0,
    rollVelocity: 0,
    extensions: [],
    fingersUp: [],
    pinchDistance: 0,
    spread: 0,
    handSize: 0.1,
  });
  const cfg = { stabilityMs: 100, cooldownMs: 300, confidenceThreshold: 0.75, motionVelocityThreshold: 0.5 };
  const t0 = 1000;

  it('detects a right swipe', () => {
    const st = newGestureState();
    st.motionHistory.push({ x: 0.3, y: 0.5, t: t0 });
    st.motionHistory.push({ x: 0.5, y: 0.5, t: t0 + 150 });
    // current frame is passed as features (detectMotion appends it)
    expect(detectMotion(st, mkFeatures(0.7), t0 + 300, cfg)).toBe('swipeRight');
  });
  it('ignores slow drift', () => {
    const st = newGestureState();
    const strict = { ...cfg, motionVelocityThreshold: 5 };
    st.motionHistory.push({ x: 0.30, y: 0.5, t: t0 });
    st.motionHistory.push({ x: 0.31, y: 0.5, t: t0 + 150 });
    expect(detectMotion(st, mkFeatures(0.32), t0 + 300, strict)).toBeNull();
  });
});

describe('chords', () => {
  it('C major = C4 E4 G4 at octave 4', () => {
    expect(chordNoteNames({ root: 'C', type: 'major' }, 4)).toEqual(['C4', 'E4', 'G4']);
  });
  it('A minor root lands in the base octave', () => {
    expect(chordNoteNames({ root: 'A', type: 'minor' }, 4)).toEqual(['A4', 'C5', 'E5']);
  });
  it('Cmaj7 has 4 notes', () => {
    expect(chordNoteNames({ root: 'C', type: 'maj7' }, 4)).toHaveLength(4);
  });
  it('labels', () => {
    expect(chordLabel({ root: 'F', type: 'major' })).toBe('F');
    expect(chordLabel({ root: 'A', type: 'minor' })).toBe('Am');
    expect(chordLabel({ root: 'G', type: 'dom7' })).toBe('G7');
  });
  it('midi numbering C4=60', () => {
    expect(noteToMidi('C', 4)).toBe(60);
  });
});

describe('mappings', () => {
  it('instant jam preset has chords on both hands and stop on fist', () => {
    const l = instantJamMapping('left');
    const r = instantJamMapping('right');
    expect(l.openPalm?.kind).toBe('chord');
    expect(r.openPalm?.kind).toBe('chord');
    expect(l.fist?.kind).toBe('stop');
    expect(r.fist?.kind).toBe('stop');
  });
  it('describeAction formats chords', () => {
    expect(describeAction({ kind: 'chord', chord: { root: 'C', type: 'major' } })).toBe('C');
  });
});
