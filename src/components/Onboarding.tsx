import { useRef, useState } from 'react';
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
    <p className="flex max-w-md items-start gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-4 py-2.5 text-xs text-emerald-200/90">
      <svg width="12" height="14" viewBox="0 0 10 12" className="mt-0.5 shrink-0" aria-hidden="true">
        <rect x="1" y="4" width="8" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M3.2 4V2.8a1.8 1.8 0 0 1 3.6 0V4" fill="none" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      Camera processing happens locally on your device. Video is not uploaded or stored.
    </p>
  );
}

function Wordmark({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  return (
    <h1
      className={size === 'lg' ? 'text-4xl font-bold tracking-tight' : 'text-2xl font-bold tracking-tight'}
      style={{
        background: 'linear-gradient(100deg, #a5f3fc, #67e8f9 35%, #f9a8d4)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
      }}
    >
      HandStrument
    </h1>
  );
}

/** First-run onboarding: explain -> camera -> hands -> play. */
export default function Onboarding({ onDone, onStartAudio, onEnableCamera }: Props) {
  const [step, setStep] = useState(0);
  const leftTracked = usePerf((s) => s.left.tracked);
  const rightTracked = usePerf((s) => s.right.tracked);
  const markDone = useSettings((s) => s.markOnboardingDone);
  const errRef = useRef(false);
  const cameraError = usePerf((s) => s.cameraError);
  if (cameraError) errRef.current = true;

  const steps = [
    // 0: intro
    <div key="intro" className="flex flex-col items-center gap-6 text-center">
      {/* animated orbiting skeleton hands */}
      <div className="relative flex h-28 items-center justify-center" aria-hidden="true">
        <div className="absolute h-24 w-24 rounded-full border border-cyan-400/15" />
        <div className="absolute h-24 w-24 rounded-full border border-pink-400/15" style={{ animation: 'hs-orbit 14s linear infinite' }} />
        <GestureGlyph gesture="openPalm" size={52} accent="#22d3ee" />
        <div className="hs-pulse absolute -right-2 top-1">
          <GestureGlyph gesture="peace" size={34} accent="#f472b6" />
        </div>
      </div>
      <Wordmark />
      <p className="max-w-md text-white/70">
        Turn your webcam into a musical instrument. Your hands become chords, notes,
        and filters — no touchscreens, no hardware.
      </p>
      <PrivacyNote />
      <button className="hs-button" onClick={() => setStep(1)}>
        Get Started
      </button>
    </div>,

    // 1: camera
    <div key="camera" className="hs-rise flex flex-col items-center gap-6 text-center">
      <h2 className="text-2xl font-bold text-white">Enable your camera</h2>
      <p className="max-w-md text-white/70">
        Your browser will ask for camera access. We need it to track your hands —
        everything stays on this device.
      </p>
      {cameraError && (
        <div className="max-w-md rounded-lg border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          {cameraError}
          <div className="mt-2 text-xs text-red-200/70">
            To fix: tap the camera/lock icon in your browser's address bar, allow camera,
            then reload.
          </div>
        </div>
      )}
      <button
        className="hs-button"
        onClick={async () => {
          await onEnableCamera();
          setStep(2);
        }}
      >
        Enable Camera
      </button>
      <button className="hs-ghost" onClick={() => setStep(2)}>
        Skip for now
      </button>
    </div>,

    // 2: hands
    <div key="hands" className="hs-rise flex flex-col items-center gap-6 text-center">
      <h2 className="text-2xl font-bold text-white">Show your hands</h2>
      <p className="max-w-md text-white/70">
        Hold your hands up to the camera, palms facing the lens, roughly 50 cm away.
      </p>
      <div className="flex items-center gap-8">
        <div className="flex flex-col items-center gap-2">
          <div className={leftTracked ? '' : 'opacity-25'}>
            <GestureGlyph gesture="openPalm" size={54} accent="#22d3ee" />
          </div>
          <span className={`text-xs ${leftTracked ? 'text-cyan-300' : 'text-white/40'}`}>
            {leftTracked ? 'tracked' : 'waiting'}
          </span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className={rightTracked ? '' : 'opacity-25'}>
            <GestureGlyph gesture="openPalm" size={54} accent="#f472b6" />
          </div>
          <span className={`text-xs ${rightTracked ? 'text-pink-300' : 'text-white/40'}`}>
            {rightTracked ? 'tracked' : 'waiting'}
          </span>
        </div>
      </div>
      <button
        className="hs-button"
        disabled={!leftTracked && !rightTracked}
        onClick={() => setStep(3)}
      >
        {leftTracked || rightTracked ? 'Continue' : 'Waiting…'}
      </button>
      <button className="hs-ghost" onClick={() => setStep(3)}>
        Skip
      </button>
    </div>,

    // 3: try gestures
    <div key="try" className="hs-rise flex flex-col items-center gap-6 text-center">
      <h2 className="text-2xl font-bold text-white">Try a gesture</h2>
      <p className="max-w-md text-white/70">
        Each shape plays something different. Hold each gesture steady for a moment.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ['openPalm', 'Open Palm', 'plays a chord'],
            ['peace', 'Peace', 'another chord'],
            ['fist', 'Fist', 'stops the sound'],
          ] as const
        ).map(([g, label, desc], idx) => (
          <div
            key={g}
            className={`hs-rise hs-rise-${idx + 1} flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-3`}
          >
            <GestureGlyph gesture={g} size={34} accent={idx === 1 ? '#f472b6' : '#22d3ee'} />
            <span className="text-xs font-medium text-white/85">{label}</span>
            <span className="text-[10px] text-white/45">{desc}</span>
          </div>
        ))}
      </div>
      <button
        className="hs-button"
        onClick={() => {
          markDone();
          setStep(4);
          onDone();
        }}
      >
        Start Playing
      </button>
    </div>,
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5 backdrop-blur-sm sm:p-6">
      <div className="glass-panel flex min-h-[420px] w-full max-w-xl flex-col items-center justify-center gap-4 rounded-3xl p-8 sm:p-10">
        {steps[step]}
        {step < 3 && (
          <button
            className="text-xs text-white/40 underline hover:text-white/70"
            onClick={() => setStep(step + 1)}
          >
            skip
          </button>
        )}
      </div>
      <button
        className="absolute bottom-6 text-xs text-white/40 underline hover:text-white/70"
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
