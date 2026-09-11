import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettings } from './stores/settingsStore';
import { usePerf } from './stores/performanceStore';
import { usePerformanceLoop } from './hooks/usePerformanceLoop';
import CameraView from './components/CameraView';
import HandOverlay from './components/HandOverlay';
import PerformanceHUD from './components/PerformanceHUD';
import AudioVisualizer from './components/AudioVisualizer';
import GestureMapper, { InstrumentPicker } from './components/GestureMapper';
import AudioControls from './components/AudioControls';
import Onboarding from './components/Onboarding';
import type { TrackedHand } from './types';

type Panel = 'mapper' | 'controls' | 'calibration';

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const handsRef = useRef<TrackedHand[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(
    !useSettings.getState().settings.onboardingDone &&
      !new URLSearchParams(location.search).has('skipIntro'),
  );
  const [trackingOn, setTrackingOn] = useState(false);
  const [panel, setPanel] = useState<Panel>('mapper');
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const settings = useSettings((s) => s.settings);
  const set = useSettings((s) => s.set);
  // Select only what this component reads: subscribing to the whole store
  // would re-render the entire app (incl. the mapping table) ~10x/sec.
  const perfLeft = usePerf((s) => s.left);
  const perfRight = usePerf((s) => s.right);
  const { startAudio, initTracker, engineRef } = usePerformanceLoop({
    videoRef,
    enabled: trackingOn,
  });

  const enableCamera = useCallback(async () => {
    usePerf.getState().setCameraError(null);
    const trackerOk = await initTracker();
    if (!trackerOk) return;
    setTrackingOn(true);
  }, [initTracker]);

  // Mirror live hands into overlay (drawn by HandOverlay's own throttled rAF)
  useEffect(() => {
    if (!trackingOn) {
      handsRef.current = [];
      return;
    }
    const id = setInterval(() => {
      handsRef.current = getLiveHands();
    }, 40);
    return () => clearInterval(id);
  }, [trackingOn]);

  const handleStart = async () => {
    await startAudio();
    await enableCamera();
  };

  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[#0a0a0f] text-white">
      {/* ambient background glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(60% 50% at 20% 10%, rgba(34,211,238,0.15), transparent), radial-gradient(50% 40% at 80% 90%, rgba(244,114,182,0.12), transparent)',
        }}
      />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-4 py-2.5 sm:px-5 sm:py-3">
        <div className="flex items-center gap-3">
          <h1
            className="text-lg font-bold tracking-tight sm:text-xl"
            style={{
              background: 'linear-gradient(100deg, #a5f3fc, #67e8f9 35%, #f9a8d4)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            HandStrument
          </h1>
          <PerformanceHUD />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => set('metronome', !settings.metronome)}
            className="hs-chip"
            data-on={settings.metronome}
            style={{ ['--chip-accent' as string]: '#f472b6' }}
          >
            <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
              <path d="M4.5 1 L7.5 1 L7.8 9 L4.2 9 Z M3 12.6 L9 12.6 L9.6 9 L2.4 9 Z" fill="currentColor" />
            </svg>
            Metronome
          </button>
          <button
            onClick={() => {
              if (document.fullscreenElement) document.exitFullscreen();
              else document.documentElement.requestFullscreen();
            }}
            className="hs-chip"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path
                d="M1 4V1h3M8 1h3v3M11 8v3H8M4 11H1V8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            Fullscreen
          </button>
        </div>
      </header>

      {/* Main stage */}
      <main className="relative z-10 flex min-h-0 flex-1 gap-4 px-4 pb-2 sm:px-5 max-lg:flex-col">
        {/* Camera + visualizer */}
        <section className="relative flex min-h-0 flex-1 flex-col gap-3">
          <div className="relative min-h-0 flex-1 max-lg:min-h-[42vh]">
            <CameraView
              videoRef={videoRef}
              mirror={settings.mirror}
              facing={facing}
              onSwitchCamera={() => setFacing(facing === 'user' ? 'environment' : 'user')}
              onStream={async () => {
                if (usePerf.getState().cameraError) usePerf.getState().setCameraError(null);
                await initTracker();
                setTrackingOn(true);
              }}
              onError={(m) => usePerf.getState().setCameraError(m)}
            />
            <HandOverlay
              videoRef={videoRef}
              canvasRef={overlayCanvasRef}
              handsRef={handsRef}
              mirror={settings.mirror}
            />
            {/* floating gesture readout */}
            <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1.5 text-[11px]">
              {(['left', 'right'] as const).map((h) => {
                const st = h === 'left' ? perfLeft : perfRight;
                return st.tracked ? (
                  <div
                    key={h}
                    className="mono flex items-center gap-2 rounded-lg border border-white/10 bg-black/60 px-2.5 py-1.5 backdrop-blur"
                  >
                    <span
                      className="font-semibold"
                      style={{ color: h === 'left' ? '#67e8f9' : '#f9a8d4' }}
                    >
                      {h === 'left' ? 'L' : 'R'}
                    </span>
                    <span className="text-white/85">{st.chordLabel ?? '—'}</span>
                    <span className="text-white/40">{Math.round(st.confidence * 100)}%</span>
                  </div>
                ) : null;
              })}
            </div>
          </div>
          <AudioVisualizer
            engineRef={engineRef}
            className="h-20 w-full rounded-xl border border-white/10 bg-black/40"
          />
        </section>

        {/* Side panels */}
        <aside className="glass-panel flex w-[400px] flex-col gap-3 overflow-y-auto rounded-2xl p-4 max-lg:w-full max-xl:w-[330px]">
          <div className="flex gap-1 rounded-xl border border-white/10 bg-black/40 p-1 text-xs">
            {(
              [
                ['mapper', 'Mappings'],
                ['controls', 'Sound'],
                ['calibration', 'Calibrate'],
              ] as [Panel, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setPanel(id)}
                className="flex-1 rounded-lg px-3 py-1.5 transition"
                style={
                  panel === id
                    ? {
                        background: 'rgba(34,211,238,0.16)',
                        color: '#a5f3fc',
                        boxShadow: 'inset 0 0 0 1px rgba(34,211,238,0.3)',
                      }
                    : { color: 'rgba(255,255,255,0.5)' }
                }
              >
                {label}
              </button>
            ))}
          </div>

          {panel === 'mapper' && (
            <>
              <div className="flex items-center justify-between gap-2">
                <InstrumentPicker
                  hand="left"
                  value={settings.instrumentLeft}
                  onChange={(id) => set('instrumentLeft', id)}
                />
                <InstrumentPicker
                  hand="right"
                  value={settings.instrumentRight}
                  onChange={(id) => set('instrumentRight', id)}
                />
              </div>
              <GestureMapper />
              <button
                onClick={() => useSettings.getState().resetDefaults()}
                className="self-start text-xs text-white/40 underline hover:text-white/70"
              >
                Reset to Instant Jam preset
              </button>
            </>
          )}

          {panel === 'controls' && <AudioControls />}

          {panel === 'calibration' && (
            <div className="flex flex-col gap-3 text-sm text-white/70">
              <p>
                Calibration is optional. HandStrument normalizes every gesture by your hand
                size, so it adapts automatically to hand size, camera angle, and lighting.
              </p>
              <p>
                If specific gestures feel unreliable, try the sensitivity slider (Sound tab)
                or increase gesture stability time. Custom “Teach Gesture” capture is coming
                in a later update.
              </p>
              <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200/90">
                Tip: good lighting and keeping your whole hand inside the frame dramatically
                improves recognition.
              </div>
            </div>
          )}

          <p className="mt-auto flex items-center gap-1.5 text-[10px] leading-relaxed text-white/30">
            <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true">
              <rect x="1" y="4" width="8" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <path d="M3.2 4V2.8a1.8 1.8 0 0 1 3.6 0V4" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            Camera processing happens locally on your device. Video is not uploaded or stored.
          </p>
        </aside>
      </main>

      {showOnboarding && (
        <Onboarding
          onDone={() => setShowOnboarding(false)}
          onStartAudio={handleStart}
          onEnableCamera={async () => {
            await handleStart();
          }}
        />
      )}
    </div>
  );
}

// Shared live-hands buffer: the performance loop writes raw detections here so the
// overlay can draw them without coupling to React state.
import { getLiveHands } from './handTracking/liveHands';
