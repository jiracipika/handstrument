import { useSettings } from '../stores/settingsStore';
import { INSTRUMENTS } from '../audio/audioEngine';
import { GESTURE_LABELS, MAPPABLE_GESTURES, NOTE_NAMES_ALL, CHORD_TYPES } from '../audio/mappings';
import { CHORD_LABELS } from '../audio/chords';
import { listCustomGestures } from '../handTracking/customGestures';
import { GestureGlyph } from './GestureGlyph';
import type { ChordAction, DrumKind, GestureId } from '../types';

/** Editable gesture -> musical action mapping table (left/right). */
export default function GestureMapper({ refreshKey = 0 }: { refreshKey?: number }) {
  const settings = useSettings((s) => s.settings);
  const setMapping = useSettings((s) => s.setMapping);
  const clearMapping = useSettings((s) => s.clearMapping);
  const custom = listCustomGestures();
  void refreshKey; // parent bumps this after training a new gesture

  const rows: { id: GestureId; label: string }[] = [
    ...MAPPABLE_GESTURES.map((g) => ({ id: g, label: GESTURE_LABELS[g] ?? g })),
    ...custom.map((c) => ({ id: c.id as GestureId, label: `★ ${c.name}` })),
  ];

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
    const accent = hand === 'left' ? '#b9f976' : '#ae90ff';
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <select
          className="hs-select"
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
          style={action && action.kind !== 'none' ? { borderColor: `color-mix(in oklab, ${accent} 40%, transparent)` } : undefined}
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
          <div className="grid min-w-0 grid-cols-2 gap-1">
            <select
              className="hs-select"
              value={action.chord.root}
              onChange={(e) => setChord(hand, g, e.target.value, action.chord.type)}
            >
              {NOTE_NAMES_ALL.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <select
              className="hs-select"
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
            className="hs-select"
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
            className="hs-select"
            value={action.drum}
            onChange={(e) => setMapping(hand, g, { kind: 'drum', drum: e.target.value as DrumKind })}
          >
            <option value="kick">Kick</option>
            <option value="snare">Snare</option>
            <option value="hat">Hi-hat</option>
            <option value="clap">Clap</option>
            <option value="tom">Tom</option>
            <option value="cowbell">Cowbell</option>
          </select>
        )}
      </div>
    );
  };

  return (
    <div className="w-full overflow-x-auto">
      {/* Mobile: stacked cards (fixed 3-col table can't fit 412px).
          md+: the 3-column table. */}
      <div className="flex flex-col gap-2 md:hidden">
        {MAPPABLE_GESTURES.map((g) => (
          <div key={g} className="hs-card flex flex-col gap-2 p-2.5">
            <div className="flex items-center gap-2">
              <GestureGlyph gesture={g} size={24} accent="#b9f976" />
              <span className="text-xs font-medium text-white/80">{GESTURE_LABELS[g] ?? g}</span>
              <span className="hs-label ml-auto">L</span>
              <span className="hs-label">R</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ActionEditor hand="left" g={g} />
              <ActionEditor hand="right" g={g} />
            </div>
          </div>
        ))}
      </div>
      <table className="hidden w-full table-fixed text-left text-xs md:table">
        <colgroup>
          <col style={{ width: '38%' }} />
          <col style={{ width: '31%' }} />
          <col style={{ width: '31%' }} />
        </colgroup>
        <thead>
          <tr className="hs-label">
            <th className="px-2 py-2">Gesture</th>
            <th className="px-2 py-2">Left hand</th>
            <th className="px-2 py-2">Right hand</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ id: g, label }) => (
            <tr key={g} className="border-t border-white/5">
              <td className="w-0 min-w-0 px-2 py-2">
                <div className="flex items-center gap-2">
                  <GestureGlyph gesture={g} size={24} accent="#b9f976" />
                  <span className="truncate font-medium text-white/80">{label}</span>
                </div>
              </td>
              <td className="w-0 min-w-0 px-1.5 py-2"><ActionEditor hand="left" g={g} /></td>
              <td className="w-0 min-w-0 px-1.5 py-2"><ActionEditor hand="right" g={g} /></td>
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
      <span className="hs-label">{hand}</span>
      <select
        className="hs-select"
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
