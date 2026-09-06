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

  const start = useCallback(async () => {
    try {
      stop();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
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
  }, [facing, onStream, onError, videoRef]);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  };

  useEffect(() => () => stop(), []);

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
          <div className="text-4xl">🎥</div>
          <p className="max-w-xs text-center text-sm text-white/70">
            Camera is off. Everything runs locally — video never leaves your device.
          </p>
          <button
            onClick={start}
            className="rounded-full bg-gradient-to-r from-cyan-400 to-pink-400 px-6 py-2.5 font-semibold text-black transition hover:brightness-110"
          >
            Enable Camera
          </button>
        </div>
      )}
      {onSwitchCamera && active && (
        <button
          onClick={onSwitchCamera}
          className="absolute right-3 top-3 rounded-full border border-white/20 bg-black/50 px-3 py-1.5 text-xs text-white/80 backdrop-blur hover:bg-black/70"
        >
          ⇄ Camera
        </button>
      )}
    </div>
  );
}
