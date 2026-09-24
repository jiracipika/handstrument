import { useEffect, useRef } from 'react';
import type { TrackedHand } from '../types';

const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],           // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],           // index
  [5, 9], [9, 10], [10, 11], [11, 12],      // middle
  [9, 13], [13, 14], [14, 15], [15, 16],    // ring
  [13, 17], [17, 18], [18, 19], [19, 20],   // pinky
  [0, 17],                                   // palm base
];

const FINGER_TIPS = [4, 8, 12, 16, 20];

/** Fingertip index into the per-hand palette. */
const LEFT_COLORS = ['#b9f976', '#67e8f9', '#b9f976', '#0891b2', '#155e75'];
const RIGHT_COLORS = ['#ae90ff', '#fbcfe8', '#ae90ff', '#db2777', '#9d174d'];
const LEFT_STROKE = '#b9f976';
const RIGHT_STROKE = '#ae90ff';

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  handsRef: React.MutableRefObject<TrackedHand[]>;
  mirror: boolean;
}

interface Burst {
  x: number;
  y: number;
  t0: number;
  color: string;
}

/**
 * Hand skeleton overlay. Draw cost is capped: strokes are batched into ONE
 * path per hand with a single shadow pass (the old per-bone shadowBlur was the
 * biggest raster cost on mobile), joints are drawn without shadows, and the
 * whole draw loop is throttled to ~40 fps with rAF skipping. Fingertips of
 * extended fingers get a glow halo; the active gesture's fingertips pop a
 * short-lived radial burst when a note fires.
 */
export default function HandOverlay({ videoRef, canvasRef, handsRef, mirror }: Props) {
  const rafRef = useRef(0);
  const lastDrawRef = useRef(0);
  const burstsRef = useRef<Burst[]>([]);
  const prevUpRef = useRef<Record<string, boolean>>({});
  const hueRef = useRef(0);

  useEffect(() => {
    const draw = (now: number) => {
      rafRef.current = requestAnimationFrame(draw);
      // Throttle to ~40 fps — the overlay sits on top of live video; more
      // than that is invisible and costs battery + compositing time.
      if (now - lastDrawRef.current < 25) return;
      lastDrawRef.current = now;
      hueRef.current = (hueRef.current + 0.4) % 360;

      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const hands = handsRef.current ?? [];

      for (const hand of hands) {
        const isLeft = hand.id === 'left';
        const stroke = isLeft ? LEFT_STROKE : RIGHT_STROKE;
        const tipColors = isLeft ? LEFT_COLORS : RIGHT_COLORS;
        const pts = hand.landmarks.map((l) => ({
          x: (mirror ? 1 - l.x : l.x) * w,
          y: l.y * h,
        }));

        // Skeleton: single batched path, one glow pass for the whole hand.
        ctx.beginPath();
        for (const [a, b] of CONNECTIONS) {
          ctx.moveTo(pts[a].x, pts[a].y);
          ctx.lineTo(pts[b].x, pts[b].y);
        }
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = stroke;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = stroke;
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        // Palm aura: subtle animated hue-shifted fill behind the palm.
        const palm = pts[0];
        const mid = pts[9];
        const pcx = (palm.x + pts[5].x + pts[17].x) / 3;
        const pcy = (palm.y + pts[5].y + pts[17].y) / 3;
        const pr = Math.hypot(mid.x - palm.x, mid.y - palm.y) * 0.9;
        const aura = ctx.createRadialGradient(pcx, pcy, 0, pcx, pcy, Math.max(pr, 8));
        aura.addColorStop(0, `hsla(${hueRef.current}, 90%, 65%, 0.10)`);
        aura.addColorStop(1, 'transparent');
        ctx.fillStyle = aura;
        ctx.beginPath();
        ctx.arc(pcx, pcy, Math.max(pr, 8), 0, Math.PI * 2);
        ctx.fill();

        // Joints: plain dots, no per-joint shadow.
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        for (let i = 0; i < pts.length; i++) {
          if (FINGER_TIPS.includes(i)) continue;
          ctx.beginPath();
          ctx.arc(pts[i].x, pts[i].y, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }

        // Fingertips: color-coded, glow only when extended.
        const up = hand.features?.fingersUp ?? [];
        for (let f = 0; f < FINGER_TIPS.length; f++) {
          const p = pts[FINGER_TIPS[f]];
          const key = `${hand.id}:${f}`;
          const extended = up[f] === true;
          if (extended) {
            ctx.fillStyle = tipColors[f];
            ctx.shadowColor = tipColors[f];
            ctx.shadowBlur = 14;
          } else {
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.shadowBlur = 0;
          }
          ctx.beginPath();
          ctx.arc(p.x, p.y, extended ? 4 : 2.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;

          // Fire a burst when a fingertip transitions folded -> extended.
          if (extended && !prevUpRef.current[key]) {
            burstsRef.current.push({ x: p.x, y: p.y, t0: now, color: tipColors[f] });
          }
          prevUpRef.current[key] = extended;
        }

        // Label
        const wrist = pts[0];
        ctx.font = '600 12px "Space Grotesk", ui-monospace, monospace';
        ctx.fillStyle = stroke;
        ctx.fillText(isLeft ? 'L' : 'R', wrist.x - 4, wrist.y + 22);
      }

      // Fingertip bursts: expanding rings, ~350 ms life.
      const BURST_MS = 350;
      burstsRef.current = burstsRef.current.filter((b) => now - b.t0 < BURST_MS);
      for (const b of burstsRef.current) {
        const k = (now - b.t0) / BURST_MS;
        const r = 6 + k * 26;
        ctx.strokeStyle = b.color;
        ctx.globalAlpha = (1 - k) * 0.8;
        ctx.lineWidth = 2 * (1 - k) + 0.5;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [videoRef, canvasRef, handsRef, mirror]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
