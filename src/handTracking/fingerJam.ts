// Finger Jam trigger mode — ported from the legacy HandStrument build
// (handstrument.vercel.app). Instead of static poses, each FINGER is its own
// trigger: left hand plays drums, right hand plays chords from a B-minor pop
// progression, and continuous right-hand motion shapes the chord voicing
// (register band, color, inversion) exactly like the legacy build.
import type { NoteName, Vec2 } from '../types';

export type FingerId = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';

export const FINGER_IDS: FingerId[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];

/**
 * Legacy finger detection: thumb is "up" when the tip pulls sideways away
 * from the index MCP (direction depends on hand side); other fingers are up
 * when the tip sits above the PIP joint by a sensitivity margin. Raw
 * normalized coords, margin scales with sensitivity (>1 = easier).
 */
export function detectFingers(
  landmarks: Vec2[],
  side: 'Left' | 'Right',
  sensitivity = 1,
): FingerId[] {
  const up: FingerId[] = [];
  const thumbTip = landmarks[4];
  const thumbMcp = landmarks[3];
  const margin = 0.03 * sensitivity;
  const thumbSideways =
    side === 'Left' ? thumbTip.x > thumbMcp.x + margin : thumbTip.x < thumbMcp.x - margin;
  if (thumbSideways) up.push('thumb');

  const pairs: [FingerId, number, number][] = [
    ['index', 8, 6],
    ['middle', 12, 10],
    ['ring', 16, 14],
    ['pinky', 20, 18],
  ];
  for (const [finger, tipIdx, pipIdx] of pairs) {
    if (landmarks[tipIdx].y < landmarks[pipIdx].y - 0.035 * sensitivity) up.push(finger);
  }
  return up;
}

/** Palm height 0..1 (1 = hand high in frame) — legacy motion.height. */
export function palmHeight(landmarks: Vec2[]): number {
  const palmY = (landmarks[0].y + landmarks[5].y + landmarks[17].y) / 3;
  return clamp01(1 - palmY);
}

/** Average pairwise tip distance normalized by hand scale — legacy spread. */
export function tipSpread(landmarks: Vec2[]): number {
  const s = Math.max(dist(landmarks[0], landmarks[9]), 1e-4);
  const tips = [4, 8, 12, 16, 20];
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < tips.length; i++) {
    for (let j = i + 1; j < tips.length; j++) {
      sum += dist(landmarks[tips[i]], landmarks[tips[j]]);
      pairs++;
    }
  }
  return clamp01((sum / pairs / s) * 5);
}

/** Palm roll: angle of the wrist→middle-MCP axis vs vertical. */
export function palmRoll(landmarks: Vec2[]): number {
  const w = landmarks[0];
  const mcp = landmarks[9];
  return Math.atan2(mcp.x - w.x, w.y - mcp.y);
}

/** Palm tilt: angle of the index-MCP→pinky-MCP axis. */
export function palmTilt(landmarks: Vec2[]): number {
  const i = landmarks[5];
  const p = landmarks[17];
  return Math.atan2(i.y - p.y, i.x - p.x);
}

export type ChordColor = 'triad' | 'add9' | 'seventh' | 'octave';
export type HeightBand = 'low' | 'mid' | 'high';

export interface Voicing {
  color: ChordColor;
  heightBand: HeightBand;
  /** 0 = root, 1 = first inversion, 2 = second inversion */
  inversion: 0 | 1 | 2;
  label: string;
}

/**
 * Motion -> voicing, straight from the legacy Ej():
 * - openness/spread drive the color (open hands go big: add9/seventh/octave)
 * - height band extends the color for high hands
 * - roll/tilt rotate the chord through inversions
 */
