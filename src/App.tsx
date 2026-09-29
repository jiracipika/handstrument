import { useCallback, useRef, useState } from 'react';
import { useSettings } from './stores/settingsStore';
import { usePerf } from './stores/performanceStore';
import { usePerformanceLoop } from './hooks/usePerformanceLoop';
import { useSurfaceInstrument } from './hooks/useSurfaceInstrument';
import type { SurfaceInstrumentMode } from './instruments/surfacePrediction';
import CameraView, { type CameraViewHandle } from './components/CameraView';
import HandOverlay from './components/HandOverlay';
import PerformanceHUD from './components/PerformanceHUD';
import AudioVisualizer from './components/AudioVisualizer';
import GestureMapper, { InstrumentPicker } from './components/GestureMapper';
import AudioControls from './components/AudioControls';
import LoopStation from './components/LoopStation';
import GestureTeacher from './components/GestureTeacher';
import SetupDiagrams from './components/SetupDiagrams';
import Onboarding from './components/Onboarding';
import type { TrackedHand } from './types';

type Panel = 'mapper' | 'controls' | 'looper' | 'calibration';

const PANELS: { id: Panel; label: string; short: string }[] = [
  { id: 'mapper', label: 'Gesture map', short: 'Map' },
  { id: 'controls', label: 'Sound lab', short: 'Sound' },
  { id: 'looper', label: 'Loop deck', short: 'Loop' },
  { id: 'calibration', label: 'Setup', short: 'Setup' },
];

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraViewRef = useRef<CameraViewHandle | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const handsRef = useRef<TrackedHand[]>([]);
  const [teacherRefresh, setTeacherRefresh] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(
    !useSettings.getState().settings.onboardingDone &&
      !new URLSearchParams(location.search).has('skipIntro'),
  );
  const [trackingOn, setTrackingOn] = useState(false);
  const [surfaceMode, setSurfaceMode] = useState<SurfaceInstrumentMode>('none');
  const [cameraStartRequest, setCameraStartRequest] = useState(0);
  const [panel, setPanel] = useState<Panel>('mapper');
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const settings = useSettings((s) => s.settings);
  const set = useSettings((s) => s.set);
  const perfLeft = usePerf((s) => s.left);
  const perfRight = usePerf((s) => s.right);
  const cameraError = usePerf((s) => s.cameraError);
  const audioReady = usePerf((s) => s.audioReady);
  const audioError = usePerf((s) => s.audioError);
  const { startAudio, initTracker, engineRef } = usePerformanceLoop({
    videoRef,
    handsRef,
    enabled: trackingOn,
    surfaceMode,
  });
  const { surface, prediction, calibrateSurface } = useSurfaceInstrument({
    mode: surfaceMode,
    enabled: trackingOn,
    engineRef,
  });

  const enableCamera = useCallback(async () => {
    usePerf.getState().setCameraError(null);
    // Calling this handle from the original click preserves transient user
    // activation in Brave/Safari. The state signal remains a mount-time fallback.
    if (cameraViewRef.current) {
      await cameraViewRef.current.start();
    } else {
      setCameraStartRequest((request) => request + 1);
    }
  }, []);

  const handleStart = async () => {
    // Request camera before awaiting audio initialization. Keeping camera access
    // adjacent to the click is the most compatible path across browser engines.
    const cameraRequest = enableCamera();
    await Promise.all([cameraRequest, startAudio()]);
  };

  const previewSound = async (hand: 'left' | 'right') => {
    if (!usePerf.getState().audioReady && !(await startAudio())) return;
    engineRef.current?.playChord(hand, hand === 'left' ? ['C4', 'E4', 'G4'] : ['G4', 'B4', 'D5'], {
      sustain: false,
      velocity: 0.55,
    });
  };

  const switchCamera = () => {
    setFacing((current) => (current === 'user' ? 'environment' : 'user'));
    setCameraStartRequest((request) => request + 1);
  };

  const statusLabel = cameraError
    ? 'Camera needs attention'
    : trackingOn
      ? 'Hands live'
      : 'Camera standing by';

  return (
    <div className="studio-shell">
      <a className="skip-link" href="#performance-stage">Skip to performance</a>
      <div className="studio-atmosphere" aria-hidden="true">
        <span className="signal-orbit signal-orbit-a" />
        <span className="signal-orbit signal-orbit-b" />
      </div>

      <header className="studio-header">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <h1>handstrument<span className="brand-period">.</span></h1>
            <p>THE CAMERA IS YOUR INSTRUMENT</p>
          </div>
        </div>

        <div className="header-status" role="status" aria-live="polite">
          <span className={`status-light ${trackingOn ? 'is-live' : ''}`} />
          <span>{statusLabel}</span>
        </div>

        <div className="header-actions">
          <button
            onClick={() => set('metronome', !settings.metronome)}
            className="transport-control"
            aria-pressed={settings.metronome}
          >
            <span className="metronome-icon" aria-hidden="true" />
            <span className="control-label">Metronome</span>
          </button>
          <button
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void document.documentElement.requestFullscreen();
            }}
            className="transport-control icon-control"
            aria-label="Toggle fullscreen"
          >
            <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M2 7V2h5M11 2h5v5M16 11v5h-5M7 16H2v-5" fill="none" stroke="currentColor" strokeWidth="1.7" />
            </svg>
          </button>
        </div>
      </header>

      <main id="performance-stage" className="workbench">
        <section className="performance-bay" aria-label="Live performance camera">
          <div className="bay-heading">
            <div>
              <span className="section-kicker">01 / THE STAGE</span>
              <h2>Make music in motion<span className="heading-period">.</span></h2>
            <p className="bay-subtitle">Bring your hands into frame. Shape the sound as you move.</p>
            </div>
            <div className="stage-actions">
              <div className="signal-legend" aria-hidden="true">
                <span><i className="left-signal" /> Left</span>
                <span><i className="right-signal" /> Right</span>
              </div>
              {!trackingOn && <button type="button" className="stage-start" onClick={() => void handleStart()}>Start playing <span aria-hidden="true">↗</span></button>}
            </div>
          </div>

          <div className="camera-rig">
            <div className="frame-corner frame-corner-tl" aria-hidden="true" />
            <div className="frame-corner frame-corner-tr" aria-hidden="true" />
            <div className="frame-corner frame-corner-bl" aria-hidden="true" />
            <div className="frame-corner frame-corner-br" aria-hidden="true" />
            <CameraView
              ref={cameraViewRef}
              videoRef={videoRef}
              mirror={settings.mirror}
              facing={facing}
              startRequest={cameraStartRequest}
              onSwitchCamera={switchCamera}
              onStartAudio={startAudio}
              onStream={async () => {
                if (usePerf.getState().cameraError) usePerf.getState().setCameraError(null);
                const trackerOk = await initTracker();
                setTrackingOn(trackerOk);
              }}
              onError={(message) => usePerf.getState().setCameraError(message)}
            />
            <HandOverlay
              videoRef={videoRef}
              canvasRef={overlayCanvasRef}
              handsRef={handsRef}
              mirror={settings.mirror}
            />
            <div className="camera-topline" aria-live="polite">
              <span className={trackingOn ? 'live-dot' : ''} />
              <strong>{trackingOn ? 'TRACKING LIVE' : cameraError ? 'INPUT NEEDS ATTENTION' : 'STAGE READY'}</strong>
              <span>{trackingOn ? 'TWO HAND CHANNELS' : 'CAMERA + GESTURE INPUT'}</span>
            </div>
            {trackingOn && (
              <div className="gesture-monitor" aria-live="polite">
                {(['left', 'right'] as const).map((hand) => {
                  const state = hand === 'left' ? perfLeft : perfRight;
                  return (
                    <div className={`gesture-channel ${state.tracked ? 'is-tracked' : ''}`} key={hand}>
                      <span className={`channel-key ${hand}`}>{hand === 'left' ? 'L' : 'R'}</span>
                      <span className="channel-value">{state.chordLabel ?? (state.tracked ? 'Ready' : 'Waiting')}</span>
                      <span className="channel-confidence">{state.tracked ? `${Math.round(state.confidence * 100)}%` : '—'}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className={`scope-rack ${audioReady ? 'is-audio-ready' : ''}`}>
            <button
              type="button"
              className="scope-copy audio-arm-toggle"
              onClick={() => void startAudio()}
              aria-label={audioReady ? 'Audio is on' : 'Enable audio'}
              title={audioReady ? 'Audio is on' : 'Enable sound in your browser'}
            >
              <span>AUDIO OUTPUT</span>
              <strong className={audioReady ? 'is-audio-on' : 'is-audio-off'}>
                {audioReady ? 'Sound ready' : audioError ? 'Retry sound ↗' : 'Enable sound ↗'}
              </strong>
            </button>
            <AudioVisualizer engineRef={engineRef} className="scope-canvas" />
            <PerformanceHUD />
          </div>
          {audioError && <p role="alert" className="audio-error">{audioError}</p>}
        </section>

        <aside className="control-bay" aria-label="Instrument controls">
          <div className="control-heading">
            <span className="section-kicker">02 / YOUR SOUND</span>
            <strong>Shape the session</strong>
            <span className="control-heading-rule" />
            <span className="control-heading-led" aria-hidden="true" />
          </div>
          <nav className="panel-tabs" aria-label="Control sections">
            {PANELS.map(({ id, label, short }) => (
              <button
                key={id}
                onClick={() => setPanel(id)}
                className={panel === id ? 'is-active' : ''}
                aria-current={panel === id ? 'page' : undefined}
                title={label}
              >
                <span className="tab-full">{label}</span>
                <span className="tab-short">{short}</span>
              </button>
            ))}
          </nav>

          <div className="panel-content">
            {panel === 'mapper' && (
              <section aria-labelledby="mapper-title" className="panel-section">
                <div className="panel-title-row">
                  <div>
                    <span className="section-kicker">TWO HANDS / INFINITE COMBINATIONS</span>
                    <h2 id="mapper-title">Your instrument setup</h2>
                  </div>
                  <button onClick={() => useSettings.getState().resetDefaults()} className="text-action">
                    Reset map
                  </button>
                </div>
                <div className="instrument-pair">
                  <InstrumentPicker hand="left" value={settings.instrumentLeft} onChange={(id) => set('instrumentLeft', id)} onPreview={() => void previewSound('left')} />
                  <InstrumentPicker hand="right" value={settings.instrumentRight} onChange={(id) => set('instrumentRight', id)} onPreview={() => void previewSound('right')} />
                </div>
                <section className="surface-instrument-panel trigger-mode-panel" aria-labelledby="trigger-mode-title">
                  <div>
                    <span className="section-kicker">PLAY STYLE / SELECT ONE</span>
                    <h3 id="trigger-mode-title">How do you want to play?</h3>
                    <p>
                      {settings.triggerMode === 'fingers'
                        ? 'Individual fingers become drum hits and chord triggers.'
                        : 'Hold a hand pose to play its mapped chord, note, or drum.'}
                    </p>
                  </div>
                  <div className="trigger-mode-options" role="group" aria-label="Play style">
                    <button
                      className={`trigger-mode-option ${settings.triggerMode === 'poses' ? 'is-selected' : ''}`}
                      onClick={() => set('triggerMode', 'poses')}
                      aria-pressed={settings.triggerMode === 'poses'}
                    >
                      <span className="trigger-mode-index">01</span>
                      <span><strong>Gesture map</strong><small>Play with hand shapes</small></span>
                      <span className="trigger-mode-check" aria-hidden="true">✓</span>
                    </button>
                    <button
                      className={`trigger-mode-option ${settings.triggerMode === 'fingers' ? 'is-selected' : ''}`}
                      onClick={() => set('triggerMode', 'fingers')}
                      aria-pressed={settings.triggerMode === 'fingers'}
                    >
                      <span className="trigger-mode-index">02</span>
                      <span><strong>Finger Jam</strong><small>Play each finger</small></span>
                      <span className="trigger-mode-check" aria-hidden="true">✓</span>
                    </button>
                  </div>
                </section>
                <details className="surface-instrument-panel surface-details">
                  <summary>Explore experimental surface instruments <span aria-hidden="true">↗</span></summary>
                  <section aria-labelledby="surface-instrument-title">
                  <div>
                    <span className="section-kicker">EXPERIMENTAL / CAMERA SURFACES</span>
                    <h3 id="surface-instrument-title">Play a surface</h3>
                    <p>Geometric prediction, calibrated for your camera angle. It is not a trained universal piano or trumpet recognizer.</p>
                  </div>
                  <div className="surface-mode-picker" role="group" aria-label="Instrument mode">
                    <button className={surfaceMode === 'none' ? 'is-selected' : ''} onClick={() => setSurfaceMode('none')} aria-pressed={surfaceMode === 'none'}>Off (gestures)</button>
                    <button className={surfaceMode === 'piano' ? 'is-selected' : ''} onClick={() => setSurfaceMode('piano')} aria-pressed={surfaceMode === 'piano'}>Piano surface</button>
                    <button className={surfaceMode === 'trumpet' ? 'is-selected' : ''} onClick={() => setSurfaceMode('trumpet')} aria-pressed={surfaceMode === 'trumpet'}>Trumpet valves</button>
                  </div>
                  <div className="surface-readout" aria-live="polite">
                    <strong>{prediction.label}</strong>
                    <span>{prediction.detail}</span>
                  </div>
                  {surfaceMode === 'piano' ? (
                    <div className="surface-calibration">
                      <button className="hs-chip" onClick={calibrateSurface} disabled={!trackingOn}>Set tabletop height</button>
                      <span>Surface line: {Math.round(surface.pressY * 100)}% down frame</span>
                    </div>
                  ) : surfaceMode === 'trumpet' ? (
                    <p className="surface-help">Curl index, middle, and ring fingers as valves 1, 2, and 3. The current POC plays a single mid-register fingering map.</p>
                  ) : (
                    <p className="surface-help">Surface instruments are off — your gesture mappings control the sound. Pick Piano or Trumpet above to try the tabletop POC.</p>
                  )}
                  </section>
                </details>
                <GestureMapper refreshKey={teacherRefresh} />
              </section>
            )}

            {panel === 'controls' && (
              <section aria-labelledby="sound-title" className="panel-section">
                <div className="panel-title-row">
                  <div>
                    <span className="section-kicker">Tone shaping</span>
                    <h2 id="sound-title">Sound lab</h2>
                  </div>
                </div>
                <AudioControls engineRef={engineRef} />
              </section>
            )}

            {panel === 'looper' && (
              <section aria-labelledby="loop-title" className="panel-section">
                <div className="panel-title-row">
                  <div>
                    <span className="section-kicker">Layer a performance</span>
                    <h2 id="loop-title">Loop deck</h2>
                  </div>
                </div>
                <LoopStation engineRef={engineRef} />
                <p className="panel-note">
                  Record one or two bars with your left hand, then keep the loop rolling while your right hand solos. A new take replaces the last one.
                </p>
              </section>
            )}

            {panel === 'calibration' && (
              <section aria-labelledby="setup-title" className="panel-section setup-panel">
                <div className="panel-title-row">
                  <div>
                    <span className="section-kicker">Tracking setup</span>
                    <h2 id="setup-title">Give your hands room</h2>
                  </div>
                </div>
                <ol className="setup-steps">
                  <li><span>01</span><p>Face a soft, even light. Avoid a bright window behind you.</p></li>
                  <li><span>02</span><p>Keep your wrist and fingertips inside the performance frame.</p></li>
                  <li><span>03</span><p>Hold a gesture briefly until its channel lights up.</p></li>
                </ol>
                <SetupDiagrams />
                <GestureTeacher onTrained={() => setTeacherRefresh((k) => k + 1)} />
                <div className="privacy-block">
                  <svg width="18" height="20" viewBox="0 0 18 20" aria-hidden="true">
                    <rect x="2" y="8" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M5.5 8V5.5a3.5 3.5 0 0 1 7 0V8" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  <div><strong>Private by design</strong><p>Camera frames are processed on this device. They are never uploaded or stored.</p></div>
                </div>
              </section>
            )}
          </div>
        </aside>
      </main>

      {showOnboarding && (
        <Onboarding
          onDone={() => setShowOnboarding(false)}
          onStartAudio={handleStart}
          onEnableCamera={handleStart}
        />
      )}
    </div>
  );
}
