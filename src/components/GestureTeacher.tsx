import { useRef, useState } from 'react';
import {
  trainCustomGesture,
  listCustomGestures,
  deleteCustomGesture,
} from '../handTracking/customGestures';
import { getLiveHands } from '../handTracking/liveHands';
import { extractFeatures } from '../handTracking/gestureRecognizer';
import type { HandFeatures } from '../types';

const CAPTURE_COUNT = 12; // frames sampled while the user holds the pose

/**
 * Teach a custom gesture: hold a pose, capture exemplars, name it. The
 * gesture then appears as a mappable action source (custom:<name>).
 */
export default function GestureTeacher({ onTrained }: { onTrained: () => void }) {
  const [name, setName] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [captured, setCaptured] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [gestures, setGestures] = useState(listCustomGestures());
  const samplesRef = useRef<HandFeatures[]>([]);
  const timerRef = useRef<number | null>(null);

  const startCapture = () => {
    const clean = name.trim();
    if (!clean) {
      setStatus('Give the gesture a name first.');
      return;
    }
    samplesRef.current = [];
    setCaptured(0);
    setCapturing(true);
    setStatus(null);
    let taken = 0;
    timerRef.current = window.setInterval(() => {
      const hands = getLiveHands();
      if (hands.length > 0) {
        const f = extractFeatures(hands[0].landmarks, undefined, 1 / 15);
        samplesRef.current.push(f);
        taken += 1;
        setCaptured(taken);
        if (taken >= CAPTURE_COUNT) {
          stopCapture();
          finish(clean);
        }
      }
    }, 120); // ~8 samples/sec over ~1.5s
  };

  const stopCapture = () => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setCapturing(false);
  };

  const finish = (clean: string) => {
    try {
      trainCustomGesture(clean, samplesRef.current);
      setStatus(`Trained "${clean}" — it's now in the Mappings table.`);
      setGestures(listCustomGestures());
      onTrained();
    } catch (e) {
      setStatus(String((e as Error).message));
    }
  };

  return (
    <div className="hs-card flex flex-col gap-3 p-3">
      <span className="hs-label">Teach a gesture</span>
      <p className="text-[11px] leading-relaxed text-white/55">
        Hold a distinctive hand shape in view of the camera, type a name, and hit capture.
        Sample it a few times in different lighting for reliability.
      </p>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. horn-fingers"
          disabled={capturing}
          className="hs-select"
          style={{ flex: 1 }}
        />
        <button
          className="hs-chip"
          data-on={capturing}
          style={{ ['--chip-accent' as string]: '#f87171', justifyContent: 'center' }}
          disabled={capturing}
          onClick={startCapture}
        >
          {capturing ? `Capturing ${captured}/${CAPTURE_COUNT}` : 'Capture'}
        </button>
      </div>
      {status && <p className="text-[11px] text-cyan-200/80">{status}</p>}
      {gestures.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="hs-label">Trained gestures</span>
          {gestures.map((g) => (
            <div key={g.id} className="flex items-center gap-2 text-xs text-white/75">
              <span className="flex-1 truncate">{g.name}</span>
              <span className="text-white/35">{g.examples.length} samples</span>
              <button
                className="text-white/30 hover:text-red-300"
                aria-label={`Delete ${g.name}`}
                onClick={() => {
                  deleteCustomGesture(g.id);
                  setGestures(listCustomGestures());
                  onTrained();
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