export function voicingFromMotion(
  height: number,
  openness: number,
  spread: number,
  roll: number,
  tilt: number,
): Voicing {
  const band: HeightBand = height > 0.68 ? 'high' : height > 0.38 ? 'mid' : 'low';
  const open = Math.max(openness, spread);
  const tiltAmount = Math.min(1, Math.abs(tilt) / Math.PI);
  const color: ChordColor =
    open > 0.72
      ? 'octave'
      : band === 'high' || tiltAmount > 0.66
        ? 'seventh'
        : band === 'mid' || tiltAmount > 0.38
          ? 'add9'
          : 'triad';
  const inversion: 0 | 1 | 2 = roll > 0.22 ? 1 : roll < -0.22 ? 2 : 0;
  const label = `${COLOR_LABELS[color]} · ${BAND_LABELS[band]}${
    inversion ? ` · ${inversion === 1 ? '1st' : '2nd'} inv` : ''
  }`;
  return { color, heightBand: band, inversion, label };
}

const COLOR_LABELS: Record<ChordColor, string> = {
  triad: 'Core',
  add9: 'Wide',
  seventh: 'Bright',
  octave: 'Open',
};
const BAND_LABELS: Record<HeightBand, string> = { low: 'Low', mid: 'Mid', high: 'High' };

/** Legacy progression: Bm9 → Gmaj7 → Em7 → F#7, one chord per finger. */
export const PROGRESSION: { finger: FingerId; label: string; semitones: number[] }[] = [
  { finger: 'index', label: 'Bm9', semitones: [0, 3, 7, 10, 14] }, // B D F# A C#
  { finger: 'middle', label: 'Gmaj7', semitones: [0, 4, 7, 11] }, // G B D F#
  { finger: 'ring', label: 'Em7', semitones: [0, 3, 7, 10] }, // E G B D
  { finger: 'pinky', label: 'F#7', semitones: [0, 4, 7, 10] }, // F# A# C# E
];

const PROGRESSION_ROOT_MIDI: Record<FingerId, number> = {
  // Root placement: B3(59) G3(55) E3(52) F#3(54) — mid register like legacy.
  index: 59,
  middle: 55,
  ring: 52,
  pinky: 54,
  thumb: 59,
};

const COLOR_EXTRA: Record<ChordColor, number[]> = {
  triad: [],
  add9: [14],
  seventh: [14, 19],
  octave: [12, 24],
};

/**
 * Absolute MIDI notes for a progression chord, shaped by the current voicing:
 * color adds tones above the root, inversion raises the lowest notes an octave.
 */
export function fingerJamChordNotes(chordIdx: number, voicing: Voicing): string[] {
  const chord = PROGRESSION[((chordIdx % PROGRESSION.length) + PROGRESSION.length) % PROGRESSION.length];
  const root = PROGRESSION_ROOT_MIDI[chord.finger];
  let midis = chord.semitones.map((iv) => root + iv);
  for (const iv of COLOR_EXTRA[voicing.color]) midis.push(root + iv);
  midis = [...new Set(midis)].sort((a, b) => a - b);
  if (voicing.inversion > 0) {
    const head = midis.slice(0, voicing.inversion).map((m) => m + 12);
    midis = [...midis.slice(voicing.inversion), ...head].sort((a, b) => a - b);
  }
  return midis.map(midiToNote);
}

export function chordIndexForFinger(finger: FingerId): number {
  return PROGRESSION.findIndex((c) => c.finger === finger);
}

/** Legacy left-hand drum map: thumb kick, index hat, middle snare, ring clap, pinky perc(tom). */
export const FINGER_DRUMS: Record<FingerId, 'kick' | 'hat' | 'snare' | 'clap' | 'tom'> = {
  thumb: 'kick',
  index: 'hat',
  middle: 'snare',
  ring: 'clap',
  pinky: 'tom',
};

/** Hold-to-repeat cadence per finger (ms), mirroring the legacy groove loops. */
export const DRUM_REPEAT_MS: Record<FingerId, number> = {
  thumb: 450, // kick: every beat-ish
  index: 110, // hat: 16ths
  middle: 900, // snare: half notes
  ring: 900, // clap: half notes
  pinky: 150, // perc: fast texture
};

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

const NOTE_ORDER: NoteName[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToNote(midi: number): string {
  return `${NOTE_ORDER[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}
