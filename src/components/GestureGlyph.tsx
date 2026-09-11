/**
 * Skeleton-glyph gesture icons: each gesture drawn as a miniature hand
 * skeleton in SVG, derived from the actual overlay topology (21-landmark
 * hand). Lines = extended structure, dots = folded fingertips near the palm.
 * One visual language for the whole app — these are the gesture system.
 */
import type { GestureId } from '../types';

// Thumb, index, middle, ring, pinky extended?
const F: Record<string, [boolean, boolean, boolean, boolean, boolean]> = {
  openPalm: [true, true, true, true, true],
  flat: [true, true, true, true, true],
  fist: [false, false, false, false, false],
  point: [false, true, false, false, false],
  peace: [false, true, true, false, false],
  three: [false, true, true, true, false],
  four: [false, true, true, true, true],
  thumbUp: [true, false, false, false, false],
  thumbDown: [true, false, false, false, false],
  pinch: [true, true, false, false, false],
  ok: [true, true, false, false, true],
  rock: [true, false, false, false, true],
};

const W = 26;
const H = 30;

function GestureGlyphBase({ fingers, accent }: { fingers: [boolean, boolean, boolean, boolean, boolean] | undefined; accent: string }) {
  if (!fingers) {
    return (
      <svg width={W} height={H} viewBox="0 0 26 30" aria-hidden="true">
        <circle cx="13" cy="15" r="3" fill="rgba(255,255,255,0.25)" />
      </svg>
    );
  }
  const [t, i, m, r, p] = fingers;
  // Finger bases fan out from the palm; extended fingers rise, folded ones
  // curl into a dot.
  const baseX = [8.5, 11, 13, 15, 17.5];
  const tipY = 4;
  const foldY = 17;
  const extended = (up: boolean, bx: number, k: number) =>
    up ? (
      <line x1={bx} y1={16} x2={bx + k} y2={tipY} stroke={accent} strokeWidth="1.8" strokeLinecap="round" key={`${bx}-e`} />
    ) : (
      <circle cx={bx + k * 0.4} cy={foldY} r="1.6" fill="rgba(255,255,255,0.5)" key={`${bx}-f`} />
    );
  const tilt = [-2.5, -1, 0, 1, 2.5];
  return (
    <svg width={W} height={H} viewBox="0 0 26 30" aria-hidden="true">
      {/* palm */}
      <path d="M9 16 L17 16 L18 22 L8 22 Z" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" strokeLinejoin="round" />
      {extended(t, baseX[0], tilt[0])}
      {extended(i, baseX[1], tilt[1])}
      {extended(m, baseX[2], tilt[2])}
      {extended(r, baseX[3], tilt[3])}
      {extended(p, baseX[4], tilt[4])}
      {t && i && (baseX[0] !== undefined) && null /* pinch rendering below */}
    </svg>
  );
}

export function GestureGlyph({ gesture, size, accent = '#22d3ee' }: { gesture: GestureId; size?: number; accent?: string }) {
  const fingers = F[gesture];
  if (gesture === 'pinch' || gesture === 'ok') {
    // Circle formed by thumb + index, remaining fingers folded.
    const others = gesture === 'ok' ? [false, false, false, true] : [false, false, false, false];
    return (
      <svg width={size ?? W} height={size ?? H} viewBox="0 0 26 30" aria-hidden="true">
        <path d="M9 16 L17 16 L18 22 L8 22 Z" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" strokeLinejoin="round" />
        <circle cx="13" cy="9" r="4" fill="none" stroke={accent} strokeWidth="1.8" />
        {others[3] ? (
          <line x1="17.5" y1="16" x2="20" y2="8" stroke={accent} strokeWidth="1.8" strokeLinecap="round" />
        ) : (
          <circle cx="18.2" cy="17" r="1.6" fill="rgba(255,255,255,0.5)" />
        )}
        <circle cx="10.5" cy="17" r="1.6" fill="rgba(255,255,255,0.5)" />
        <circle cx="12.6" cy="17" r="1.6" fill="rgba(255,255,255,0.5)" />
        <circle cx="14.8" cy="17" r="1.6" fill="rgba(255,255,255,0.5)" />
      </svg>
    );
  }
  if (gesture === 'thumbDown') {
    const f = F[gesture];
    return (
      <svg width={size ?? W} height={size ?? H} viewBox="0 0 26 30" aria-hidden="true" style={{ transform: 'rotate(180deg)' }}>
        <GestureGlyphBase fingers={f} accent={accent} />
      </svg>
    );
  }
  return (
    <div style={size ? { width: size, height: size } : undefined}>
      <GestureGlyphBase fingers={fingers} accent={accent} />
    </div>
  );
}

export default GestureGlyph;
