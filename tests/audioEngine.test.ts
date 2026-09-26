import { describe, expect, it, vi } from 'vitest';

const audio = vi.hoisted(() => {
  const nodes: Array<{ kind: string; connections: unknown[]; disposed: boolean; started: boolean }> = [];
  class Node {
    kind: string;
    connections: unknown[] = [];
    disposed = false;
    started = false;
    wet = { value: 0 };
    gain = { value: 1, rampTo: vi.fn() };
    pan = { rampTo: vi.fn() };
    frequency = { value: 0, rampTo: vi.fn() };
    delayTime = { value: 0 };
    feedback = { value: 0 };
    volume = { value: 0 };
    maxPolyphony = 0;
    releaseAll = vi.fn();
    triggerAttack = vi.fn();
    triggerAttackRelease = vi.fn();
    set = vi.fn();
    constructor(kind: string) { this.kind = kind; nodes.push(this); }
    connect(target: unknown) { this.connections.push(target); return this; }
    toDestination() { return this; }
    start() { this.started = true; return this; }
    stop() { this.started = false; return this; }
    dispose() { this.disposed = true; this.connections = []; return this; }
    getValue() { return new Float32Array(64); }
  }
  return { Node, nodes };
});

vi.mock('tone', () => {
  const make = (kind: string) => class extends audio.Node { constructor(..._args: unknown[]) { super(kind); } };
  return {
    start: vi.fn().mockResolvedValue(undefined),
    now: () => 1,
    dbToGain: (v: number) => 10 ** (v / 20),
    getTransport: () => ({ state: 'stopped', bpm: { value: 100 } }),
    Gain: make('Gain'), Analyser: make('Analyser'), Filter: make('Filter'), Panner: make('Panner'),
    Distortion: make('Distortion'), Chorus: make('Chorus'), Phaser: make('Phaser'),
    Tremolo: make('Tremolo'), FeedbackDelay: make('FeedbackDelay'), Reverb: make('Reverb'),
    PolySynth: make('PolySynth'), Synth: make('Synth'), FMSynth: make('FMSynth'),
    MembraneSynth: make('MembraneSynth'), NoiseSynth: make('NoiseSynth'),
  };
});

import { AudioEngine } from '../src/audio/audioEngine';
import { DEFAULT_EFFECTS } from '../src/types';

describe('audio signal path', () => {
  it('connects each playable synth through its filter to the output and keeps bypassed effects connected', async () => {
    audio.nodes.length = 0;
    const engine = new AudioEngine();
    await engine.start();
    const voices = audio.nodes.filter((node) => node.kind === 'PolySynth');
    expect(voices).toHaveLength(2);
    for (const voice of voices) {
      const filter = voice.connections[0] as InstanceType<typeof audio.Node>;
      expect(filter?.kind).toBe('Filter');
      expect(filter.connections[0]).toMatchObject({ kind: 'Panner' });
    }
    const chorus = audio.nodes.find((node) => node.kind === 'Chorus')!;
    const tremolo = audio.nodes.find((node) => node.kind === 'Tremolo')!;
    engine.applyEffects(DEFAULT_EFFECTS);
    expect(chorus.disposed).toBe(false);
    expect(tremolo.disposed).toBe(false);
    expect(chorus.connections[0]).toMatchObject({ kind: 'Phaser' });
    engine.applyEffects({ ...DEFAULT_EFFECTS, chorus: { enabled: true, wet: 0.4 } });
    expect(chorus.started).toBe(true);
    engine.applyEffects(DEFAULT_EFFECTS);
    expect(chorus.started).toBe(false);
    expect(chorus.disposed).toBe(false);
  });

  it('releases notes and clears the debounce when a hand disappears', async () => {
    audio.nodes.length = 0;
    const engine = new AudioEngine();
    await engine.start();
    engine.playChord('left', ['C4'], { sustain: true });
    const voice = audio.nodes.find((node) => node.kind === 'PolySynth')! as InstanceType<typeof audio.Node>;
    expect(voice.triggerAttack).toHaveBeenCalledTimes(1);
    engine.stopHand('left');
    engine.playChord('left', ['C4'], { sustain: true });
    expect(voice.triggerAttack).toHaveBeenCalledTimes(2);
  });
});
