// Core performance loop: video -> tracker -> features -> gestures -> audio.
// Kept OUTSIDE React render: runs in rAF, talks to the audio engine imperatively.
import { useCallback, useEffect, useRef } from 'react';
import type { SurfaceInstrumentMode } from '../instruments/surfacePrediction';
import type { TrackedHand } from '../types';
import type { HandTracker } from '../handTracking/handTracker';
import { publishLiveHands } from '../handTracking/liveHands';
import { extractFeatures, classifyGesture } from '../handTracking/gestureRecognizer';
import {
  newGestureState,
  updateGestureState,
  resetGestureState,
  type HandGestureState,
} from '../handTracking/gestureSmoothing';
import { AudioEngine } from '../audio/audioEngine';
import { chordNoteNames, chordLabel } from '../audio/chords';
import { classifyCustom } from '../handTracking/customGestures';
import {
  detectFingers,
  palmHeight,
  palmRoll,
  palmTilt,
  tipSpread,
  voicingFromMotion,
  fingerJamChordNotes,
  chordIndexForFinger,
  PROGRESSION,
  FINGER_DRUMS,
  DRUM_REPEAT_MS,
  type Voicing,
} from '../handTracking/fingerJam';
import { useSettings } from '../stores/settingsStore';
import { usePerf } from '../stores/performanceStore';

interface HandRuntime {
  features: TrackedHand['features'] | null;
  state: HandGestureState;
  activeChord: string | null;
  missingSince: number | null;
  /** fingerJam: fingers held down since the last frame (for hold-to-repeat) */
  jamFingers: Set<string>;
  /** fingerJam: next repeat time per finger */
  jamNextFire: Map<string, number>;
  /** fingerJam: last voiced chord (release when fingers lift) */
  jamChord: string | null;
  /** fingerJam: cached voicing for label + note shaping */
  jamVoicing: Voicing | null;
}

interface UsePerformanceLoopArgs {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  handsRef: React.MutableRefObject<TrackedHand[]>;
  enabled: boolean;
  /** Surface modes own note triggering; keep gesture classifier for UI only. */
  surfaceMode?: SurfaceInstrumentMode;
}

/** Map the expression settings onto continuous engine params. */
function buildExpression(
  expr: { horizontal: string; pinch: string; handSize: string },
  f: NonNullable<HandRuntime['features']>,
): { pan?: number; filter?: number; volume?: number } {
  const p: { pan?: number; filter?: number; volume?: number } = {};
  if (expr.horizontal === 'pan') {
    p.pan = (f.palmCenter.x - 0.5) * 1.6;
  }
  if (expr.pinch === 'filter') {
    p.filter = 200 + Math.min(f.pinchDistance, 1.5) * 5200;
  }
  if (expr.handSize === 'volume') {
    p.volume = Math.min(1.2, Math.max(0.3, (f.handSize - 0.05) * 4));
  }
  return p;
}

