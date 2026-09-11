import { usePerf } from '../stores/performanceStore';
import { GestureGlyph } from './GestureGlyph';

export default function PerformanceHUD() {
  const left = usePerf((s) => s.left);
  const right = usePerf((s) => s.right);
  const fps = usePerf((s) => s.trackingFps);

  const HandCard = ({
    s,
    accent,
  }: {
    s: ReturnType<typeof usePerf.getState>['left'];
    accent: string;
  }) => (
    <div
      className="flex items-center gap-2 rounded-xl border px-2.5 py-1.5 transition-colors"
      style={
        s.tracked
          ? {
              borderColor: `color-mix(in oklab, ${accent} 45%, transparent)`,
              background: `color-mix(in oklab, ${accent} 12%, transparent)`,
            }
          : { borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', opacity: 0.55 }
      }
    >
      <GestureGlyph gesture={s.gesture} accent={accent} />
      <div className="leading-tight">
        <div className="hs-label">{s.id} hand</div>
        <div className="mono text-sm font-semibold text-white">
          {s.chordLabel ?? (s.tracked ? '—' : 'no hand')}
        </div>
      </div>
      {s.tracked && (
        <div className="mono text-[10px] text-white/45">{Math.round(s.confidence * 100)}%</div>
      )}
    </div>
  );

  return (
    <div className="hidden items-center gap-2 md:flex">
      <HandCard s={left} accent="#22d3ee" />
      <HandCard s={right} accent="#f472b6" />
      <div className="mono rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-white/50">
        {fps} fps
      </div>
    </div>
  );
}
