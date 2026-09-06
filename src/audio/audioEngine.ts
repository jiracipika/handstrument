import * as Tone from 'tone';
import type { EffectSettings } from '../types';

export interface InstrumentPreset {
  id: string;
  name: string;
  voice: 'Synth' | 'FMSynth';
  /** options applied via polySynth.set() */
  options: Partial<Tone.SynthOptions> | Partial<Tone.FMSynthOptions>;
  gainDb: number;
}

type AnyVoiceOptions = Record<string, unknown>;

export const INSTRUMENTS: InstrumentPreset[] = [
  {
    id: 'piano', name: 'Piano', voice: 'Synth', gainDb: -8,
    options: { oscillator: { type: 'triangle' }, envelope: { attack: 0.005, decay: 1.2, sustain: 0.15, release: 1.4 } } as AnyVoiceOptions,
  },
  {
    id: 'epiano', name: 'Electric Piano', voice: 'Synth', gainDb: -8,
    options: { oscillator: { type: 'sine' }, envelope: { attack: 0.004, decay: 0.9, sustain: 0.25, release: 1.1 } } as AnyVoiceOptions,
  },
  {
    id: 'synth', name: 'Synth', voice: 'Synth', gainDb: -12,
    options: { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.02, decay: 0.4, sustain: 0.6, release: 0.5 } } as AnyVoiceOptions,
  },
  {
    id: 'pad', name: 'Ambient Pad', voice: 'Synth', gainDb: -12,
    options: { oscillator: { type: 'sine4' }, envelope: { attack: 0.8, decay: 1.5, sustain: 0.8, release: 3 } } as AnyVoiceOptions,
  },
  {
    id: 'organ', name: 'Organ', voice: 'Synth', gainDb: -14,
    options: { oscillator: { type: 'sine8' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.9, release: 0.12 } } as AnyVoiceOptions,
  },
  {
    id: 'pluck', name: 'Pluck', voice: 'Synth', gainDb: -6,
    options: { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.001, decay: 0.5, sustain: 0.0, release: 0.4 } } as AnyVoiceOptions,
  },
  {
    id: 'bass', name: 'Bass', voice: 'Synth', gainDb: -6,
    options: { oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.6, sustain: 0.5, release: 0.4 } } as AnyVoiceOptions,
  },
  {
    id: 'bells', name: 'Bells', voice: 'FMSynth', gainDb: -10,
    options: {
      harmonicity: 3.01,
      modulationIndex: 6,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 2, sustain: 0, release: 1.5 },
      modulation: { type: 'square' },
      modulationEnvelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.2 },
    } as AnyVoiceOptions,
  },
  {
    id: 'strings', name: 'Strings', voice: 'Synth', gainDb: -14,
    options: { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.4, decay: 0.8, sustain: 0.85, release: 1.8 } } as AnyVoiceOptions,
  },
  {
    id: 'retro', name: 'Retro Synth', voice: 'Synth', gainDb: -12,
    options: { oscillator: { type: 'square' }, envelope: { attack: 0.005, decay: 0.3, sustain: 0.4, release: 0.2 } } as AnyVoiceOptions,
  },
  {
    id: 'lead', name: 'Lead Synth', voice: 'Synth', gainDb: -14,
    options: { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3 } } as AnyVoiceOptions,
  },
  {
    id: 'softpad', name: 'Soft Pad', voice: 'Synth', gainDb: -12,
    options: { oscillator: { type: 'triangle' }, envelope: { attack: 0.6, decay: 1, sustain: 0.7, release: 2.5 } } as AnyVoiceOptions,
  },
];

export function instrumentById(id: string): InstrumentPreset {
  return INSTRUMENTS.find((i) => i.id === id) ?? INSTRUMENTS[0];
}

export function buildPoly(instrumentId: string): Tone.PolySynth {
  const preset = instrumentById(instrumentId);
  const poly =
    preset.voice === 'FMSynth'
      ? new Tone.PolySynth(Tone.FMSynth)
      : new Tone.PolySynth(Tone.Synth);
  poly.maxPolyphony = 16;
  poly.set(preset.options as never);
  return poly;
}

/**
 * AudioEngine owns all Tone.js nodes. Audio triggering is fully outside React:
 * the engine exposes imperative methods; UI only calls them.
 */
