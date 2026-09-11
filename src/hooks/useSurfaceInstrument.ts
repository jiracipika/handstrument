import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioEngine } from '../audio/audioEngine';
import { extractFeatures } from '../handTracking/gestureRecognizer';
import { getLiveHands } from '../handTracking/liveHands';
import { useSettings } from '../stores/settingsStore';
import {
  DEFAULT_PIANO_SURFACE,
  createKeyPressTracker,
  createSmoothedPoint,
  trumpetNoteForValves,
  valveStateFromExtensions,
  type PianoSurfaceCalibration,
  type SurfaceInstrumentMode,
} from '../instruments/surfacePrediction';

export interface SurfacePrediction {
  label: string;
  detail: string;
  active: boolean;
}

export function useSurfaceInstrument({
  mode,
  enabled,
  engineRef,
}: {
  mode: SurfaceInstrumentMode;
  enabled: boolean;
  engineRef: React.MutableRefObject<AudioEngine | null>;
}) {
  const [surface, setSurface] = useState<PianoSurfaceCalibration>(DEFAULT_PIANO_SURFACE);
  const [prediction, setPrediction] = useState<SurfacePrediction>({
    label: 'Waiting for a hand',
    detail: 'Camera tracking is required',
    active: false,
  });
  const lastNoteRef = useRef<string | null>(null);
  // Pure helpers live in refs so recalibration/mode swaps restart their state.
  const pressTrackerRef = useRef<ReturnType<typeof createKeyPressTracker> | null>(null);
  const pressTrackerSurfaceRef = useRef<PianoSurfaceCalibration | null>(null);
  const fingertipFilterRef = useRef<ReturnType<typeof createSmoothedPoint> | null>(null);
  const trumpetNoteRef = useRef<string | null>(null);

  const calibrateSurface = useCallback(() => {
    const hand = getLiveHands()[0];
    const tip = hand?.landmarks[8];
    if (!tip) return false;
    setSurface((current) => ({ ...current, pressY: Math.max(0.05, Math.min(0.95, tip.y - 0.01)) }));
    // stale press state from the old calibration must not leak into the new one
    pressTrackerSurfaceRef.current = null;
    fingertipFilterRef.current = null;
    return true;
  }, []);

  useEffect(() => {
    if (!enabled) {
      lastNoteRef.current = null;
      trumpetNoteRef.current = null;
      pressTrackerRef.current = null;
      fingertipFilterRef.current = null;
      setPrediction({ label: 'Camera is off', detail: 'Enable camera to start', active: false });
      return;
    }
    const timer = window.setInterval(() => {
      const hand = getLiveHands()[0];
      if (!hand) {
        lastNoteRef.current = null;
        trumpetNoteRef.current = null;
        pressTrackerRef.current = null;
        fingertipFilterRef.current = null;
        setPrediction({ label: 'Waiting for a hand', detail: 'Keep your hand in frame', active: false });
        return;
      }
      const features = extractFeatures(hand.landmarks);
      const play = (note: string, velocity = 0.85) => {
        engineRef.current?.playChord('right', [note], {
          velocity,
          sustain: false,
          arpeggiator: false,
          quantize: false,
        });
      };
      let label: string;
      let detail: string;
      let active = true;

      if (mode === 'none') {
        lastNoteRef.current = null;
        return;
      } else if (mode === 'piano') {
        const reversed = useSettings.getState().settings.mirror !== false;
        if (pressTrackerSurfaceRef.current !== surface) {
          pressTrackerRef.current = createKeyPressTracker(surface, reversed);
          pressTrackerSurfaceRef.current = surface;
          fingertipFilterRef.current = null;
        }
        const pressTracker = pressTrackerRef.current;
        if (!fingertipFilterRef.current) {
          fingertipFilterRef.current = createSmoothedPoint(hand.landmarks[8]);
        }
        if (!pressTracker) return;
        // smooth, then classify: jittery raw landmarks would flicker presses
        const smoothed = fingertipFilterRef.current(hand.landmarks[8]);
        const firedNote = pressTracker.update(smoothed);
        const depth = smoothed.y - surface.pressY;
        if (firedNote) {
          play(firedNote);
          lastNoteRef.current = firedNote;
          label = firedNote;
          detail = 'Index fingertip pressed on calibrated surface';
        } else if (depth >= 0 && lastNoteRef.current) {
          // holding/sliding without a new fire
          label = lastNoteRef.current;
          detail = 'Holding — slide or lift for the next note';
        } else {
          label = 'No key pressed';
          detail = depth >= 0
            ? 'Press deeper past the calibrated line'
            : 'Hover, then press into the surface';
          active = false;
        }
      } else {
        const valves = valveStateFromExtensions(features.extensions);
        const note = trumpetNoteForValves(valves);
        if (note !== trumpetNoteRef.current) {
          play(note, 0.7);
        }
        trumpetNoteRef.current = note;
        label = note;
        detail = `Valves ${valves.map((pressed, index) => (pressed ? index + 1 : '—')).join(' ')}`;
      }
      setPrediction({ label, detail, active });
    }, 66);
    return () => window.clearInterval(timer);
  }, [enabled, engineRef, mode, surface]);

  return { surface, prediction, calibrateSurface };
}