export function usePerformanceLoop({ videoRef, handsRef, enabled, surfaceMode }: UsePerformanceLoopArgs) {
  const trackerRef = useRef<HandTracker | null>(null);
  const engineRef = useRef<AudioEngine | null>(new AudioEngine());
  const runtime = useRef<Record<'left' | 'right', HandRuntime>>({
    left: {
      features: null,
      state: newGestureState(),
      activeChord: null,
      missingSince: null,
      jamFingers: new Set(),
      jamNextFire: new Map(),
      jamChord: null,
      jamVoicing: null,
    },
    right: {
      features: null,
      state: newGestureState(),
      activeChord: null,
      missingSince: null,
      jamFingers: new Set(),
      jamNextFire: new Map(),
      jamChord: null,
      jamVoicing: null,
    },
  });
  const lastVideoTimeRef = useRef(-1);
  const lastDetectRef = useRef(0);
  const lastFrameTRef = useRef(performance.now());
  const lastUiWriteRef = useRef(0);
  const fpsRef = useRef({ frames: 0, last: performance.now() });
  const settings = useSettings((s) => s.settings);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const lastInstrumentRef = useRef({ left: '', right: '' });
  const startPromiseRef = useRef<Promise<boolean> | null>(null);

  const startAudio = useCallback((): Promise<boolean> => {
    if (usePerf.getState().audioReady) return Promise.resolve(true);
    if (startPromiseRef.current) return startPromiseRef.current;
    const task = (async () => {
      const eng = engineRef.current;
      if (!eng) return false;
      try {
        await eng.start();
        eng.setInstrument('left', settingsRef.current.instrumentLeft);
        eng.setInstrument('right', settingsRef.current.instrumentRight);
        eng.applyEffects(settingsRef.current.effects);
        eng.setMasterVolume(settingsRef.current.masterVolume);
        lastInstrumentRef.current = {
          left: settingsRef.current.instrumentLeft,
          right: settingsRef.current.instrumentRight,
        };
        usePerf.getState().setAudioReady(true);
        usePerf.getState().setAudioError(null);
        return true;
      } catch (error) {
        usePerf.getState().setAudioError(`Could not start sound: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    })();
    startPromiseRef.current = task;
    void task.finally(() => { startPromiseRef.current = null; });
    return task;
  }, []);

  const initTracker = useCallback(async (): Promise<boolean> => {
    if (!trackerRef.current) {
      const { HandTracker: HandTrackerRuntime } = await import('../handTracking/handTracker');
      const t = new HandTrackerRuntime();
      const res = await t.init();
      if (!res.ok) {
        usePerf.getState().setCameraError(`Failed to load hand tracking model: ${res.error}`);
        return false;
      }
      trackerRef.current = t;
    }
    return true;
  }, []);

  useEffect(() => () => {
    trackerRef.current?.close();
    trackerRef.current = null;
    engineRef.current?.dispose();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let cancelled = false;
    let staleCleared = false;
    let lastFreshFrame = performance.now();

    const processJamHand = (
      slot: 'left' | 'right',
      hand: TrackedHand,
      now: number,
      eng: AudioEngine,
    ): void => {
      const rt = runtime.current[slot];
      const s = settingsRef.current;
      const side = slot === 'left' ? 'Left' : 'Right';
      const up = detectFingers(hand.landmarks, side, Math.max(s.sensitivity, 0.1));

      if (slot === 'left') {
        // Per-finger drums: fire on NEW presses; hold-to-repeat keeps a beat.
        for (const finger of up) {
          const drum = FINGER_DRUMS[finger as keyof typeof FINGER_DRUMS];
          const next = rt.jamNextFire.get(finger) ?? 0;
          if (!rt.jamFingers.has(finger) || now >= next) {
            eng.triggerDrum(drum);
            rt.jamNextFire.set(finger, now + DRUM_REPEAT_MS[finger as keyof typeof DRUM_REPEAT_MS]);
          }
        }
        for (const finger of [...rt.jamFingers]) {
          if (!up.includes(finger as (typeof up)[number])) {
            rt.jamFingers.delete(finger);
            rt.jamNextFire.delete(finger);
          }
        }
        for (const finger of up) rt.jamFingers.add(finger);
        rt.activeChord = up.length
          ? [...up].map((f) => FINGER_DRUMS[f]).join(' + ')
          : null;
        return;
      }

      // Right hand: per-finger chords + motion-shaped voicing.
      const voicing = voicingFromMotion(
        palmHeight(hand.landmarks),
        up.length / 5,
        tipSpread(hand.landmarks),
        palmRoll(hand.landmarks),
        palmTilt(hand.landmarks),
      );
      rt.jamVoicing = voicing;

      const chordIdxs = up
        .map((f) => chordIndexForFinger(f))
        .filter((idx) => idx >= 0);

      if (chordIdxs.length === 0) {
        if (rt.jamChord !== null) {
          eng.stopHand('right');
          rt.jamChord = null;
        }
        rt.activeChord = null;
        return;
      }

      // Lower finger index wins when several chord fingers are up (legacy
      // behavior: the earliest progression chord takes priority).
      const chordIdx = Math.min(...chordIdxs);
      const notes = fingerJamChordNotes(chordIdx, voicing);
      const key = notes.join(',');
      if (key !== rt.jamChord) {
        eng.playChord('right', notes, { velocity: 0.8, sustain: true });
        rt.jamChord = key;
      }
      const label = `${PROGRESSION[chordIdx].label} ${voicing.label}`;
      rt.activeChord = label;
    };

    const processHands = (hands: TrackedHand[], now: number, dt: number, forceLost = false) => {
      const s = settingsRef.current;
      const seen = new Set<'left' | 'right'>();

      for (const hand of hands) {
        const slot = hand.id === 'left' ? 'left' : 'right';
        if (seen.has(slot)) continue;
        seen.add(slot);
        const rt = runtime.current[slot];

        rt.features = extractFeatures(hand.landmarks, rt.features ?? undefined, dt);

        const eng = engineRef.current;
        const perf = usePerf.getState();

        // Finger Jam mode: per-finger triggers replace the pose classifier
        // entirely (expression below still runs).
        if (s.triggerMode === 'fingers') {
          if (eng && usePerf.getState().audioReady) {
            processJamHand(slot, hand, now, eng);
          }
          // continuous expression
          if (eng && usePerf.getState().audioReady) {
            const p = buildExpression(s.expression, rt.features);
            eng.setExpression(slot, p);
          }
          continue;
        }

        let match = classifyGesture(rt.features);
        // Custom (taught) gestures take precedence over static classifiers
        // when they match confidently.
        const custom = classifyCustom(rt.features);
        if (custom) {
          match = { gesture: custom.id, confidence: Math.max(0.5, 1 - custom.dist / 4) };
        }
        const cfg = {
          stabilityMs: s.stabilityMs / Math.max(s.sensitivity, 0.1),
          cooldownMs: 350,
          confidenceThreshold: Math.max(0.4, 0.75 - (s.sensitivity - 1) * 0.25),
          motionVelocityThreshold: 1.2 / Math.max(s.sensitivity, 0.1),
          missToleranceMs: 120,
        };
        const activated = updateGestureState(rt.state, match, now, cfg);

        const mapping = slot === 'left' ? s.mappingLeft : s.mappingRight;
        const octaveOffset = slot === 'left' ? perf.octaveLeft : perf.octaveRight;

        if (activated && !surfaceMode) {
          const action = mapping[activated];
          if (action && eng) {
            const playOpts = {
              velocity: 0.85,
              sustain: s.sustain,
              arpeggiator: s.arpeggiator,
              quantize: s.quantize,
            };
            switch (action.kind) {
              case 'chord': {
                const notes = chordNoteNames(action.chord, s.baseOctave + octaveOffset);
                eng.playChord(slot, notes, playOpts);
                rt.activeChord = chordLabel(action.chord);
                break;
              }
              case 'note':
                eng.playChord(slot, [`${action.note}${s.baseOctave + octaveOffset}`], playOpts);
                rt.activeChord = action.note;
                break;
              case 'stop':
                eng.stopHand(slot);
                rt.activeChord = null;
                break;
              case 'octaveUp':
                perf.octaveShift(slot, 1, s.baseOctave);
                break;
              case 'octaveDown':
                perf.octaveShift(slot, -1, s.baseOctave);
                break;
              case 'drum':
                eng.triggerDrum(action.drum);
                break;
              case 'none':
                break;
            }
          }
        }

        // Continuous expression (outside React)
        if (eng && rt.features && usePerf.getState().audioReady) {
          eng.setExpression(slot, buildExpression(s.expression, rt.features));
        }
      }

      // Lost hands: stop notes after a short grace period
      for (const slot of ['left', 'right'] as const) {
        const rt = runtime.current[slot];
        if (!seen.has(slot)) {
          if (rt.missingSince === null) {
            rt.missingSince = now;
          } else if (rt.missingSince !== -1 && (forceLost || now - rt.missingSince > 250)) {
            engineRef.current?.stopHand(slot);
            rt.activeChord = null;
            rt.jamChord = null;
            rt.jamVoicing = null;
            rt.jamFingers.clear();
            rt.jamNextFire.clear();
            rt.features = null;
            resetGestureState(rt.state);
            rt.missingSince = -1; // transition handled until the hand returns
            usePerf.getState().updateHand({ id: slot, tracked: false, gesture: 'none', active: null, chordLabel: null });
          }
        } else {
          rt.missingSince = null;
        }
      }
      // Throttled UI mirror (~10 Hz): keeps the HUD live without re-rendering
      // React every video frame, which steals time from the audio thread.
      if (now - lastUiWriteRef.current > 100) {
        lastUiWriteRef.current = now;
        for (const slot of ['left', 'right'] as const) {
          const rt = runtime.current[slot];
          usePerf.getState().updateHand({
            id: slot,
            tracked: seen.has(slot),
            gesture: rt.state.detectedGesture,
            active: rt.state.activeGesture,
            confidence: rt.state.confidence,
            chordLabel: rt.activeChord,
          });
        }
      }
    };

    const loop = (t: number) => {
      if (cancelled) return;
      raf = requestAnimationFrame(loop);
      const video = videoRef.current;
      const tracker = trackerRef.current;
      if (!video || !tracker) return;
      // Dead video feed (track ended, OS revoked camera, device glitch): the
      // video time freezes but landmarks buffer would keep the last skeleton
      // on screen forever and hold surface notes. Publish empty hands once.
      if (video.readyState < 2) {
        if (!staleCleared && t - lastFreshFrame > 350) {
          staleCleared = true;
          lastVideoTimeRef.current = -2;
          handsRef.current = [];
          publishLiveHands([]);
          processHands([], t, 0.016, true);
        }
        return;
      }
      if (video.currentTime === lastVideoTimeRef.current) {
        if (!staleCleared && t - lastFreshFrame > 350) {
          staleCleared = true;
          handsRef.current = [];
          publishLiveHands([]);
          processHands([], t, 0.016, true);
        }
        return;
      }
      lastVideoTimeRef.current = video.currentTime;
      lastFreshFrame = t;
      staleCleared = false;

      const now = performance.now();
      const dt = Math.min(Math.max((now - lastFrameTRef.current) / 1000, 0.001), 0.1);
      lastFrameTRef.current = now;

      // Skip inference on frames that arrived too soon after the previous one:
      // keeps the UI thread responsive on 90–120 Hz phone displays, where video
      // can update faster than inference can possibly run.
      const MIN_DETECT_INTERVAL_MS = 33; // ~30 detections/sec ceiling
      if (now - lastDetectRef.current < MIN_DETECT_INTERVAL_MS) return;
      lastDetectRef.current = now;

      const hands = tracker.detect(video, t);
      handsRef.current = hands;
      publishLiveHands(hands);
      processHands(hands, now, dt);

      const f = fpsRef.current;
      f.frames++;
      if (now - f.last > 1000) {
        usePerf.getState().setFps(f.frames);
        f.frames = 0;
        f.last = now;
      }
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      handsRef.current = [];
      publishLiveHands([]);
      engineRef.current?.stopAll();
      for (const slot of ['left', 'right'] as const) {
        const rt = runtime.current[slot];
        rt.activeChord = null;
        rt.jamChord = null;
        rt.jamFingers.clear();
        rt.jamNextFire.clear();
        rt.features = null;
        rt.missingSince = null;
        resetGestureState(rt.state);
        usePerf.getState().updateHand({ id: slot, tracked: false, gesture: 'none', active: null, chordLabel: null });
      }
    };
  }, [enabled, surfaceMode, videoRef]);

  // Sync effect/volume/bpm/instrument changes into the engine
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng || !usePerf.getState().audioReady) return;
    eng.applyEffects(settings.effects);
    eng.setMasterVolume(settings.masterVolume);
    eng.setBpm(settings.bpm);
    if (settings.metronome) eng.startMetronome(settings.bpm);
    else eng.stopMetronome();
    if (lastInstrumentRef.current.left !== settings.instrumentLeft) {
      eng.setInstrument('left', settings.instrumentLeft);
      lastInstrumentRef.current.left = settings.instrumentLeft;
    }
    if (lastInstrumentRef.current.right !== settings.instrumentRight) {
      eng.setInstrument('right', settings.instrumentRight);
      lastInstrumentRef.current.right = settings.instrumentRight;
    }
  }, [settings.effects, settings.masterVolume, settings.bpm, settings.metronome, settings.instrumentLeft, settings.instrumentRight]);

  return { startAudio, initTracker, engineRef };
}
