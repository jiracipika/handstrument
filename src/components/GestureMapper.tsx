import { useSettings } from '../stores/settingsStore';
import { INSTRUMENTS } from '../audio/audioEngine';
import { GESTURE_LABELS, MAPPABLE_GESTURES, NOTE_NAMES_ALL, CHORD_TYPES } from '../audio/mappings';
import { CHORD_LABELS } from '../audio/chords';
import type { ChordAction, GestureId } from '../types';

/** Editable gesture -> musical action mapping table (left/right). */
export default function GestureMapper() {
  const settings = useSettings((s) => s.settings);
  const setMapping = useSettings((s) => s.setMapping);
  const clearMapping = useSettings((s) => s.clearMapping);

  const current = (hand: 'left' | 'right', g: GestureId): ChordAction | undefined =>
    (hand === 'left' ? settings.mappingLeft : settings.mappingRight)[g];

  const setChord = (hand: 'left' | 'right', g: GestureId, root: string, type: string) => {
    setMapping(hand, g, {
      kind: 'chord',
      chord: { root: root as never, type: type as never },
    });
  };

  const ActionEditor = ({ hand, g }: { hand: 'left' | 'right'; g: GestureId }) => {
    const action = current(hand, g);
    return (
      <div className="flex flex-col gap-1">
        <select
          className="rounded-md border border-white/15 bg-black/50 px-2 py-1 text-xs text-white"
          value={action?.kind ?? 'none'}
          onChange={(e) => {
            const kind = e.target.value;
            if (kind === 'none') clearMapping(hand, g);
            else if (kind === 'chord') setChord(hand, g, 'C', 'major');
            else if (kind === 'stop') setMapping(hand, g, { kind: 'stop' });
            else if (kind === 'octaveUp') setMapping(hand, g, { kind: 'octaveUp' });
            else if (kind === 'octaveDown') setMapping(hand, g, { kind: 'octaveDown' });
            else if (kind === 'drum') setMapping(hand, g, { kind: 'drum', drum: 'kick' });
            else if (kind === 'note') setMapping(hand, g, { kind: 'note', note: 'C' });
          }}
        >
          <option value="none">—</option>
          <option value="chord">Chord</option>
          <option value="note">Single note</option>
          <option value="stop">Stop</option>
          <option value="octaveUp">Octave +</option>
          <option value="octaveDown">Octave −</option>
          <option value="drum">Drum</option>
        </select>

        {action?.kind === 'chord' && (
          <div className="flex gap-1">
            <select
              className="rounded-md border border-white/15 bg-black/50 px-1 py-0.5 text-xs text-white"
              value={action.chord.root}
              onChange={(e) => setChord(hand, g, e.target.value, action.chord.type)}
            >
              {NOTE_NAMES_ALL.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <select
              className="rounded-md border border-white/15 bg-black/50 px-1 py-0.5 text-xs text-white"
              value={action.chord.type}
              onChange={(e) => setChord(hand, g, action.chord.root, e.target.value)}
            >
              {CHORD_TYPES.map((t) => (
                <option key={t} value={t}>{CHORD_LABELS[t]}</option>
              ))}
            </select>
          </div>
        )}
        {action?.kind === 'note' && (
          <select
            className="rounded-md border border-white/15 bg-black/50 px-1 py-0.5 text-xs text-white"
            value={action.note}
            onChange={(e) => setMapping(hand, g, { kind: 'note', note: e.target.value as never })}
          >
            {NOTE_NAMES_ALL.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        )}
        {action?.kind === 'drum' && (
          <select
            className="rounded-md border border-white/15 bg-black/50 px-1 py-0.5 text-xs text-white"
            value={action.drum}
            onChange={(e) =>
              setMapping(hand, g, { kind: 'drum', drum: e.target.value as 'kick' | 'snare' | 'hat' | 'clap' })
            }
          >
            <option value="kick">Kick</option>
            <option value="snare">Snare</option>
            <option value="hat">Hi-hat</option>
            <option value="clap">Clap</option>
          </select>
        )}
      </div>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="text-white/40 uppercase tracking-wider text-[10px]">
            <th className="px-2 py-2">Gesture</th>
            <th className="px-2 py-2">Left hand</th>
            <th className="px-2 py-2">Right hand</th>
          </tr>
        </thead>
        <tbody>
          {MAPPABLE_GESTURES.map((g) => (
            <tr key={g} className="border-t border-white/5">
              <td className="px-2 py-2 font-medium text-white/80 whitespace-nowrap">
                {GESTURE_LABELS[g] ?? g}
              </td>
              <td className="px-2 py-2"><ActionEditor hand="left" g={g} /></td>
              <td className="px-2 py-2"><ActionEditor hand="right" g={g} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function InstrumentPicker({
  hand,
  value,
  onChange,
}: {
  hand: 'left' | 'right';
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="text-white/50 uppercase tracking-wider">{hand}</span>
      <select
        className="rounded-md border border-white/15 bg-black/50 px-2 py-1.5 text-sm text-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {INSTRUMENTS.map((i) => (
          <option key={i.id} value={i.id}>{i.name}</option>
        ))}
      </select>
    </label>
  );
}
