import type { ChordSpec, ChordAction, GestureId, HandMapping, NoteName } from '../types';

export const GESTURE_LABELS: Record<string, string> = {
  openPalm: 'Open Palm',
  flat: 'Flat Hand',
  fist: 'Fist',
  point: 'Point',
  peace: 'Peace',
  three: 'Three Fingers',
  four: 'Four Fingers',
  thumbUp: 'Thumb Up',
  thumbDown: 'Thumb Down',
  pinch: 'Pinch',
  ok: 'OK',
  rock: 'Rock / Horns',
  none: '—',
};

export const CHORD_TYPES: ChordSpec['type'][] = [
  'major', 'minor', 'maj7', 'min7', 'dom7', 'sus2', 'sus4', 'dim', 'aug', 'power',
];

export const NOTE_NAMES_ALL: NoteName[] = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
];

export const MAPPABLE_GESTURES: GestureId[] = [
  'openPalm', 'point', 'peace', 'three', 'four', 'thumbUp', 'thumbDown', 'pinch', 'ok', 'rock', 'fist', 'flat',
];

/** Instant Jam preset: gesture -> action for both hands. */
export function instantJamMapping(hand: 'left' | 'right'): HandMapping {
  if (hand === 'left') {
    return {
      openPalm: { kind: 'chord', chord: { root: 'C', type: 'major' } },
      peace: { kind: 'chord', chord: { root: 'F', type: 'major' } },
      three: { kind: 'chord', chord: { root: 'A', type: 'minor' } },
      fist: { kind: 'stop' },
    };
  }
  return {
    openPalm: { kind: 'chord', chord: { root: 'G', type: 'major' } },
    point: { kind: 'chord', chord: { root: 'D', type: 'minor' } },
    peace: { kind: 'chord', chord: { root: 'A', type: 'minor' } },
    three: { kind: 'chord', chord: { root: 'F', type: 'major' } },
    four: { kind: 'chord', chord: { root: 'G', type: 'dom7' } },
    rock: { kind: 'chord', chord: { root: 'E', type: 'minor' } },
    thumbUp: { kind: 'octaveUp' },
    thumbDown: { kind: 'octaveDown' },
    pinch: { kind: 'drum', drum: 'kick' },
    ok: { kind: 'drum', drum: 'snare' },
    fist: { kind: 'stop' },
  };
}

export function describeAction(a: ChordAction | undefined): string {
  if (!a || a.kind === 'none') return '—';
  switch (a.kind) {
    case 'chord': {
      const { root, type } = a.chord;
      return `${root}${type === 'major' ? '' : type}`;
    }
    case 'note':
      return a.note;
    case 'stop':
      return 'Stop';
    case 'octaveUp':
      return 'Octave +';
    case 'octaveDown':
      return 'Octave −';
    case 'drum':
      return `Drum: ${a.drum}`;
    default:
      return '—';
  }
}
