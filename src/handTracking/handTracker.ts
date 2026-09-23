// MediaPipe HandLandmarker wrapper. WASM fileset is served locally from /public
// (copied from the installed @mediapipe/tasks-vision package) so the JS glue and
// WASM are always the same version — mixing the npm JS with a CDN WASM from a
// different release silently breaks detection. Only the .task model comes from CDN.
import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from '@mediapipe/tasks-vision';
import type { TrackedHand, Vec2, HandId } from '../types';
import { usePerf } from '../stores/performanceStore';

const WASM_BASE = '/mediapipe/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export interface TrackerInitResult {
  ok: boolean;
  error?: string;
}

export class HandTracker {
  private landmarker: HandLandmarker | null = null;

  async init(): Promise<TrackerInitResult> {
    if (this.gpuBlacklisted) {
      return this.reinit('CPU');
    }
    try {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      this.landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      return { ok: true };
    } catch (e) {
      // GPU delegate can fail on some machines (older Intel GPUs, blocked
      // WebGL); retry with the CPU delegate before giving up.
      console.warn('[handTracker] GPU delegate failed, retrying CPU:', e);
      return this.reinit('CPU');
    }
  }

  /** Once WebGL inference has failed mid-session, never go back to GPU. */
  private gpuBlacklisted = false;
  /** Milliseconds to wait before another recovery rebuild. */
  private lastRebuildAt = 0;

  /** Rebuild the landmarker on the given delegate (recovery path). */
  private async reinit(delegate: 'GPU' | 'CPU'): Promise<TrackerInitResult> {
    try {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      this.landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numHands: 2,
      });
      return { ok: true };
    } catch (e2) {
      return { ok: false, error: String(e2) };
    }
  }

  detect(video: HTMLVideoElement, timestampMs: number): TrackedHand[] {
    if (!this.landmarker || video.readyState < 2) return [];
    let result: HandLandmarkerResult;
    try {
      result = this.landmarker.detectForVideo(video, timestampMs);
    } catch (e) {
      // detectForVideo throws when the landmarker instance is wedged — most
      // often a lost WebGL context under the GPU delegate (identical
      // timestamps, GPU reset, driver hiccup). Returning [] forever here made
      // tracking silently die mid-session. Recover once: rebuild on the CPU
      // delegate; if that also fails, surface it.
      console.warn('[handTracker] detectForVideo threw, rebuilding on CPU:', e);
      this.gpuBlacklisted = true;
      const now = Date.now();
      if (now - this.lastRebuildAt < 2000) {
        // Still rebuilding (model load takes a moment) — drop this frame.
        return [];
      }
      this.lastRebuildAt = now;
      this.reinit('CPU').then((res) => {
        if (!res.ok) {
          usePerf.getState().setCameraError(
            `Hand tracking crashed and could not recover: ${res.error}`,
          );
        }
      });
      return [];
    }
    const hands: TrackedHand[] = result.landmarks.map((lms, i) => {
      const cat = result.handedness?.[i]?.[0];
      // MediaPipe's left/right label is mirrored for selfie view
      const mpLabel = cat?.categoryName ?? 'Right';
      const id: HandId = mpLabel === 'Left' ? 'right' : 'left';
      const landmarks: Vec2[] = lms.map((l) => ({ x: l.x, y: l.y }));
      return {
        id,
        landmarks,
        score: cat?.score ?? 1,
        features: {} as TrackedHand['features'],
        lastSeen: timestampMs,
      };
    });
    return hands;
  }

  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}

export type { HandLandmarkerResult };
