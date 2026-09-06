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

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  handsRef: React.MutableRefObject<TrackedHand[]>;
  mirror: boolean;
}

export default function HandOverlay({ videoRef, canvasRef, handsRef, mirror }: Props) {
  const rafRef = useRef(0);

  useEffect(() => {
    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);

      const hands = handsRef.current ?? [];
      for (const hand of hands) {
        const color = hand.id === 'left' ? '#22d3ee' : '#f472b6';
        const pts = hand.landmarks.map((l) => ({
          x: (mirror ? 1 - l.x : l.x) * w,
          y: l.y * h,
        }));

        // skeleton
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        for (const [a, b] of CONNECTIONS) {
          ctx.beginPath();
          ctx.moveTo(pts[a].x, pts[a].y);
          ctx.lineTo(pts[b].x, pts[b].y);
          ctx.stroke();
        }

        // joints
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#fff';
        for (const p of pts) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;

        // label
        const wrist = pts[0];
        const label = hand.id === 'left' ? 'LEFT' : 'RIGHT';
        ctx.font = '600 12px ui-monospace, monospace';
        ctx.fillStyle = color;
        ctx.fillText(label, wrist.x - 18, wrist.y + 24);
      }
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
