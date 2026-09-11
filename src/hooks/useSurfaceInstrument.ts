import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioEngine } from '../audio/audioEngine';
import { extractFeatures } from '../handTracking/gestureRecognizer';
import { getLiveHands } from '../handTracking/liveHands';
import {
  DEFAULT_PIANO_SURFACE,
  pianoKeyAt,
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

  const calibrateSurface = useCallback(() => {
    const hand = getLiveHands()[0];
    const tip = hand?.landmarks[8];
    if (!tip) return false;
    setSurface((current) => ({ ...current, pressY: Math.max(0.05, Math.min(0.95, tip.y - 0.01)) }));
    return true;
  }, []);

  useEffect(() => {
    if (!enabled) {
      lastNoteRef.current = null;
      setPrediction({ label: 'Camera is off', detail: 'Enable camera to start', active: false });
      return;
    }
    const timer = window.setInterval(() => {
      const hand = getLiveHands()[0];
      if (!hand) {
        lastNoteRef.current = null;
        setPrediction({ label: 'Waiting for a hand', detail: 'Keep your hand in frame', active: false });
        return;
      }
      const features = extractFeatures(hand.landmarks);
      let note: string | null;
      let detail: string;
      if (mode === 'piano') {
        note = pianoKeyAt(hand.landmarks[8], surface);
        detail = note ? 'Index fingertip pressed on calibrated surface' : 'Hover, then touch the calibrated surface';
      } else {
        const valves = valveStateFromExtensions(features.extensions);
        note = trumpetNoteForValves(valves);
        detail = `Valves ${valves.map((pressed, index) => (pressed ? index + 1 : '—')).join(' ')}`;
      }
      if (note && note !== lastNoteRef.current) {
        engineRef.current?.playChord('right', [note], {
          velocity: 0.85,
          sustain: false,
          arpeggiator: false,
          quantize: false,
        });
      }
      lastNoteRef.current = note;
      setPrediction(note
        ? { label: note, detail, active: true }
        : { label: 'No key pressed', detail, active: false });
    }, 66);
    return () => window.clearInterval(timer);
  }, [enabled, engineRef, mode, surface]);

  return { surface, prediction, calibrateSurface };
}
