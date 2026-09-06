import { useState } from 'react';
import { usePerf } from '../stores/performanceStore';
import { GESTURE_LABELS } from '../audio/mappings';

export default function PerformanceHUD() {
  const left = usePerf((s) => s.left);
  const right = usePerf((s) => s.right);
  const fps = usePerf((s) => s.trackingFps);
  const [tick] = useState(0);
  void tick;

  const HandCard = ({ s }: { s: ReturnType<typeof usePerf.getState>['left'] }) => (
    <div
      className={`rounded-xl border px-3 py-2 backdrop-blur transition-colors ${
        s.tracked
          ? 'border-cyan-400/40 bg-cyan-400/10'
          : 'border-white/10 bg-white/5 opacity-50'
      }`}
    >
      <div className="text-[10px] uppercase tracking-widest text-white/50">
        {s.id} hand
      </div>
      <div className="font-mono text-lg font-bold text-white">
        {s.chordLabel ?? (s.tracked ? '—' : 'no hand')}
      </div>
      <div className="text-[11px] text-white/60">
        {s.tracked
          ? `${GESTURE_LABELS[s.gesture] ?? s.gesture} · ${Math.round(s.confidence * 100)}%`
          : 'show your hand'}
      </div>
    </div>
  );

  return (
    <div className="flex items-center gap-2">
      <HandCard s={left} />
      <HandCard s={right} />
      <div className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[10px] font-mono text-white/50">
        {fps} fps
      </div>
    </div>
  );
}
