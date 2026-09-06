import { create } from 'zustand';
import type { GestureId, TrackedHand } from '../types';

export interface HandPerfStatus {
  id: 'left' | 'right' | 'unknown';
  gesture: GestureId;
  active: GestureId | null;
  confidence: number;
  chordLabel: string | null;
  tracked: boolean;
}

interface PerfState {
  /** lightweight per-hand status mirrored for UI; updated at low frequency */
  left: HandPerfStatus;
  right: HandPerfStatus;
  trackingFps: number;
  audioReady: boolean;
  cameraError: string | null;
  octaveLeft: number;
  octaveRight: number;
  updateHand(status: Partial<HandPerfStatus> & { id: 'left' | 'right' }): void;
  setFps(fps: number): void;
  setAudioReady(v: boolean): void;
  setCameraError(e: string | null): void;
  octaveShift(hand: 'left' | 'right', delta: number, base: number): void;
}

const emptyStatus = (id: 'left' | 'right'): HandPerfStatus => ({
  id,
  gesture: 'none',
  active: null,
  confidence: 0,
  chordLabel: null,
  tracked: false,
});

export const usePerf = create<PerfState>((set) => ({
  left: emptyStatus('left'),
  right: emptyStatus('right'),
  trackingFps: 0,
  audioReady: false,
  cameraError: null,
  octaveLeft: 0,
  octaveRight: 0,
  updateHand: (status) =>
    set((st) => ({ [status.id]: { ...st[status.id], ...status } }) as Partial<PerfState>),
  setFps: (fps) => set({ trackingFps: fps }),
  setAudioReady: (v) => set({ audioReady: v }),
  setCameraError: (e) => set({ cameraError: e }),
  octaveShift: (hand, delta) =>
    set((st) => {
      const cur = hand === 'left' ? st.octaveLeft : st.octaveRight;
      const next = Math.max(-2, Math.min(2, cur + delta));
      return hand === 'left'
        ? { octaveLeft: next }
        : { octaveRight: next };
    }),
}));

export type { TrackedHand };
