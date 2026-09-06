// Shared live-hands buffer: the performance loop publishes raw detections here so
// the overlay can draw them without coupling to React state.
import type { TrackedHand } from '../types';

let liveHands: TrackedHand[] = [];

export function publishLiveHands(hands: TrackedHand[]): void {
  liveHands = hands;
}

export function getLiveHands(): TrackedHand[] {
  return liveHands;
}
