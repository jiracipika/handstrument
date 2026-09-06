import type { ChordSpec, ChordType, NoteName } from '../types';

export const NOTE_NAMES: NoteName[] = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
];

/** semitone intervals from root for each chord type */
export const CHORD_INTERVALS: Record<Exclude<ChordType, 'custom'>, number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  power: [0, 7, 12],
};

export const CHORD_LABELS: Record<ChordType, string> = {
  major: 'Major',
  minor: 'Minor',
  maj7: 'Major 7',
  min7: 'Minor 7',
  dom7: 'Dominant 7',
  sus2: 'Sus2',
  sus4: 'Sus4',
  dim: 'Diminished',
  aug: 'Augmented',
  power: 'Power Chord',
  custom: 'Custom',
};

const SUFFIX: Record<ChordType, string> = {
  major: '',
  minor: 'm',
  maj7: 'maj7',
  min7: 'm7',
  dom7: '7',
  sus2: 'sus2',
  sus4: 'sus4',
  dim: 'dim',
  aug: 'aug',
  power: '5',
  custom: 'custom',
};

export function noteNameToSemitone(n: NoteName): number {
  return NOTE_NAMES.indexOf(n);
}

export function semitoneToNoteName(s: number): NoteName {
  return NOTE_NAMES[((s % 12) + 12) % 12];
}

/** Absolute semitone value of a note name in a given octave (C4 = MIDI 60). */
export function noteToMidi(note: NoteName, octave: number): number {
  return (octave + 1) * 12 + noteNameToSemitone(note);
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Returns Tone.js note names ("C4") for a chord, root placed in baseOctave. */
export function chordNoteNames(spec: ChordSpec, baseOctave: number): string[] {
  const intervals =
    spec.type === 'custom' ? spec.intervals ?? [0, 4, 7] : CHORD_INTERVALS[spec.type];
  const rootMidi = noteToMidi(spec.root, baseOctave);
  return intervals.map((iv) => {
    const midi = rootMidi + iv;
    const oct = Math.floor(midi / 12) - 1;
    return `${semitoneToNoteName(midi)}${oct}`;
  });
}

export function chordLabel(spec: ChordSpec): string {
  return `${spec.root}${SUFFIX[spec.type]}`;
}

/** Scale degrees in semitones from root. */
export const SCALES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  naturalMinor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

export const SCALE_LABELS: Record<string, string> = {
  major: 'Major',
  naturalMinor: 'Natural Minor',
  pentatonic: 'Pentatonic',
  minorPentatonic: 'Minor Pentatonic',
  blues: 'Blues',
  chromatic: 'Chromatic',
};

/** Notes of a scale built from root at baseOctave, spanning `octaves`. */
export function scaleNoteNames(
  root: NoteName,
  scale: string,
  baseOctave: number,
  octaves = 2,
): string[] {
  const ivs = SCALES[scale] ?? SCALES.major;
  const notes: string[] = [];
  for (let o = 0; o < octaves; o++) {
    for (const iv of ivs) {
      const midi = noteToMidi(root, baseOctave) + iv + o * 12;
      if (midi <= noteToMidi(root, baseOctave) + octaves * 12) {
        notes.push(`${semitoneToNoteName(midi)}${Math.floor(midi / 12) - 1}`);
      }
    }
  }
  return notes;
}
