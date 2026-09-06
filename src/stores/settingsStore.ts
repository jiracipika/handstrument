import { create } from 'zustand';
import type {
  EffectSettings,
  GlobalSettings,
  GestureId,
  ChordAction,
  HandMapping,
  NoteName,
  ChordType,
} from '../types';
import { DEFAULT_EFFECTS, DEFAULT_EXPRESSION } from '../types';
import { instantJamMapping } from '../audio/mappings';

const LS_KEY = 'handstrument:settings:v1';

function defaults(): GlobalSettings {
  return {
    masterVolume: -8,
    bpm: 100,
    sustain: true,
    baseOctave: 4,
    instrumentLeft: 'piano',
    instrumentRight: 'synth',
    sensitivity: 1.0,
    stabilityMs: 180,
    mirror: true,
    quantize: false,
    arpeggiator: false,
    metronome: false,
    midiEnabled: false,
    expression: { ...DEFAULT_EXPRESSION },
    effects: structuredClone(DEFAULT_EFFECTS),
    mappingLeft: instantJamMapping('left'),
    mappingRight: instantJamMapping('right'),
    onboardingDone: false,
  };
}

interface SettingsState {
  settings: GlobalSettings;
  set<K extends keyof GlobalSettings>(key: K, value: GlobalSettings[K]): void;
  setEffect<K extends keyof EffectSettings>(
    key: K,
    value: Partial<EffectSettings[K]>,
  ): void;
  setMapping(hand: 'left' | 'right', gesture: GestureId, action: ChordAction | undefined): void;
  clearMapping(hand: 'left' | 'right', gesture: GestureId): void;
  setChord(
    hand: 'left' | 'right',
    gesture: GestureId,
    root: NoteName,
    type: ChordType,
  ): void;
  resetDefaults(): void;
  markOnboardingDone(): void;
  importSettings(json: string): boolean;
  exportSettings(): string;
}

function load(): GlobalSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Partial<GlobalSettings>;
    const d = defaults();
    return { ...d, ...parsed, expression: { ...d.expression, ...parsed.expression }, effects: { ...structuredClone(d.effects), ...parsed.effects } };
  } catch {
    return defaults();
  }
}

function persist(s: GlobalSettings): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* storage may be unavailable */
  }
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: load(),
  set: (key, value) => {
    set((st) => ({ settings: { ...st.settings, [key]: value } }));
    persist(get().settings);
  },
  setEffect: (key, value) => {
    set((st) => ({
      settings: {
        ...st.settings,
        effects: { ...st.settings.effects, [key]: { ...st.settings.effects[key], ...value } },
      },
    }));
    persist(get().settings);
  },
  setMapping: (hand, gesture, action) => {
    set((st) => {
      const m: HandMapping = { ...(hand === 'left' ? st.settings.mappingLeft : st.settings.mappingRight) };
      if (action) m[gesture] = action;
      else delete m[gesture];
      return {
        settings: {
          ...st.settings,
          [hand === 'left' ? 'mappingLeft' : 'mappingRight']: m,
        },
      };
    });
    persist(get().settings);
  },
  clearMapping: (hand, gesture) => {
    get().setMapping(hand, gesture, undefined);
  },
  setChord: (hand, gesture, root, type) => {
    get().setMapping(hand, gesture, { kind: 'chord', chord: { root, type } });
  },
  resetDefaults: () => {
    set({ settings: defaults() });
    persist(get().settings);
  },
  markOnboardingDone: () => {
    set((st) => ({ settings: { ...st.settings, onboardingDone: true } }));
    persist(get().settings);
  },
  importSettings: (json) => {
    try {
      const parsed = JSON.parse(json) as GlobalSettings;
      set({ settings: { ...defaults(), ...parsed } });
      persist(get().settings);
      return true;
    } catch {
      return false;
    }
  },
  exportSettings: () => JSON.stringify(get().settings, null, 2),
}));
