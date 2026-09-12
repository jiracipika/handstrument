import { useState } from 'react';
import { useSettings } from '../stores/settingsStore';
import { usePerf } from '../stores/performanceStore';
import { GestureGlyph } from './GestureGlyph';

interface Props {
  onDone: () => void;
  onStartAudio: () => Promise<void>;
  onEnableCamera: () => Promise<void>;
}

function PrivacyNote() {
  return (
    <div className="onboarding-privacy">
      <svg width="16" height="18" viewBox="0 0 16 18" aria-hidden="true">
        <rect x="1.5" y="7" width="13" height="9.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M4.7 7V4.8a3.3 3.3 0 0 1 6.6 0V7" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
      <p><strong>Your camera stays yours.</strong> Frames are processed locally and are never uploaded or stored.</p>
    </div>
  );
}

function CameraError({ message, retry }: { message: string; retry: () => Promise<void> }) {
  return (
    <div className="onboarding-error" role="alert">
      <strong>Camera access needs attention</strong>
      <p>{message}</p>
      <button className="hs-ghost" onClick={() => void retry()}>Try camera again</button>
    </div>
  );
}

export default function Onboarding({ onDone, onStartAudio, onEnableCamera }: Props) {
  const [step, setStep] = useState(0);
  const [cameraRequested, setCameraRequested] = useState(false);
  const leftTracked = usePerf((s) => s.left.tracked);
  const rightTracked = usePerf((s) => s.right.tracked);
  const cameraError = usePerf((s) => s.cameraError);
  const markDone = useSettings((s) => s.markOnboardingDone);

  const finish = () => {
    markDone();
    onDone();
  };

  const finishWithAudio = async () => {
    // Audio needs a user gesture; this click is the last chance before the
    // studio, where a muted app would look broken (see scope-rack fallback).
    await onStartAudio().catch(() => undefined);
    finish();
  };

  const requestCamera = async () => {
    setCameraRequested(true);
    await onEnableCamera();
    setStep(2);
  };

  return (
    <div className="onboarding-shell" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="onboarding-card">
        <aside className="onboarding-rail" aria-label={`Setup step ${step + 1} of 4`}>
          <div className="mini-brand" aria-hidden="true"><i /><i /><i /></div>
          <div className="step-track">
            {[0, 1, 2, 3].map((index) => (
              <span key={index} className={index <= step ? 'is-current' : ''}>{String(index + 1).padStart(2, '0')}</span>
            ))}
          </div>
          <span className="rail-caption">Setup</span>
        </aside>

        <div className="onboarding-content">
          {step === 0 && (
            <div className="onboarding-step hs-rise">
              <div className="gesture-composition" aria-hidden="true">
                <div className="gesture-tile gesture-tile-left"><GestureGlyph gesture="openPalm" size={68} accent="#45e7ff" /></div>
                <div className="gesture-tile gesture-tile-right"><GestureGlyph gesture="peace" size={52} accent="#ff4da6" /></div>
                <span className="gesture-wire" />
              </div>
              <span className="section-kicker">Play without touching a thing</span>
              <h2 id="onboarding-title">Your hands are the instrument.</h2>
              <p className="onboarding-lead">Shape chords, notes, effects, and loops in the air. No controller. No account. Just a camera and two hands.</p>
              <PrivacyNote />
              <div className="onboarding-actions">
                <button className="hs-button" onClick={() => setStep(1)}>Set up my stage</button>
                <button className="text-action" onClick={() => void finishWithAudio()}>Explore without setup</button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="onboarding-step hs-rise">
              <div className="permission-illustration" aria-hidden="true">
                <div className="camera-lens"><span /></div>
                <span className="permission-ray ray-one" />
                <span className="permission-ray ray-two" />
                <span className="permission-ray ray-three" />
              </div>
              <span className="section-kicker">One browser permission</span>
              <h2 id="onboarding-title">Let the stage see your hands.</h2>
              <p className="onboarding-lead">Choose “Allow” when your browser asks for camera access. HandStrument does not request the microphone.</p>
              {cameraError && <CameraError message={cameraError} retry={requestCamera} />}
              <div className="onboarding-actions">
                <button className="hs-button" onClick={() => void requestCamera()}>
                  {cameraRequested ? 'Ask for camera again' : 'Allow camera'}
                </button>
                <button className="text-action" onClick={() => setStep(2)}>Continue without camera</button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="onboarding-step hs-rise">
              <div className="hand-checks" aria-label="Hand tracking status">
                <div className={leftTracked ? 'is-found' : ''}>
                  <GestureGlyph gesture="openPalm" size={58} accent="#45e7ff" />
                  <span>Left hand</span>
                  <strong>{leftTracked ? 'Found' : 'Waiting'}</strong>
                </div>
                <div className={rightTracked ? 'is-found' : ''}>
                  <GestureGlyph gesture="openPalm" size={58} accent="#ff4da6" />
                  <span>Right hand</span>
                  <strong>{rightTracked ? 'Found' : 'Waiting'}</strong>
                </div>
              </div>
              <span className="section-kicker">Tracking check</span>
              <h2 id="onboarding-title">Raise one or both hands.</h2>
              <p className="onboarding-lead">Keep your wrist and every fingertip in frame. A channel lights up when tracking locks on.</p>
              {cameraError && <CameraError message={cameraError} retry={requestCamera} />}
              <div className="onboarding-actions">
                <button className="hs-button" onClick={() => setStep(3)}>{leftTracked || rightTracked ? 'Tracking looks good' : 'Continue anyway'}</button>
                {!cameraError && !leftTracked && !rightTracked && <button className="text-action" onClick={() => void requestCamera()}>Restart camera</button>}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="onboarding-step hs-rise">
              <div className="gesture-score">
                {([
                  ['openPalm', 'Open palm', 'Play'],
                  ['peace', 'Peace', 'Change'],
                  ['fist', 'Fist', 'Stop'],
                ] as const).map(([gesture, label, action], index) => (
                  <div key={gesture} className={`hs-rise hs-rise-${index + 1}`}>
                    <GestureGlyph gesture={gesture} size={42} accent={index === 1 ? '#ff4da6' : '#45e7ff'} />
                    <span>{label}</span><strong>{action}</strong>
                  </div>
                ))}
              </div>
              <span className="section-kicker">First performance</span>
              <h2 id="onboarding-title">Hold a shape. Hear it answer.</h2>
              <p className="onboarding-lead">Start with an open palm, then move through the shapes. Keep each gesture steady for a beat.</p>
              <div className="onboarding-actions">
                <button className="hs-button" onClick={() => void finishWithAudio()}>Enter the studio</button>
                <button className="text-action" onClick={() => setStep(2)}>Back to camera check</button>
              </div>
            </div>
          )}
        </div>

        <button
          className="onboarding-close"
          aria-label="Close setup"
          onClick={async () => {
            await onStartAudio().catch(() => undefined);
            finish();
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M3 3l12 12M15 3 3 15" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>
      </div>
    </div>
  );
}
