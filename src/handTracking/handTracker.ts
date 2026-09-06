// MediaPipe HandLandmarker wrapper. Model assets are loaded from CDN (jsdelivr) at runtime.
import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from '@mediapipe/tasks-vision';
import type { TrackedHand, Vec2, HandId } from '../types';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export interface TrackerInitResult {
  ok: boolean;
  error?: string;
}

export class HandTracker {
  private landmarker: HandLandmarker | null = null;

  async init(): Promise<TrackerInitResult> {
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
      // GPU delegate can fail on some machines; retry CPU
      try {
        const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
        this.landmarker = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
          runningMode: 'VIDEO',
          numHands: 2,
        });
        return { ok: true };
      } catch (e2) {
        return { ok: false, error: String(e2) };
      }
    }
  }

  detect(video: HTMLVideoElement, timestampMs: number): TrackedHand[] {
    if (!this.landmarker || video.readyState < 2) return [];
    let result: HandLandmarkerResult;
    try {
      result = this.landmarker.detectForVideo(video, timestampMs);
    } catch {
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
