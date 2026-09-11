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
  const requestInFlightRef = useRef(false);
  const [active, setActive] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const cameraError = usePerf((s) => s.cameraError);
  const [perm, setPerm] = useState<PermState>('unknown');

  // Live permission state (where the Permissions API supports camera).
  useEffect(() => {
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
        });
    void q();
    // Re-check when tab regains focus: users flip to browser settings and back.
    const onFocus = () => void q();
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  }, []);

  const start = useCallback(async () => {
    if (requestInFlightRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      onError(
        'Camera is unavailable: this page must be loaded over HTTPS (or localhost). Open the https:// link directly in your browser.',
      );
      return;
    }
    requestInFlightRef.current = true;
    setRequesting(true);
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
    } finally {
      requestInFlightRef.current = false;
      setRequesting(false);
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
    <div className="camera-surface">
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        style={{ transform: mirror ? 'scaleX(-1)' : 'none' }}
        playsInline
        muted
        autoPlay
      />
      {!active && (
        <div className="camera-empty" aria-busy={requesting}>
          <div className="camera-empty-icon" aria-hidden="true">
            <svg width="52" height="52" viewBox="0 0 52 52">
              <rect x="5" y="13" width="32" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" />
              <path d="M40 20l8-5v22l-8-5z" fill="none" stroke="currentColor" strokeWidth="1.7" />
              <circle cx="21" cy="26" r="7" fill="none" stroke="currentColor" strokeWidth="1.7" />
            </svg>
            <span className={requesting ? 'is-scanning' : ''} />
          </div>
          <div className="camera-empty-copy">
            <strong>{requesting ? 'Waiting for your browser' : 'Camera standing by'}</strong>
            <p>
              {requesting
                ? 'Choose Allow in the camera permission prompt.'
                : 'Video stays on this device. Only hand landmarks reach the instrument.'}
            </p>
          </div>

          {!cameraError && !insecure && !requesting && (
            <p className="permission-status">
              {perm === 'denied'
                ? 'Camera is blocked for this site. Change the address-bar permission, then try again.'
                : perm === 'granted'
                  ? 'Camera permission is already allowed.'
                  : 'Your browser will ask before the camera starts.'}
            </p>
          )}

          <button onClick={() => void start()} className="hs-button" disabled={insecure || requesting}>
            {insecure ? 'HTTPS required for camera' : requesting ? 'Permission requested…' : 'Enable camera'}
          </button>

          {cameraError && <div role="alert" className="camera-error">{cameraError}</div>}
        </div>
      )}
      {onSwitchCamera && active && (
        <button onClick={onSwitchCamera} className="camera-switch" aria-label="Switch camera">
          <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
            <path d="M1.5 7.5h10M8.5 3.7l3.8 3.8-3.8 3.8M13.5 3v9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Switch camera
        </button>
      )}
    </div>
  );
}
