// Gesture state machine: stability window, hysteresis, cooldowns, motion gestures.
import type { GestureId, HandFeatures, MotionGestureId } from '../types';
import type { GestureMatch } from '../types';

export interface GestureStateConfig {
  stabilityMs: number; // gesture must hold this long before activating
  cooldownMs: number; // min time between activations of the same gesture
  confidenceThreshold: number;
  motionVelocityThreshold: number; // normalized units/sec
  /** single-frame classification misses tolerated before dropping the active gesture */
  missToleranceMs?: number;
}

export const DEFAULT_STATE_CONFIG: GestureStateConfig = {
  stabilityMs: 180,
  cooldownMs: 350,
  confidenceThreshold: 0.75,
  motionVelocityThreshold: 1.2,
};

export interface HandGestureState {
  detectedGesture: GestureId;
  candidateGesture: GestureId;
  confidence: number;
  gestureStartTime: number | null;
  lastTriggeredGesture: GestureId | null;
  lastTriggeredTime: number;
  activeGesture: GestureId | null;
  /** timestamp of the last frame with a valid (above-threshold) classification */
  lastMatchTime: number;
  motionCooldownUntil: number;
  motionHistory: { x: number; y: number; t: number }[];
}

export function newGestureState(): HandGestureState {
  return {
    detectedGesture: 'none',
    candidateGesture: 'none',
    confidence: 0,
    gestureStartTime: null,
    lastTriggeredGesture: null,
    lastTriggeredTime: 0,
    activeGesture: null,
    lastMatchTime: 0,
    motionCooldownUntil: 0,
    motionHistory: [],
  };
}

/**
 * Update the state machine with a new detection.
 * Returns the gesture that ACTIVATED this frame (entry event), or null.
 * activeGesture stays latched (sustained) until gesture changes or hand lost.
 */
export function updateGestureState(
  st: HandGestureState,
  match: GestureMatch,
  now: number,
  cfg: GestureStateConfig = DEFAULT_STATE_CONFIG,
): GestureId | null {
  st.detectedGesture = match.gesture;
  st.confidence = match.confidence;

  if (match.confidence < cfg.confidenceThreshold || match.gesture === 'none') {
    // Brief tracking dropouts are normal: keep the latched gesture alive for a
    // short grace window instead of killing the chord every missed frame.
    const tolerance = cfg.missToleranceMs ?? 120;
    if (st.activeGesture && now - st.lastMatchTime < tolerance) {
      st.candidateGesture = st.activeGesture;
      st.confidence = 0;
      return null;
    }
    st.candidateGesture = 'none';
    st.gestureStartTime = null;
    st.activeGesture = null;
    return null;
  }
  st.lastMatchTime = now;

  if (match.gesture !== st.candidateGesture) {
    st.candidateGesture = match.gesture;
    st.gestureStartTime = now;
    return null;
  }

  if (st.gestureStartTime === null) {
    st.gestureStartTime = now;
    return null;
  }

  const held = now - st.gestureStartTime;
  if (held < cfg.stabilityMs) return null;

  // Stable long enough: this is the active gesture
  if (st.activeGesture !== match.gesture) {
    st.activeGesture = match.gesture;
    st.lastTriggeredGesture = match.gesture;
    st.lastTriggeredTime = now;
    return match.gesture; // activation edge
  }

  return null; // sustained, no retrigger
}

/** Detect a motion gesture from smoothed velocity history. Returns MotionGestureId or null. */
export function detectMotion(
  st: HandGestureState,
  f: HandFeatures,
  now: number,
  cfg: GestureStateConfig = DEFAULT_STATE_CONFIG,
): MotionGestureId | null {
  st.motionHistory.push({ x: f.palmCenter.x, y: f.palmCenter.y, t: now });
  const cutoff = now - 400;
  while (st.motionHistory.length > 0 && st.motionHistory[0].t < cutoff) {
    st.motionHistory.shift();
  }
  const h = st.motionHistory;
  if (h.length < 3 || now < st.motionCooldownUntil) return null;

  const first = h[0];
  const last = h[h.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const dt = Math.max((last.t - first.t) / 1000, 1e-3);
  const speed = Math.hypot(dx, dy) / dt;
  if (speed < cfg.motionVelocityThreshold) return null;

  const horizontal = Math.abs(dx) > Math.abs(dy) * 1.5;

  let motion: MotionGestureId | null = null;
  if (horizontal) {
    motion = dx > 0 ? 'swipeRight' : 'swipeLeft';
  } else if (Math.abs(dy) > Math.abs(dx) * 1.5) {
    motion = dy > 0 ? 'swipeDown' : 'swipeUp';
  }

  if (motion) {
    st.motionCooldownUntil = now + 600;
    st.motionHistory = [];
  }
  return motion;
}

/** Called when a hand is lost; fades out its state. */
export function resetGestureState(st: HandGestureState): void {
  st.detectedGesture = 'none';
  st.candidateGesture = 'none';
  st.confidence = 0;
  st.gestureStartTime = null;
  st.activeGesture = null;
  st.motionHistory = [];
}
