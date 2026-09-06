import { useSettings } from '../stores/settingsStore';
import { usePerf } from '../stores/performanceStore';

/** Master volume / BPM / octave / effects / toggles. */
export default function AudioControls() {
  const s = useSettings((st) => st.settings);
  const set = useSettings((st) => st.set);
  const setEffect = useSettings((st) => st.setEffect);
  const octaves = usePerf((st) => ({ l: st.octaveLeft, r: st.octaveRight }));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-white/50 uppercase tracking-wider">Master vol</span>
          <input
            type="range" min={-40} max={0} step={1}
            value={s.masterVolume}
            onChange={(e) => set('masterVolume', Number(e.target.value))}
          />
          <span className="font-mono text-white/70">{s.masterVolume} dB</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-white/50 uppercase tracking-wider">BPM</span>
          <input
            type="range" min={40} max={200} step={1}
            value={s.bpm}
            onChange={(e) => set('bpm', Number(e.target.value))}
          />
          <span className="font-mono text-white/70">{s.bpm}</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-white/50 uppercase tracking-wider">Base octave</span>
          <input
            type="range" min={2} max={6} step={1}
            value={s.baseOctave}
            onChange={(e) => set('baseOctave', Number(e.target.value))}
          />
          <span className="font-mono text-white/70">C{s.baseOctave}</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-white/50 uppercase tracking-wider">Gesture stability</span>
          <input
            type="range" min={80} max={400} step={10}
            value={s.stabilityMs}
            onChange={(e) => set('stabilityMs', Number(e.target.value))}
          />
          <span className="font-mono text-white/70">{s.stabilityMs} ms</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-white/50 uppercase tracking-wider">Sensitivity</span>
          <input
            type="range" min={0.5} max={1.5} step={0.05}
            value={s.sensitivity}
            onChange={(e) => set('sensitivity', Number(e.target.value))}
          />
          <span className="font-mono text-white/70">{s.sensitivity.toFixed(2)}×</span>
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-white/50 uppercase tracking-wider">Octave shift</span>
          <span className="font-mono text-white/70">L {octaves.l >= 0 ? `+${octaves.l}` : octaves.l} · R {octaves.r >= 0 ? `+${octaves.r}` : octaves.r}</span>
          <span className="text-[10px] text-white/40">change with Thumb Up / Thumb Down</span>
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-[10px] uppercase tracking-widest text-white/40">Effects</div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {(
            [
              ['reverb', 'Reverb', 'wet'],
              ['delay', 'Delay', 'wet'],
              ['chorus', 'Chorus', 'wet'],
              ['distortion', 'Distortion', 'wet'],
              ['tremolo', 'Tremolo', 'wet'],
              ['phaser', 'Phaser', 'wet'],
            ] as const
          ).map(([key, label]) => {
            const eff = s.effects[key];
            return (
              <label key={key} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={eff.enabled}
                  onChange={(e) => setEffect(key, { enabled: e.target.checked })}
                  className="accent-cyan-400"
                />
                <span className="flex-1">{label}</span>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={eff.wet}
                  onChange={(e) => setEffect(key, { wet: Number(e.target.value) })}
                  className="w-16 accent-pink-400"
                />
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs">
        {(
          [
            ['sustain', 'Sustain'],
            ['mirror', 'Mirror camera'],
            ['quantize', 'Quantize to beat'],
            ['arpeggiator', 'Arpeggiator'],
            ['metronome', 'Metronome'],
            ['midiEnabled', 'MIDI output'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={Boolean(s[key])}
              onChange={(e) => set(key, e.target.checked as never)}
              className="accent-cyan-400"
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}
