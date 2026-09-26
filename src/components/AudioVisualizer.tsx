import { useEffect, useRef } from 'react';
import { AudioEngine } from '../audio/audioEngine';

interface Props {
  engineRef: React.MutableRefObject<AudioEngine | null>;
  className?: string;
}

/** Real-time spectrum visualizer driven by the audio engine's analyser. */
export default function AudioVisualizer({ engineRef, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const lastDrawRef = useRef(0);

  useEffect(() => {
    const draw = (now: number) => {
      rafRef.current = requestAnimationFrame(draw);
      if (document.hidden || now - lastDrawRef.current < 33) return;
      lastDrawRef.current = now;
      const canvas = canvasRef.current;
      const eng = engineRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.clearRect(0, 0, w, h);

      const spec = eng?.getSpectrum();
      const bins = 48;
      const bw = w / bins;
      const grad = ctx.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, 'rgba(185,249,118,0.9)');
      grad.addColorStop(1, 'rgba(174,144,255,0.9)');
      ctx.fillStyle = grad;
      for (let i = 0; i < bins; i++) {
        let v = 0;
        if (spec && !Array.isArray(spec) && spec.length > 0) {
          // analyser returns dB values (-100..0 roughly); normalize
          const idx = Math.floor((i / bins) * spec.length);
          const db = spec[idx];
          v = Math.max(0, Math.min(1, (db + 90) / 90));
        }
        // Keep the monitor quiet until the analyser reports actual audio.
        const bh = v * (h - 6);
        ctx.fillRect(i * bw + 1, h - bh, bw - 2, bh);
      }
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [engineRef]);

  return <canvas ref={canvasRef} className={className} />;
}
