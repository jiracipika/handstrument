import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  onStream: (stream: MediaStream) => void;
  onError: (message: string) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  mirror: boolean;
  facing: 'user' | 'environment';
  onSwitchCamera?: () => void;
}

export default function CameraView({
  onStream,
  onError,
  videoRef,
  mirror,
  facing,
  onSwitchCamera,
}: Props) {
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  }, []);

  const start = useCallback(async () => {
    try {
      stop();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          // 640×400 is plenty for hand landmarking — inference cost scales with
          // input area, and on phones 720p inference saturates the main thread.
          width: { ideal: 640 },
          height: { ideal: 400 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setActive(true);
      onStream(stream);
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === 'NotAllowedError') {
        onError('Camera permission was denied. Enable it in your browser settings and reload.');
      } else if (name === 'NotFoundError') {
        onError('No camera was found on this device.');
      } else {
        onError(`Could not start camera: ${(e as Error).message}`);
      }
    }
  }, [facing, onStream, onError, videoRef, stop]);

  useEffect(() => () => stop(), [stop]);

  return (
    <div className="group relative h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        style={{ transform: mirror ? 'scaleX(-1)' : 'none' }}
        playsInline
        muted
        autoPlay
      />
      {!active && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm">
          <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true" className="opacity-70">
            <rect x="3" y="10" width="28" height="22" rx="4" fill="none" stroke="#67e8f9" strokeWidth="2" />
            <path d="M33 17 L41 12 V30 L33 25" fill="none" stroke="#67e8f9" strokeWidth="2" strokeLinejoin="round" />
            <circle cx="17" cy="21" r="6" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" />
          </svg>
          <p className="max-w-xs text-center text-sm text-white/70">
            Camera is off. Everything runs locally — video never leaves your device.
          </p>
          <button onClick={start} className="hs-button">
            Enable Camera
          </button>
        </div>
      )}
      {onSwitchCamera && active && (
        <button
          onClick={onSwitchCamera}
          className="absolute right-3 top-3 rounded-full border border-white/20 bg-black/50 px-3 py-1.5 text-xs text-white/80 backdrop-blur hover:bg-black/70"
        >
          <span className="inline-flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M1 6h8M6 2.5L9.5 6 6 9.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M11 3v6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Camera
          </span>
        </button>
      )}
    </div>
  );
}
