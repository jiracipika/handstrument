import { useSettings } from '../stores/settingsStore';
import { usePerf } from '../stores/performanceStore';

function Slider({
  label, value, display, min, max, step, onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="hs-card flex flex-col gap-1 p-2.5">
      <div className="flex items-baseline justify-between">
        <span className="hs-label">{label}</span>
        <span className="mono text-xs text-white/75">{display}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function Toggle({
  label, on, onToggle,
}: {
  label: string;
  on: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <button className="hs-chip" data-on={on} onClick={() => onToggle(!on)}>
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: on ? 'currentColor' : 'rgba(255,255,255,0.25)' }}
      />
      {label}
    </button>
  );
}

/** Master volume / BPM / octave / effects / toggles. */
export default function AudioControls() {
  const s = useSettings((st) => st.settings);
  const set = useSettings((st) => st.set);
  const setEffect = useSettings((st) => st.setEffect);
  const octL = usePerf((st) => st.octaveLeft);
  const octR = usePerf((st) => st.octaveRight);
  const fmt = (n: number) => (n >= 0 ? `+${n}` : String(n));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        <Slider label="Master vol" value={s.masterVolume} display={`${s.masterVolume} dB`}
          min={-40} max={0} step={1} onChange={(v) => set('masterVolume', v)} />
        <Slider label="BPM" value={s.bpm} display={String(s.bpm)}
          min={40} max={200} step={1} onChange={(v) => set('bpm', v)} />
        <Slider label="Base octave" value={s.baseOctave} display={`C${s.baseOctave}`}
          min={2} max={6} step={1} onChange={(v) => set('baseOctave', v)} />
        <Slider label="Stability" value={s.stabilityMs} display={`${s.stabilityMs} ms`}
          min={80} max={400} step={10} onChange={(v) => set('stabilityMs', v)} />
        <Slider label="Sensitivity" value={s.sensitivity} display={`${s.sensitivity.toFixed(2)}×`}
          min={0.5} max={1.5} step={0.05} onChange={(v) => set('sensitivity', v)} />
        <div className="hs-card flex flex-col gap-1 p-2.5">
          <span className="hs-label">Octave shift</span>
          <span className="mono text-xs text-white/75">L {fmt(octL)} · R {fmt(octR)}</span>
          <span className="text-[10px] text-white/40">Thumb Up / Thumb Down</span>
        </div>
      </div>

      <div>
        <div className="hs-label mb-1.5">Effects</div>
        <div className="grid grid-cols-2 gap-2">
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
              <div
                key={key}
                className="hs-card flex items-center gap-2 px-2.5 py-1.5"
                style={eff.enabled ? { borderColor: 'rgba(34,211,238,0.35)' } : undefined}
              >
                <button
                  className="flex h-4 w-7 shrink-0 items-center rounded-full border border-white/15 transition-colors"
                  style={{
                    background: eff.enabled ? 'rgba(34,211,238,0.55)' : 'rgba(255,255,255,0.08)',
                    borderColor: eff.enabled ? 'transparent' : undefined,
                  }}
                  role="switch"
                  aria-checked={eff.enabled}
                  aria-label={`${label} on`}
                  onClick={() => setEffect(key, { enabled: !eff.enabled })}
                >
                  <span
                    className="h-3 w-3 rounded-full bg-white transition-transform"
                    style={{ transform: `translateX(${eff.enabled ? 12 : 2}px)` }}
                  />
                </button>
                <span className={`flex-1 text-xs ${eff.enabled ? 'text-white/90' : 'text-white/45'}`}>{label}</span>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={eff.wet}
                  onChange={(e) => setEffect(key, { wet: Number(e.target.value) })}
                  className="w-14"
                  aria-label={`${label} mix`}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['sustain', 'Sustain'],
            ['mirror', 'Mirror camera'],
            ['quantize', 'Quantize'],
            ['arpeggiator', 'Arpeggiator'],
            ['metronome', 'Metronome'],
            ['midiEnabled', 'MIDI output'],
          ] as const
        ).map(([key, label]) => (
          <Toggle key={key} label={label} on={Boolean(s[key])} onToggle={(v) => set(key, v as never)} />
        ))}
      </div>
    </div>
  );
}
