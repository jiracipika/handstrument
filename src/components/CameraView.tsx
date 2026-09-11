import { useCallback, useEffect, useRef, useState } from 'react';
import { usePerf } from '../stores/performanceStore';

interface Props {
  onStream: (stream: MediaStream) => void;
  onError: (message: string) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  mirror: boolean;
  facing: 'user' | 'environment';
  onSwitchCamera?: () => void;
  /** Incremented by a parent user action to request camera permission. */
  startRequest?: number;
}

type PermState = 'granted' | 'denied' | 'prompt' | 'unknown';

/** Human guidance per failure mode, including browser and macOS paths. */
function describeCameraError(e: unknown): { title: string; fix: string } {
  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      title: 'Camera is unavailable in this context.',
      fix: 'This page must be loaded over HTTPS (or localhost) for camera access. Open the https:// link directly in a normal browser tab.',
    };
  }
  const name = (e as DOMException)?.name;
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return {
        title: 'Camera permission is blocked.',
        fix: 'Allow Camera in this site’s address-bar permissions, then try again. On macOS, also open System Settings → Privacy & Security → Camera and enable your browser. Brave users can also check brave://settings/content/camera.',
      };
    case 'NotFoundError':
      return { title: 'No camera found on this device.', fix: 'If you are on desktop, check that a webcam is connected and enabled.' };
    case 'NotReadableError':
      return { title: 'The camera is in use by another app.', fix: 'Close other apps or tabs using the camera (Zoom, Meet, camera app) and try again.' };
    case 'OverconstrainedError':
      return { title: 'This camera does not support the requested mode.', fix: 'Try switching cameras or reloading.' };
    default:
      return { title: `Could not start camera: ${(e as Error)?.message ?? name ?? 'unknown error'}`, fix: 'Reload the page and try again.' };
  }
}

export default function CameraView({
  onStream,
  onError,
  videoRef,
  mirror,
  facing,
  onSwitchCamera,
  startRequest = 0,
}: Props) {
  const streamRef = useRef<MediaStream | null>(null);
  const handledStartRequestRef = useRef(startRequest);
  const [active, setActive] = useState(false);
  const cameraError = usePerf((s) => s.cameraError);
  const [perm, setPerm] = useState<PermState>('unknown');

  // Live permission state (where the Permissions API supports camera).
  useEffect(() => {
    let poll: ReturnType<typeof setInterval> | undefined;
    const q = () =>
      navigator.permissions
        ?.query({ name: 'camera' as PermissionName })
        .then((p) => {
          setPerm(p.state as PermState);
          p.onchange = () => setPerm(p.state as PermState);
        })
        .catch(() => {
          // Firefox/Safari don't support camera in permissions API.
          setPerm('unknown');
          if (poll) clearInterval(poll);
        });
    void q();
    // Re-check when tab regains focus: users flip to browser settings and back.
    const onFocus = () => void q();
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      if (poll) clearInterval(poll);
    };
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      onError(
        'Camera is unavailable: this page must be loaded over HTTPS (or localhost). Open the https:// link directly in your browser.',
      );
      return;
    }
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
      const { title, fix } = describeCameraError(e);
      onError(`${title} ${fix}`);
    }
  }, [facing, onStream, onError, videoRef, stop]);

  // Parent controls (notably onboarding) cannot click the covered camera button.
  // A monotonically increasing request bridges that user action to getUserMedia.
  useEffect(() => {
    if (startRequest === handledStartRequestRef.current) return;
    handledStartRequestRef.current = startRequest;
    void start();
  }, [startRequest, start]);

  useEffect(() => () => stop(), [stop]);

  const insecure = typeof navigator !== 'undefined' && !navigator.mediaDevices?.getUserMedia;

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
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 px-5 backdrop-blur-sm">
          <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true" className="opacity-70">
            <rect x="3" y="10" width="28" height="22" rx="4" fill="none" stroke="#67e8f9" strokeWidth="2" />
            <path d="M33 17 L41 12 V30 L33 25" fill="none" stroke="#67e8f9" strokeWidth="2" strokeLinejoin="round" />
            <circle cx="17" cy="21" r="6" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" />
          </svg>
          <p className="max-w-xs text-center text-sm text-white/70">
            Camera is off. Everything runs locally — video never leaves your device.
          </p>

          {/* Permission state hint */}
          {!cameraError && !insecure && (
            <p className="max-w-xs text-center text-[11px] text-white/40">
              {perm === 'denied' ? (
                <>
                  Camera is <span className="text-red-300">blocked</span> for this site — allow it
                  from the icon in the address bar, then reload.
                </>
              ) : perm === 'granted' ? (
                <>Permission already granted — starting should work instantly.</>
              ) : (
                <>Your browser will ask for camera access when you tap below.</>
              )}
            </p>
          )}

          <button onClick={start} className="hs-button" disabled={insecure}>
            {insecure ? 'Camera unavailable (needs HTTPS)' : 'Enable Camera'}
          </button>

          {cameraError && (
            <div
              role="alert"
              className="max-w-sm rounded-xl border border-red-400/40 bg-red-400/10 p-3 text-center text-xs leading-relaxed text-red-200"
            >
              {cameraError}
            </div>
          )}
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
