# HandStrument 🎶✋

**Live: https://handstrument-two.vercel.app** · The **gesture instrument lab**.

Turn your webcam into a musical instrument. Hand gestures — tracked entirely in your
browser — play chords, notes, and drums, while continuous hand motion sweeps filters,
pans sound, and shifts octaves. No touchscreens, no hardware, no uploads.

**🔒 Camera processing happens locally on your device. Video is not uploaded or stored.**

> **Sibling product:** FingerJam (https://fingerjam.vercel.app,
> [source](https://github.com/jiracipika/fingerjam)) is the *jam studio* — finger-drum
> patterns on the left hand, preset chord progressions on the right, 3D rave visuals.
> HandStrument is the *instrument lab* — per-gesture sound mappings, custom taught
> gestures, a loop recorder, and calibrated surface instruments like the air piano.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- Tone.js (Web Audio synthesis, effects, polyphony)
- MediaPipe Tasks Vision (HandLandmarker, 21 landmarks × 2 hands, GPU-accelerated)
- Zustand (state)
- Vitest (unit tests)

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

Allow camera access when prompted, hold your hands up, and play.

## Production build

```bash
npm run build      # outputs dist/
npm run preview    # serve the build locally
```

## Vercel deployment

The repo is Vercel-ready (zero config — Vite preset):

```bash
npm i -g vercel
vercel             # preview deploy
vercel --prod      # production
```

Camera access requires HTTPS (or localhost), which Vercel provides automatically.

## How to play (default "Instant Jam" preset)

| Gesture | Left hand | Right hand |
|---|---|---|
| Open Palm | C Major | G Major |
| Point | — | D Minor |
| Peace | F Major | A Minor |
| Three Fingers | A Minor | F Major |
| Four Fingers | — | G7 |
| Rock / Horns | — | E Minor |
| Thumb Up | — | Octave + |
| Thumb Down | — | Octave − |
| Pinch | — | Kick |
| OK | — | Snare |
| Fist | Stop | Stop |
| Swipe ← / → | Octave − / + | Octave − / + |
| Swipe ↑ / ↓ | Clap / Hat | Clap / Hat |

Both hands are fully independent and polyphonic — two chords sound simultaneously.
Hold a gesture ~180 ms (configurable) to activate it; the state machine prevents
retriggering while sustained. Motion gestures (wired 2026-10-05: swipes step
octaves and fire drum accents; moveCloser/moveAway/rotateCW/rotateCCW are
detected and reported with no default action) run in both trigger modes. Pinch
distance sweeps a per-hand filter, horizontal position pans stereo, and apparent
hand size (distance from camera) scales volume — all remappable in the Sound panel.

Thumb up/down orientation is dataset-grounded (2026-10-05): the primary signal
is thumb-tip height vs the wrist, validated on real HaGRID thumbs-up/down
samples where the tip sits 1.07–2.25 hand-units above the wrist on every
thumbs-up; the palm-roll angle remains as a fallback for tilted hands.

## Architecture

```
src/
  components/          UI (CameraView, HandOverlay, GestureMapper, InstrumentPicker,
                       AudioVisualizer, PerformanceHUD, AudioControls, Onboarding)
  handTracking/
    handTracker.ts     MediaPipe wrapper (GPU->CPU fallback, 2 hands)
    gestureRecognizer.ts  landmark -> features (normalized by hand scale) -> gesture
    gestureSmoothing.ts   state machine: stability window, hysteresis, cooldowns,
                          motion gestures (swipes)
    liveHands.ts       lock-free buffer between rAF loop and overlay drawing
  audio/
    audioEngine.ts     Tone.js graph: 2 independent voices -> FX chain -> master,
                       drums, metronome, spectrum analyser
    chords.ts          chord/scale theory (semitone math, note naming)
    mappings.ts        gesture labels, default mappings, Instant Jam preset
  hooks/
    usePerformanceLoop.ts  the rAF loop: video -> detect -> features -> gesture
                           state machine -> audio. Audio triggering never happens
                           inside React render.
  stores/
    settingsStore.ts   persisted settings (localStorage)
    performanceStore.ts   live per-hand status for the UI (throttled)
```

Key invariants:

- **No fake data.** Gestures come from MediaPipe landmark geometry; nothing is mocked.
- **Normalized features.** All distances are divided by hand scale (wrist→middle-MCP),
  so recognition is independent of distance-to-camera and resolution.
- **Audio outside React.** The engine is imperative; React only reads throttled status.
- **No stuck notes.** Gesture change re-triggers (`releaseAll` → `triggerAttack`), and a
  lost hand stops its notes after a 250 ms grace period.

## Adding an instrument

Add a preset to `INSTRUMENTS` in `src/audio/audioEngine.ts`:

```ts
{
  id: 'mywobble', name: 'My Wobble', voice: 'Synth', gainDb: -10,
  options: { oscillator: { type: 'square' }, envelope: { attack: 0.3, decay: 0.5, sustain: 0.5, release: 1 } },
}
```

It appears in both instrument pickers automatically.

## Adding a gesture

1. Classify it in `src/handTracking/gestureRecognizer.ts` (`classifyGesture`) from
   the long-finger pattern (`fingersUp`) plus the shape features (`pinchDistance`,
   `thumbOut`, `thumbToCenter`, `thumbDy`) — see "Dataset grounding" below before
   picking a threshold.
2. Add a label in `src/audio/mappings.ts` (`GESTURE_LABELS`) and include the id in
   `MAPPABLE_GESTURES` so it shows in the mapping table.

## Dataset grounding

The static classifier is tuned against **real hands**, not canonical diagrams: the
[HaGRID](https://github.com/hukenovs/hagrid) gesture dataset (60 photos/class)
extracted to 21-landmark rows by the shared family pipeline on
`/Volumes/ADATA/datasets/`. Rule thresholds quote measured p10/p90 margins in
comments, and `tests/dataset.test.ts` pins accuracy on a committed 90-sample
subset so a tweak that helps synthetic poses but breaks real hands fails CI.

```bash
npx tsx scripts/eval-dataset.mjs   # full 960-sample eval (needs the dataset extract)
# 2026-10-21 rewrite: 872/960 = 90.8% (the pre-rewrite rules scored 43.8%)
```

Known honest confusion: upside-down "stop" (HaGRID `stop_inverted`) still splits
between openPalm and four — the folded-vs-adducted thumb is not fully separable
in 2D landmarks.

## Adding chord mappings / actions

`ChordAction` (in `src/types.ts`) supports `chord`, `note`, `stop`, `octaveUp`,
`octaveDown`, and `drum`. Extend the union there, handle it in
`usePerformanceLoop.ts` (`case '...'`), and add an editor option in
`components/GestureMapper.tsx`.

## Testing

```bash
npm test     # Vitest: gesture classification, state machine, motion, chord math
```

The synthetic-landmark tests run the same code path the camera feeds — no webcam
needed in CI. `tests/dataset.test.ts` additionally classifies 90 committed real
HaGRID landmark samples and fails under 85% accuracy.

## Privacy

Video frames are processed in-browser by MediaPipe WASM. No network request carries
camera data; the only network traffic is the one-time MediaPipe model/WASM download
from the jsdelivr/Google CDN. Settings and mappings live in `localStorage`. No
accounts, no telemetry.

## Roadmap

- Custom "Teach Gesture" mode (capture normalized landmark samples, kNN match)
- Web MIDI output
- Loop recording / performance capture
- Quantized chord changes and arpeggiator engine (toggles exist; engine TODO)
