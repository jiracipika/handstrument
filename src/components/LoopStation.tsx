import { useEffect, useState } from 'react';
import type { AudioEngine } from '../audio/audioEngine';
import { useSettings } from '../stores/settingsStore';

/**
 * Loop recorder: capture N bars of your playing, then loop it while you solo
 * over it with the other hand. Recording length locks to the current BPM.
 */
export default function LoopStation({ engineRef }: { engineRef: React.MutableRefObject<AudioEngine | null> }) {
  const [bars, setBars] = useState(2);
  const [recording, setRecording] = useState(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.onLoopReady = () => {
      setReady(true);
      setRecording(false);
    };
    return () => {
      eng.onLoopReady = null;
    };
  }, [engineRef]);

  // Countdown ticker while recording.
  useEffect(() => {
    if (!recording) return;
    const bpm = useSettings.getState().settings.bpm;
    const barSec = (60 / bpm) * 4;
    setCountdown(bars);
    let left = bars * barSec;
    const t = setInterval(() => {
      left -= 0.25;
      setCountdown(Math.max(0, Math.ceil(left / barSec)));
      if (left <= 0) clearInterval(t);
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  const startRecording = async () => {
    const eng = engineRef.current;
    if (!eng) return;
    const ok = await eng.recordLoop(bars);
    setRecording(ok);
    if (!ok) setReady(eng.loopReady);
  };

  const togglePlay = () => {
    const eng = engineRef.current;
    if (!eng) return;
    setPlaying(eng.toggleLoopPlayback());
  };

  const stopAll = () => {
    const eng = engineRef.current;
    if (!eng) return;
    if (recording) {
      eng.stopLoop();
      setRecording(false);
    }
    setPlaying(eng.toggleLoopPlayback() === true ? false : playing);
    eng.loopStopPlayback();
    setPlaying(false);
  };

  return (
    <div className="hs-card flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <span className="hs-label">Loop recorder</span>
        <div className="flex items-center gap-1">
          {[1, 2, 4].map((b) => (
            <button
              key={b}
              className="hs-chip"
              data-on={bars === b}
              disabled={recording}
              style={{ padding: '4px 10px', fontSize: 11 }}
              onClick={() => setBars(b)}
            >
              {b} bar{b > 1 ? 's' : ''}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          className={`hs-chip flex-1 justify-center ${recording ? 'hs-pulse' : ''}`}
          data-on={recording}
          style={{ ['--chip-accent' as string]: '#f87171', padding: '9px 0', justifyContent: 'center' }}
          disabled={recording}
          onClick={startRecording}
        >
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: recording ? '#f87171' : 'rgba(255,255,255,0.3)' }}
          />
          {recording ? `Recording… ${countdown}` : `Record ${bars} bar${bars > 1 ? 's' : ''}`}
        </button>
        <button
          className="hs-chip"
          data-on={playing}
          style={{ padding: '9px 14px' }}
          disabled={!ready}
          onClick={togglePlay}
        >
          {playing ? (
            <svg width="11" height="12" viewBox="0 0 11 12" aria-hidden="true">
              <rect x="1" y="1" width="3" height="10" rx="1" fill="currentColor" />
              <rect x="7" y="1" width="3" height="10" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg width="11" height="12" viewBox="0 0 11 12" aria-hidden="true">
              <path d="M1.5 1.2 L10 6 L1.5 10.8 Z" fill="currentColor" />
            </svg>
          )}
          {playing ? 'Stop' : 'Play'}
        </button>
        {(recording || playing) && (
          <button className="hs-chip" style={{ padding: '9px 14px' }} onClick={stopAll}>
            ✕
          </button>
        )}
      </div>
      <p className="text-[10px] leading-relaxed text-white/35">
        Record chords with one hand, then loop them and solo with the other. Loop length follows
        the BPM in the controls below.
      </p>
    </div>
  );
}