export class AudioEngine {
  private started = false;
  private lastChordNotes: Record<'left' | 'right', { notes: string; time: number }> = {
    left: { notes: '', time: 0 },
    right: { notes: '', time: 0 },
  };
  private voices: Record<'left' | 'right', { poly: Tone.PolySynth; gain: Tone.Gain; panner: Tone.Panner; filter: Tone.Filter }> | null = null;
  private master: Tone.Gain | null = null;
  private chain: {
    filter: Tone.Filter;
    dist: Tone.Distortion;
    chorus: Tone.Chorus;
    phaser: Tone.Phaser;
    tremolo: Tone.Tremolo;
    delay: Tone.FeedbackDelay;
    reverb: Tone.Reverb;
  } | null = null;
  private analyser: Tone.Analyser | null = null;
  private drums: {
    kick: Tone.MembraneSynth;
    snare: Tone.NoiseSynth;
    hat: Tone.NoiseSynth;
    clap: Tone.NoiseSynth;
  } | null = null;
  private metronome: { synth: Tone.Synth; loop: Tone.Loop } | null = null;

  async start(): Promise<void> {
    if (this.started) return;
    await Tone.start();

    this.master = new Tone.Gain(0.8).toDestination();
    this.analyser = new Tone.Analyser('fft', 64);
    this.master.connect(this.analyser);

    this.chain = {
      filter: new Tone.Filter(20000, 'lowpass'),
      dist: new Tone.Distortion(0.4),
      chorus: new Tone.Chorus(4, 2.5, 0.5).start(),
      phaser: new Tone.Phaser({ frequency: 0.5, octaves: 3, baseFrequency: 350 }),
      tremolo: new Tone.Tremolo(4, 0.5).start(),
      delay: new Tone.FeedbackDelay(0.25, 0.3),
      reverb: new Tone.Reverb({ decay: 2.4, wet: 0.25 }),
    };

    this.chain.filter.connect(this.chain.dist);
    this.chain.dist.connect(this.chain.chorus);
    this.chain.chorus.connect(this.chain.phaser);
    this.chain.phaser.connect(this.chain.tremolo);
    this.chain.tremolo.connect(this.chain.delay);
    this.chain.delay.connect(this.chain.reverb);
    this.chain.reverb.connect(this.master);

    this.voices = {
      left: this.buildVoice('piano'),
      right: this.buildVoice('synth'),
    };

    const dg = new Tone.Gain(0.9).connect(this.master);
    this.drums = {
      kick: new Tone.MembraneSynth().connect(dg),
      snare: new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.2, sustain: 0 } }).connect(dg),
      hat: new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.05, sustain: 0 } }).connect(dg),
      clap: new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.001, decay: 0.15, sustain: 0 } }).connect(dg),
    };

    this.started = true;
  }

  private buildVoice(instrumentId: string) {
    const preset = instrumentById(instrumentId);
    const gain = new Tone.Gain(Tone.dbToGain(preset.gainDb));
    const panner = new Tone.Panner(0);
    const filter = new Tone.Filter(20000, 'lowpass');
    filter.connect(panner);
    panner.connect(gain);
    gain.connect(this.chain!.filter);
    return { poly: buildPoly(instrumentId), gain, panner, filter };
  }

  setInstrument(hand: 'left' | 'right', instrumentId: string): void {
    if (!this.voices || !this.started) return;
    const old = this.voices[hand];
    old.poly.releaseAll();
    old.poly.dispose();
    old.filter.dispose();
    old.panner.dispose();
    old.gain.dispose();
    this.voices[hand] = this.buildVoice(instrumentId);
  }

  playChord(
    hand: 'left' | 'right',
    noteNames: string[],
    opts: { velocity?: number } = {},
  ): void {
    if (!this.voices || !this.started) return;
    // Debounce: ignore identical re-triggers within 80 ms. Landmark jitter can
    // fire the same activation edge twice; re-attacking the same notes back to
    // back sounds like a stutter.
    const key = noteNames.join(',');
    const now = performance.now();
    const last = this.lastChordNotes[hand];
    if (last.notes === key && now - last.time < 80) return;
    last.notes = key;
    last.time = now;

    const v = this.voices[hand];
    v.poly.releaseAll();
    v.poly.triggerAttack(noteNames, Tone.now(), opts.velocity ?? 0.8);
  }

  stopHand(hand: 'left' | 'right'): void {
    if (!this.voices || !this.started) return;
    this.voices[hand].poly.releaseAll();
  }

  stopAll(): void {
    if (!this.voices) return;
    this.voices.left.poly.releaseAll();
    this.voices.right.poly.releaseAll();
  }

  triggerDrum(d: 'kick' | 'snare' | 'hat' | 'clap'): void {
    if (!this.drums || !this.started) return;
    const t = Tone.now();
    if (d === 'kick') this.drums.kick.triggerAttackRelease('C1', '8n', t);
    else this.drums[d].triggerAttackRelease('16n', t);
  }

  applyEffects(e: EffectSettings): void {
    if (!this.chain || !this.started) return;
    this.chain.reverb.wet.value = e.reverb.enabled ? e.reverb.wet : 0;
    this.chain.delay.wet.value = e.delay.enabled ? e.delay.wet : 0;
    this.chain.delay.delayTime.value = e.delay.time;
    this.chain.delay.feedback.value = e.delay.feedback;
    this.chain.chorus.wet.value = e.chorus.enabled ? e.chorus.wet : 0;
    this.chain.dist.wet.value = e.distortion.enabled ? e.distortion.wet : 0;
    this.chain.filter.frequency.value = e.filter.enabled ? e.filter.freq : 20000;
    this.chain.tremolo.wet.value = e.tremolo.enabled ? e.tremolo.wet : 0;
    this.chain.phaser.wet.value = e.phaser.enabled ? e.phaser.wet : 0;
  }

  /** Continuous expression params per hand. */
  setExpression(
    hand: 'left' | 'right',
    expr: { pan?: number; filter?: number; volume?: number },
  ): void {
    if (!this.voices) return;
    const v = this.voices[hand];
    // Deadbands stop parameter chatter (audible zipper noise) when the hand
    // is near the center or holding still.
    if (expr.pan !== undefined && Math.abs(expr.pan) > 0.05) {
      v.panner.pan.rampTo(Math.max(-1, Math.min(1, expr.pan)), 0.08);
    } else if (expr.pan !== undefined) {
      v.panner.pan.rampTo(0, 0.08);
    }
    if (expr.filter !== undefined) {
      const f = Math.max(80, Math.min(16000, expr.filter));
      v.filter.frequency.rampTo(f, 0.1);
    }
    if (expr.volume !== undefined) {
      const g = Math.max(0, Math.min(1.5, expr.volume));
      // only move when the change is audible (>1 dB-ish)
      if (Math.abs(g - v.gain.gain.value) > 0.02) {
        v.gain.gain.rampTo(g, 0.15);
      }
    }
  }

  startMetronome(bpm: number): void {
    if (!this.started) return;
    // Idempotent: syncing settings on every React commit must not restart the
    // transport (a restart audibly clips the current beat).
    if (this.metronome) {
      Tone.getTransport().bpm.value = bpm;
      return;
    }
    const synth = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0 },
    }).toDestination();
    synth.volume.value = -18;
    let beat = 0;
    const loop = new Tone.Loop((time) => {
      synth.triggerAttackRelease(beat % 4 === 0 ? 'C6' : 'C5', '16n', time);
      beat = (beat + 1) % 4;
    }, '4n').start(0);
    Tone.getTransport().bpm.value = bpm;
    Tone.getTransport().start();
    this.metronome = { synth, loop };
  }

  stopMetronome(): void {
    if (!this.metronome) return;
    this.metronome.loop.stop();
    this.metronome.loop.dispose();
    this.metronome.synth.dispose();
    Tone.getTransport().stop();
    this.metronome = null;
  }

  setBpm(bpm: number): void {
    if (!this.started) return;
    Tone.getTransport().bpm.value = bpm;
  }

  setMasterVolume(db: number): void {
    if (!this.master) return;
    this.master.gain.rampTo(Tone.dbToGain(db), 0.05);
  }

  getSpectrum(): Float32Array | Float32Array[] | null {
    if (!this.analyser) return null;
    return this.analyser.getValue() as Float32Array | Float32Array[];
  }

  dispose(): void {
    this.stopMetronome();
    if (this.voices) {
      this.voices.left.poly.dispose();
      this.voices.right.poly.dispose();
      this.voices.left.gain.dispose();
      this.voices.right.gain.dispose();
    }
    this.drums?.kick.dispose();
    this.drums?.snare.dispose();
    this.drums?.hat.dispose();
    this.drums?.clap.dispose();
    this.chain?.filter.dispose();
    this.chain?.dist.dispose();
    this.chain?.chorus.dispose();
    this.chain?.phaser.dispose();
    this.chain?.tremolo.dispose();
    this.chain?.delay.dispose();
    this.chain?.reverb.dispose();
    this.master?.dispose();
    this.started = false;
  }
}
