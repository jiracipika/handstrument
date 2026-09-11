// Core shared types for HandStrument

export type HandId = 'left' | 'right' | 'unknown';

export interface Vec2 {
  x: number;
  y: number;
}

export type GestureId =
  | 'openPalm'
  | 'flat'
  | 'fist'
  | 'point'
  | 'peace'
  | 'three'
  | 'four'
  | 'thumbUp'
  | 'thumbDown'
  | 'pinch'
  | 'ok'
  | 'rock'
  | 'none'
  | `custom:${string}`;

export type MotionGestureId =
  | 'swipeLeft'
  | 'swipeRight'
  | 'swipeUp'
  | 'swipeDown'
  | 'moveCloser'
  | 'moveAway'
  | 'rotateCW'
  | 'rotateCCW'
  | 'circle';

export interface GestureMatch {
  gesture: GestureId;
  confidence: number; // 0..1
}

/** Continuous, resolution-independent features extracted from one hand's landmarks. */
export interface HandFeatures {
  /** per-finger extension 0..1 (thumb, index, middle, ring, pinky) */
  extensions: number[];
  /** boolean-ish: finger considered extended */
  fingersUp: boolean[];
  /** normalized thumb-index tip distance (0..~1.5), divided by hand size */
  pinchDistance: number;
  /** average pairwise tip spread, divided by hand size */
  spread: number;
  /** palm roll angle in radians (wrist -> middle MCP vs vertical) */
  rollAngle: number;
  /** hand size in normalized units (proxy for distance from camera) */
  handSize: number;
  /** palm center in video-normalized coords (0..1) */
  palmCenter: Vec2;
  /** velocity in normalized units/sec (smoothed) */
  velocity: Vec2;
  /** angular velocity of roll angle, rad/sec (smoothed) */
  rollVelocity: number;
}

export interface TrackedHand {
  id: HandId;
  /** 21 landmarks in normalized video coords */
  landmarks: Vec2[];
  score: number;
  features: HandFeatures;
  lastSeen: number; // ms timestamp
}

export type ChordType =
  | 'major'
  | 'minor'
  | 'maj7'
  | 'min7'
  | 'dom7'
  | 'sus2'
  | 'sus4'
  | 'dim'
  | 'aug'
  | 'power'
  | 'custom';

export type NoteName =
  | 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';

export interface ChordSpec {
  root: NoteName;
  type: ChordType;
  /** custom interval semitones, used when type === 'custom' */
  intervals?: number[];
}

export type DrumKind = 'kick' | 'snare' | 'hat' | 'clap' | 'tom' | 'cowbell';

export type ChordAction =
  | { kind: 'chord'; chord: ChordSpec }
  | { kind: 'note'; note: NoteName }
  | { kind: 'stop' }
  | { kind: 'octaveUp' }
  | { kind: 'octaveDown' }
  | { kind: 'drum'; drum: DrumKind }
  | { kind: 'none' };

export type HandMapping = Partial<Record<GestureId, ChordAction>>;

export interface ExpressionMapping {
  vertical: 'none' | 'octaveShift' | 'pitchBend';
  horizontal: 'none' | 'pan';
  pinch: 'none' | 'filter';
  handSize: 'none' | 'volume';
  roll: 'none' | 'reverb' | 'delay';
}

export const DEFAULT_EXPRESSION: ExpressionMapping = {
  vertical: 'octaveShift',
  horizontal: 'pan',
  pinch: 'filter',
  handSize: 'volume',
  roll: 'reverb',
};

export interface EffectSettings {
  reverb: { enabled: boolean; wet: number };
  delay: { enabled: boolean; wet: number; time: number; feedback: number };
  chorus: { enabled: boolean; wet: number };
  distortion: { enabled: boolean; wet: number };
  filter: { enabled: boolean; freq: number };
  tremolo: { enabled: boolean; wet: number; frequency: number };
  phaser: { enabled: boolean; wet: number };
}

export const DEFAULT_EFFECTS: EffectSettings = {
  reverb: { enabled: true, wet: 0.25 },
  delay: { enabled: false, wet: 0.2, time: 0.25, feedback: 0.3 },
  chorus: { enabled: false, wet: 0.3 },
  distortion: { enabled: false, wet: 0.15 },
  filter: { enabled: false, freq: 8000 },
  tremolo: { enabled: false, wet: 0.3, frequency: 4 },
  phaser: { enabled: false, wet: 0.3 },
};

export interface GlobalSettings {
  masterVolume: number; // dB, -60..0
  bpm: number;
  sustain: boolean;
  baseOctave: number; // 1..6
  instrumentLeft: string;
  instrumentRight: string;
  sensitivity: number; // 0.5..1.5 gesture recognition sensitivity
  stabilityMs: number; // gesture must be stable this long (ms)
  mirror: boolean;
  quantize: boolean;
  arpeggiator: boolean;
  metronome: boolean;
  midiEnabled: boolean;
  expression: ExpressionMapping;
  effects: EffectSettings;
  mappingLeft: HandMapping;
  mappingRight: HandMapping;
  onboardingDone: boolean;
}
