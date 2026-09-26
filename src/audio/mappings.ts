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

/** Sound preset: instruments + effects + play-mode settings in one pick. */
export interface SoundPreset {
  id: string;
  name: string;
  description?: string;
  instrumentLeft: string;
  instrumentRight: string;
  effects?: Partial<{
    reverb: { enabled: boolean; wet: number };
    delay: { enabled: boolean; wet: number };
    chorus: { enabled: boolean; wet: number };
    distortion: { enabled: boolean; wet: number };
    tremolo: { enabled: boolean; wet: number };
    phaser: { enabled: boolean; wet: number };
  }>;
  masterVolume?: number;
}

export const SOUND_PRESETS: SoundPreset[] = [
  {
    id: 'jam',
    name: 'Instant Jam',
    description: 'Bright chords, ready to play',
    instrumentLeft: 'piano',
    instrumentRight: 'synth',
    effects: { reverb: { enabled: true, wet: 0.25 } },
  },
  {
    id: 'ambient',
    name: 'Ambient',
    description: 'Floating pads and glassy echoes',
    instrumentLeft: 'softpad',
    instrumentRight: 'glass',
    effects: {
      reverb: { enabled: true, wet: 0.55 },
      delay: { enabled: true, wet: 0.35 },
      chorus: { enabled: true, wet: 0.4 },
    },
    masterVolume: -10,
  },
  {
    id: 'cathedral',
    name: 'Cathedral',
    description: 'A huge, resonant space',
    instrumentLeft: 'choir',
    instrumentRight: 'vibes',
    effects: { reverb: { enabled: true, wet: 0.8 } },
    masterVolume: -10,
  },
  {
    id: 'lofi',
    name: 'Lo-fi',
    description: 'Soft keys with warm color',
    instrumentLeft: 'epiano',
    instrumentRight: 'marimba',
    effects: {
      reverb: { enabled: true, wet: 0.2 },
      chorus: { enabled: true, wet: 0.3 },
      distortion: { enabled: true, wet: 0.12 },
      tremolo: { enabled: true, wet: 0.25 },
    },
    masterVolume: -8,
  },
  {
    id: 'retrowave',
    name: 'Retrowave',
    description: 'Wide analog motion',
    instrumentLeft: 'strings',
    instrumentRight: 'hardsync',
    effects: {
      reverb: { enabled: true, wet: 0.35 },
      delay: { enabled: true, wet: 0.3 },
      chorus: { enabled: true, wet: 0.5 },
      phaser: { enabled: true, wet: 0.35 },
    },
    masterVolume: -12,
  },
  {
    id: 'pluck',
    name: 'Plucked',
    description: 'Delicate acoustic textures',
    instrumentLeft: 'harp',
    instrumentRight: 'kalimba',
    effects: { reverb: { enabled: true, wet: 0.3 }, delay: { enabled: true, wet: 0.2 } },
    masterVolume: -6,
  },
  {
    id: 'organ',
    name: 'Organ Duo',
    description: 'Full harmonics and sustain',
    instrumentLeft: 'organ',
    instrumentRight: 'organfull',
    effects: { reverb: { enabled: true, wet: 0.2 }, tremolo: { enabled: true, wet: 0.2 } },
    masterVolume: -10,
  },
  {
    id: 'sub',
    name: 'Sub & Lead',
    description: 'Deep lows and cutting highs',
    instrumentLeft: 'subbass',
    instrumentRight: 'lead',
    effects: { reverb: { enabled: true, wet: 0.15 }, distortion: { enabled: true, wet: 0.1 } },
    masterVolume: -8,
  },
  { id: 'cosmic', name: 'Cosmic Bloom', description: 'Shimmering keys and long tails',
    instrumentLeft: 'dream', instrumentRight: 'celesta',
    effects: { reverb: { enabled: true, wet: 0.5 }, delay: { enabled: true, wet: 0.24 } }, masterVolume: -10 },
  { id: 'arcade', name: 'Arcade Pulse', description: 'Playful pixel notes and mallets',
    instrumentLeft: 'chiptune', instrumentRight: 'mallet',
    effects: { reverb: { enabled: true, wet: 0.12 } }, masterVolume: -11 },
  { id: 'jazz', name: 'After Hours', description: 'Warm brass over velvet keys',
    instrumentLeft: 'epiano', instrumentRight: 'brass',
    effects: { reverb: { enabled: true, wet: 0.2 } }, masterVolume: -10 },
  { id: 'air', name: 'Open Air', description: 'Breathy melody over dream keys',
    instrumentLeft: 'dream', instrumentRight: 'flute',
    effects: { reverb: { enabled: true, wet: 0.32 }, delay: { enabled: true, wet: 0.15 } }, masterVolume: -9 },
];
