import { useRef, useState } from 'react';
import { useSettings } from '../stores/settingsStore';
import { usePerf } from '../stores/performanceStore';

interface Props {
  onDone: () => void;
  onStartAudio: () => Promise<void>;
  onEnableCamera: () => Promise<void>;
}

/** First-run onboarding: explain -> camera -> hands -> play. */
export default function Onboarding({ onDone, onStartAudio, onEnableCamera }: Props) {
  const [step, setStep] = useState(0);
  const [handsSeen] = useState(false);
  const leftTracked = usePerf((s) => s.left.tracked);
  const rightTracked = usePerf((s) => s.right.tracked);
  const markDone = useSettings((s) => s.markOnboardingDone);
  const errRef = useRef(false);
  const cameraError = usePerf((s) => s.cameraError);
  if (cameraError) errRef.current = true;

  const steps = [
    // 0: intro
    <div key="intro" className="flex flex-col items-center gap-6 text-center">
      <div className="text-6xl">🎶✋</div>
      <h1 className="bg-gradient-to-r from-cyan-300 to-pink-300 bg-clip-text text-4xl font-black text-transparent">
        HandStrument
      </h1>
      <p className="max-w-md text-white/70">
        Turn your webcam into a musical instrument. Your hands become chords, notes,
        and filters — no touchscreens, no hardware.
      </p>
      <p className="max-w-md rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-xs text-emerald-200/90">
        🔒 Camera processing happens locally on your device. Video is not uploaded or stored.
      </p>
      <button
        className="rounded-full bg-gradient-to-r from-cyan-400 to-pink-400 px-8 py-3 text-lg font-bold text-black transition hover:brightness-110"
        onClick={() => setStep(1)}
      >
        Get Started
      </button>
    </div>,

    // 1: camera
    <div key="camera" className="flex flex-col items-center gap-6 text-center">
      <h2 className="text-2xl font-bold text-white">Enable your camera</h2>
      <p className="max-w-md text-white/70">
        Your browser will ask for camera access. We need it to track your hands —
        everything stays on this device.
      </p>
      {cameraError && (
        <div className="max-w-md rounded-lg border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          {cameraError}
          <div className="mt-2 text-xs text-red-200/70">
            To fix: click the camera/lock icon in your browser's address bar, allow camera, then reload.
          </div>
        </div>
      )}
      <button
        className="rounded-full bg-gradient-to-r from-cyan-400 to-pink-400 px-8 py-3 font-bold text-black transition hover:brightness-110"
        onClick={async () => {
          await onEnableCamera();
          setStep(2);
        }}
      >
        Enable Camera
      </button>
      <button className="text-xs text-white/40 underline" onClick={() => setStep(2)}>
        Skip for now
      </button>
    </div>,

    // 2: hands
    <div key="hands" className="flex flex-col items-center gap-6 text-center">
      <h2 className="text-2xl font-bold text-white">Show your hands</h2>
      <p className="max-w-md text-white/70">
        Hold your hands up to the camera, palms facing the lens, roughly 50 cm away.
      </p>
      <div className="flex gap-4 text-5xl">
        <span className={leftTracked ? 'opacity-100' : 'opacity-20'}>✋</span>
        <span className={rightTracked ? 'opacity-100' : 'opacity-20'}>🤚</span>
      </div>
      <div className="text-sm text-white/60">
        {leftTracked || rightTracked ? 'Hands detected! ✓' : 'Waiting for hands…'}
      </div>
      <button
        className="rounded-full bg-gradient-to-r from-cyan-400 to-pink-400 px-8 py-3 font-bold text-black disabled:opacity-40"
        disabled={!leftTracked && !rightTracked}
        onClick={() => setStep(3)}
      >
        {leftTracked || rightTracked ? 'Continue' : 'Waiting…'}
      </button>
      <button className="text-xs text-white/40 underline" onClick={() => setStep(3)}>
        Skip
      </button>
    </div>,

    // 3: try gestures
    <div key="try" className="flex flex-col items-center gap-6 text-center">
      <h2 className="text-2xl font-bold text-white">Try a gesture</h2>
      <p className="max-w-md text-white/70">
        Open palm plays a chord. Fist stops the sound. Peace, point, and rock signs
        play different chords. Hold each gesture steady for a moment.
      </p>
      <div className="grid grid-cols-3 gap-2 text-center text-xs text-white/60">
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">✋<br />Open Palm</div>
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">✌️<br />Peace</div>
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">✊<br />Stop</div>
      </div>
      {handsSeen && <div className="text-sm text-emerald-300">Nice! You're ready.</div>}
      <button
        className="rounded-full bg-gradient-to-r from-cyan-400 to-pink-400 px-8 py-3 font-bold text-black transition hover:brightness-110"
        onClick={() => setStep(4)}
      >
        Start Playing
      </button>
    </div>,
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur">
      <div className="glass-panel flex min-h-[420px] w-full max-w-xl flex-col items-center justify-center gap-4 rounded-3xl p-10">
        {steps[step]}
        {step === 3 && (
          <button
            className="text-xs text-white/40 underline"
            onClick={() => {
              markDone();
              onDone();
            }}
          >
            don't show again
          </button>
        )}
        {step < 3 && (
          <button
            className="text-xs text-white/40 underline"
            onClick={() => setStep(step + 1)}
          >
            skip
          </button>
        )}
      </div>
      <button
        className="absolute bottom-6 text-xs text-white/40 underline"
        onClick={async () => {
          await onStartAudio().catch(() => undefined);
          markDone();
          onDone();
        }}
      >
        skip onboarding entirely
      </button>
    </div>
  );
}
