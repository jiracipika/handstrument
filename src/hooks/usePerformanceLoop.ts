// Core performance loop: video -> tracker -> features -> gestures -> audio.
// Kept OUTSIDE React render: runs in rAF, talks to the audio engine imperatively.
import { useCallback, useEffect, useRef } from 'react';
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
import { useSettings } from '../stores/settingsStore';
import { usePerf } from '../stores/performanceStore';

interface HandRuntime {
  features: TrackedHand['features'] | null;
  state: HandGestureState;
  activeChord: string | null;
  missingSince: number | null;
}

interface UsePerformanceLoopArgs {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
}

export function usePerformanceLoop({ videoRef, enabled }: UsePerformanceLoopArgs) {
  const trackerRef = useRef<HandTracker | null>(null);
  const engineRef = useRef<AudioEngine | null>(new AudioEngine());
  const runtime = useRef<Record<'left' | 'right', HandRuntime>>({
    left: { features: null, state: newGestureState(), activeChord: null, missingSince: null },
    right: { features: null, state: newGestureState(), activeChord: null, missingSince: null },
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

  const startAudio = useCallback(async () => {
    const eng = engineRef.current;
    if (!eng) return false;
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
    return true;
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

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let cancelled = false;

    const processHands = (hands: TrackedHand[], now: number, dt: number) => {
      const s = settingsRef.current;
      const seen = new Set<'left' | 'right'>();

      for (const hand of hands) {
        const slot = hand.id === 'left' ? 'left' : 'right';
        if (seen.has(slot)) continue;
        seen.add(slot);
        const rt = runtime.current[slot];

        rt.features = extractFeatures(hand.landmarks, rt.features ?? undefined, dt);
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

        const eng = engineRef.current;
        const mapping = slot === 'left' ? s.mappingLeft : s.mappingRight;
        const perf = usePerf.getState();
        const octaveOffset = slot === 'left' ? perf.octaveLeft : perf.octaveRight;

        if (activated) {
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
          const expr = s.expression;
          const p: { pan?: number; filter?: number; volume?: number } = {};
          if (expr.horizontal === 'pan') {
            p.pan = (rt.features.palmCenter.x - 0.5) * 1.6;
          }
          if (expr.pinch === 'filter') {
            p.filter = 200 + Math.min(rt.features.pinchDistance, 1.5) * 5200;
          }
          if (expr.handSize === 'volume') {
            p.volume = Math.min(1.2, Math.max(0.3, (rt.features.handSize - 0.05) * 4));
          }
          eng.setExpression(slot, p);
        }
      }

      // Lost hands: stop notes after a short grace period
      for (const slot of ['left', 'right'] as const) {
        const rt = runtime.current[slot];
        if (!seen.has(slot)) {
          if (rt.missingSince === null) {
            rt.missingSince = now;
          } else if (now - rt.missingSince > 250 && engineRef.current) {
            if (rt.activeChord !== null || rt.state.activeGesture) {
              engineRef.current.stopHand(slot);
              rt.activeChord = null;
            }
            resetGestureState(rt.state);
            // immediate UI update: this is a state transition, not per-frame churn
            usePerf.getState().updateHand({ id: slot, tracked: false, active: null, chordLabel: null });
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
      if (!video || !tracker || video.readyState < 2) return;
      if (video.currentTime === lastVideoTimeRef.current) return;
      lastVideoTimeRef.current = video.currentTime;

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
      engineRef.current?.stopAll();
    };
  }, [enabled, videoRef]);

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
  }, [settings]);

  return { startAudio, initTracker, engineRef };
}
