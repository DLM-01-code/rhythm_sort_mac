import React, { useEffect, useRef, useState } from "react";

interface VisualizerProps {
  analyser: AnalyserNode | null;
  mode: string;
  enabled: boolean;
  sensitivity: number;
  perfMode: boolean;
  onSeek?: (progress: number) => void;
}

export function Visualizer({ analyser, mode, enabled, sensitivity, perfMode, onSeek }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>();
  const smoothRef = useRef<Uint8Array | null>(null);
  const timeRef   = useRef(0);
  const particlesRef = useRef<any[]>([]);
  const inkDropsRef  = useRef<any[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const SF = 0.3;

  const clear = () => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#0f1117";
    ctx.fillRect(0, 0, c.width, c.height);
  };

  useEffect(() => {
    if (!enabled || !analyser) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      animRef.current = undefined;
      smoothRef.current = null;
      particlesRef.current = [];
      inkDropsRef.current = [];
      clear();
      return;
    }
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const blen = analyser.frequencyBinCount;
    const freq = new Uint8Array(blen);
    const time = new Uint8Array(blen);
    if (!smoothRef.current || smoothRef.current.length !== blen) smoothRef.current = new Uint8Array(blen);

    let frame = 0;
    const limit = perfMode ? 2 : 1;

    const draw = () => {
      frame++;
      if (frame % limit !== 0) { animRef.current = requestAnimationFrame(draw); return; }
      try { analyser.getByteFrequencyData(freq); analyser.getByteTimeDomainData(time); }
      catch { if (animRef.current) cancelAnimationFrame(animRef.current); clear(); return; }

      for (let i = 0; i < blen; i++)
        smoothRef.current![i] = smoothRef.current![i] * (1 - SF) + time[i] * SF;

      timeRef.current += 0.02;
      const W = canvas.width, H = canvas.height, t = timeRef.current;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#0f1117";
      ctx.fillRect(0, 0, W, H);

      // Bass energy
      let bass = 0;
      for (let i = 0; i < Math.floor(blen * 0.1); i++) bass += freq[i];
      bass = (bass / Math.floor(blen * 0.1)) / 255 * sensitivity;

      switch (mode) {
        case "particle_flow":  drawParticleFlow(ctx, W, H, freq, bass, t, blen); break;
        case "dna_helix":      drawDNAHelix(ctx, W, H, freq, bass, t, blen); break;
        case "ink_drop":       drawInkDrop(ctx, W, H, freq, bass, t, blen); break;
        case "city_lights":    drawCityLights(ctx, W, H, freq, bass, t, blen, sensitivity); break;
        case "neon_ring":      drawNeonRing(ctx, W, H, freq, bass, t, blen); break;
        case "mirror_bars":    drawMirrorBars(ctx, W, H, freq, bass, t, blen, sensitivity); break;
        case "plasma":         drawPlasma(ctx, W, H, freq, bass, t, blen); break;
        case "oscilloscope":   drawOscilloscope(ctx, W, H, smoothRef.current!, t); break;
        case "dual_waveform":  drawDualWaveform(ctx, W, H, smoothRef.current!, sensitivity); break;
        case "rms_meter":      drawRmsMeter(ctx, W, H, freq, sensitivity); break;
        case "aurora":         drawAurora(ctx, W, H, freq, sensitivity, t); break;
        case "vu_meter":       drawVuMeter(ctx, W, H, freq, sensitivity); break;
        case "lissajous":      drawLissajous(ctx, W, H, time, sensitivity); break;
        case "wave":           drawWave(ctx, W, H, smoothRef.current!, sensitivity); break;
        default:               drawDualWaveform(ctx, W, H, smoothRef.current!, sensitivity);
      }
      animRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); clear(); };
  }, [analyser, enabled, mode, sensitivity, perfMode]);

  useEffect(() => { smoothRef.current = null; particlesRef.current = []; inkDropsRef.current = []; clear(); }, [mode]);

  // ══════════════════════════════════════════════════
  //  NEW VISUALIZERS
  // ══════════════════════════════════════════════════

  // 1. PARTICLE FLOW
  function drawParticleFlow(ctx: CanvasRenderingContext2D, W: number, H: number,
    freq: Uint8Array, bass: number, t: number, blen: number) {
    const ps = particlesRef.current;

    // Spawn particles
    const spawnCount = Math.floor(bass * 8) + 2;
    for (let i = 0; i < spawnCount; i++) {
      const fi = Math.floor(Math.random() * blen * 0.6);
      const energy = freq[fi] / 255;
      if (energy < 0.2) continue;
      ps.push({
        x: W * 0.1 + Math.random() * W * 0.8,
        y: H * 0.9,
        vx: (Math.random() - 0.5) * 2 * (1 + bass * 3),
        vy: -(1.5 + energy * 4 * (1 + bass)),
        life: 1.0,
        decay: 0.012 + Math.random() * 0.015,
        size: 1.5 + energy * 3,
        hue: 200 + energy * 120,
        trail: [] as {x:number,y:number}[],
      });
    }

    // Update & draw
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 12) p.trail.shift();
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.98; p.vy += 0.04; // slight gravity
      p.life -= p.decay;
      if (p.life <= 0) { ps.splice(i, 1); continue; }

      // Trail
      for (let j = 0; j < p.trail.length - 1; j++) {
        const alpha = (j / p.trail.length) * p.life * 0.6;
        ctx.beginPath();
        ctx.moveTo(p.trail[j].x, p.trail[j].y);
        ctx.lineTo(p.trail[j+1].x, p.trail[j+1].y);
        ctx.strokeStyle = `hsla(${p.hue},100%,70%,${alpha})`;
        ctx.lineWidth = p.size * (j / p.trail.length);
        ctx.stroke();
      }
      // Particle
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue},100%,80%,${p.life * 0.9})`;
      ctx.fill();
    }
    // Keep array bounded
    if (ps.length > 600) ps.splice(0, ps.length - 600);
  }

  // 2. DNA HELIX
  function drawDNAHelix(ctx: CanvasRenderingContext2D, W: number, H: number,
    freq: Uint8Array, bass: number, t: number, blen: number) {
    const cx = W / 2, cy = H / 2;
    const steps = 80, amp = H * 0.35, speed = t * 0.8;

    for (let i = 0; i < steps; i++) {
      const prog = i / steps;
      const angle = prog * Math.PI * 6 + speed;
      const fi = Math.floor(prog * blen * 0.8);
      const energy = (freq[fi] / 255) * sensitivity;
      const x = cx + Math.cos(angle) * (40 + amp * 0.35);
      const y = cy - amp * 0.8 + prog * amp * 1.6;
      const x2 = cx - Math.cos(angle) * (40 + amp * 0.35);

      const hue1 = 200 + energy * 60;
      const hue2 = 280 + energy * 60;
      const sz = 2 + energy * 5 * (1 + bass);

      // Strand 1
      ctx.beginPath();
      ctx.arc(x, y, sz, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue1},100%,65%,0.85)`;
      ctx.shadowBlur = 8; ctx.shadowColor = `hsl(${hue1},100%,65%)`;
      ctx.fill();

      // Strand 2
      ctx.beginPath();
      ctx.arc(x2, y, sz, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue2},100%,65%,0.85)`;
      ctx.shadowColor = `hsl(${hue2},100%,65%)`;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Rungs every ~5 steps
      if (i % 5 === 0) {
        const ruE = (freq[fi] / 255) * sensitivity;
        ctx.beginPath();
        ctx.moveTo(x, y); ctx.lineTo(x2, y);
        ctx.strokeStyle = `hsla(${240 + ruE * 80},80%,70%,${0.3 + ruE * 0.5})`;
        ctx.lineWidth = 1 + ruE * 2;
        ctx.stroke();
      }
    }
  }

  // 3. INK DROP
  function drawInkDrop(ctx: CanvasRenderingContext2D, W: number, H: number,
    freq: Uint8Array, bass: number, t: number, blen: number) {
    const drops = inkDropsRef.current;

    // Spawn drops on bass hits
    if (bass > 0.5 && Math.random() < bass * 0.4) {
      drops.push({
        x: W * 0.15 + Math.random() * W * 0.7,
        y: H * 0.15 + Math.random() * H * 0.7,
        r: 2, maxR: 30 + bass * 80,
        life: 1.0, decay: 0.008 + Math.random() * 0.006,
        hue: 220 + Math.random() * 120,
      });
    }

    // Background "breathing" blob
    const breathe = 0.6 + bass * 0.4;
    const grd = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W * 0.4 * breathe);
    grd.addColorStop(0, `rgba(30,40,80,${0.15 + bass * 0.1})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    // Draw & update drops
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.r += (d.maxR - d.r) * 0.06;
      d.life -= d.decay;
      if (d.life <= 0) { drops.splice(i, 1); continue; }

      // Outer glow
      const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
      g.addColorStop(0, `hsla(${d.hue},60%,50%,${d.life * 0.4})`);
      g.addColorStop(0.5, `hsla(${d.hue},80%,40%,${d.life * 0.2})`);
      g.addColorStop(1, `hsla(${d.hue},60%,30%,0)`);
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();

      // Ring edge
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r * 0.85, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${d.hue},100%,70%,${d.life * 0.6})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Waveform underneath as ink trails
    const blen2 = Math.min(120, blen);
    ctx.beginPath();
    for (let i = 0; i < blen2; i++) {
      const x = (i / blen2) * W;
      const v = (freq[i] / 255) * sensitivity;
      const y = H * 0.5 + Math.sin(i * 0.2 + t) * v * H * 0.25;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(180,120,255,${0.2 + bass * 0.3})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (drops.length > 30) drops.splice(0, drops.length - 30);
  }

  // 4. CITY LIGHTS
  function drawCityLights(ctx: CanvasRenderingContext2D, W: number, H: number,
    freq: Uint8Array, bass: number, t: number, blen: number, sens: number) {
    const bars = 80;
    const bw = W / bars;

    for (let i = 0; i < bars; i++) {
      const fi = Math.floor((i / bars) * blen * 0.75);
      const v = (freq[fi] / 255) * sens;
      const bh = v * H * 0.85;
      const x = i * bw;
      const y = H - bh;

      // Gradient bar: blue → violet → white tip
      const g = ctx.createLinearGradient(x, H, x, y);
      g.addColorStop(0, `hsla(240,100%,30%,0.7)`);
      g.addColorStop(0.5, `hsla(270,100%,55%,0.85)`);
      g.addColorStop(0.85, `hsla(300,100%,70%,0.9)`);
      g.addColorStop(1, `hsla(200,100%,95%,1)`);
      ctx.fillStyle = g;
      ctx.fillRect(x + 1, y, bw - 2, bh);

      // Reflection (below floor)
      const rg = ctx.createLinearGradient(x, H, x, H + bh * 0.35);
      rg.addColorStop(0, `hsla(240,100%,30%,0.25)`);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(x + 1, H, bw - 2, bh * 0.35);

      // Glowing tip
      if (v > 0.3) {
        ctx.beginPath();
        ctx.arc(x + bw / 2, y, 2 + v * 3, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(200,100%,95%,${v * 0.9})`;
        ctx.shadowBlur = 12; ctx.shadowColor = '#a78bfa';
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Floor line
    ctx.beginPath();
    ctx.moveTo(0, H); ctx.lineTo(W, H);
    ctx.strokeStyle = `rgba(120,80,220,${0.3 + bass * 0.4})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // 5. NEON RING
  function drawNeonRing(ctx: CanvasRenderingContext2D, W: number, H: number,
    freq: Uint8Array, bass: number, t: number, blen: number) {
    const cx = W / 2, cy = H / 2;
    const base = Math.min(W, H) * 0.28;

    const rings = [
      { r: base * (0.6 + bass * 0.25), hue: 200, width: 2.5, glow: 20 },
      { r: base * (0.85 + bass * 0.15), hue: 260, width: 1.5, glow: 14 },
      { r: base * (1.1 + bass * 0.1), hue: 320, width: 1, glow: 8 },
    ];

    rings.forEach(({ r, hue, width, glow }) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${hue},100%,65%,${0.6 + bass * 0.4})`;
      ctx.lineWidth = width;
      ctx.shadowBlur = glow * (1 + bass);
      ctx.shadowColor = `hsl(${hue},100%,65%)`;
      ctx.stroke();
      ctx.shadowBlur = 0;
    });

    // Particles orbiting outer ring
    const pr = base * 1.1;
    const pCount = 32;
    for (let i = 0; i < pCount; i++) {
      const fi = Math.floor((i / pCount) * blen * 0.5);
      const energy = freq[fi] / 255;
      if (energy < 0.15) continue;
      const angle = (i / pCount) * Math.PI * 2 + t * 0.5;
      const jitter = energy * 20;
      const px = cx + Math.cos(angle) * (pr + jitter);
      const py = cy + Math.sin(angle) * (pr + jitter);
      ctx.beginPath();
      ctx.arc(px, py, 1.5 + energy * 3, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${300 + energy * 60},100%,75%,${energy * 0.9})`;
      ctx.shadowBlur = 8; ctx.shadowColor = '#f0abfc';
      ctx.fill(); ctx.shadowBlur = 0;
    }

    // Inner pulse
    const inner = ctx.createRadialGradient(cx, cy, 0, cx, cy, base * 0.5 * (1 + bass * 0.3));
    inner.addColorStop(0, `rgba(100,130,255,${0.08 + bass * 0.12})`);
    inner.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = inner;
    ctx.fillRect(0, 0, W, H);
  }

  // 6. MIRROR BARS
  function drawMirrorBars(ctx: CanvasRenderingContext2D, W: number, H: number,
    freq: Uint8Array, bass: number, t: number, blen: number, sens: number) {
    const bars = 128;
    const bw = W / bars;
    const mid = H / 2;

    for (let i = 0; i < bars; i++) {
      const fi = Math.floor((i / bars) * blen * 0.8);
      const v = (freq[fi] / 255) * sens;
      const bh = v * mid * 0.95;
      const x = i * bw;
      const hue = 220 + (i / bars) * 100; // blue → violet

      // Up bar
      const gu = ctx.createLinearGradient(x, mid, x, mid - bh);
      gu.addColorStop(0, `hsla(${hue},100%,50%,0.9)`);
      gu.addColorStop(1, `hsla(${hue + 40},100%,75%,0.6)`);
      ctx.fillStyle = gu;
      ctx.fillRect(x + 0.5, mid - bh, bw - 1, bh);

      // Down bar (mirror)
      const gd = ctx.createLinearGradient(x, mid, x, mid + bh);
      gd.addColorStop(0, `hsla(${hue},100%,50%,0.6)`);
      gd.addColorStop(1, `hsla(${hue + 40},100%,75%,0.15)`);
      ctx.fillStyle = gd;
      ctx.fillRect(x + 0.5, mid, bw - 1, bh);
    }

    // Centre line
    ctx.beginPath();
    ctx.moveTo(0, mid); ctx.lineTo(W, mid);
    ctx.strokeStyle = `rgba(180,160,255,${0.3 + bass * 0.3})`;
    ctx.lineWidth = 1; ctx.stroke();
  }

  // 7. PLASMA
  function drawPlasma(ctx: CanvasRenderingContext2D, W: number, H: number,
    freq: Uint8Array, bass: number, t: number, blen: number) {
    const blobCount = 5;
    const blobs = [
      { ax: 0.3, ay: 0.3, fx: 0.7, fy: 0.5, hue: 200, fidx: 0 },
      { ax: 0.6, ay: 0.5, fx: 1.1, fy: 0.7, hue: 260, fidx: 10 },
      { ax: 0.5, ay: 0.6, fx: 0.9, fy: 1.3, hue: 320, fidx: 20 },
      { ax: 0.2, ay: 0.7, fx: 1.3, fy: 0.9, hue: 180, fidx: 30 },
      { ax: 0.7, ay: 0.2, fx: 0.6, fy: 1.1, hue: 300, fidx: 40 },
    ];

    ctx.globalCompositeOperation = 'screen';
    blobs.forEach((b, idx) => {
      const fi = Math.floor((b.fidx / 50) * blen * 0.5);
      const energy = (freq[fi] / 255) * sensitivity;
      const x = W * (b.ax + Math.sin(t * b.fx + idx) * 0.3);
      const y = H * (b.ay + Math.cos(t * b.fy + idx) * 0.35);
      const r = (80 + energy * 120 + bass * 60) * (W / 800);

      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `hsla(${b.hue + energy * 40},100%,60%,${0.5 + energy * 0.4})`);
      g.addColorStop(0.5, `hsla(${b.hue},80%,40%,${0.2 + energy * 0.2})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  // 8. OSCILLOSCOPE
  function drawOscilloscope(ctx: CanvasRenderingContext2D, W: number, H: number,
    data: Uint8Array, t: number) {
    // Grid
    ctx.strokeStyle = 'rgba(0,255,80,0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += W / 10) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y <= H; y += H / 4) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Phosphor glow: draw 3 layers
    [{ w: 4, a: 0.1 }, { w: 2, a: 0.3 }, { w: 1, a: 0.95 }].forEach(({ w, a }) => {
      ctx.beginPath();
      const step = W / data.length;
      for (let i = 0; i < data.length; i++) {
        const x = i * step;
        const v = (data[i] - 128) / 128;
        const y = H / 2 + v * H * 0.42 * sensitivity;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(0,255,80,${a})`;
      ctx.lineWidth = w;
      ctx.shadowBlur = w === 1 ? 6 : 0;
      ctx.shadowColor = '#00ff50';
      ctx.stroke();
      ctx.shadowBlur = 0;
    });

    // Scan line
    const scanX = (t * 120) % W;
    ctx.beginPath();
    ctx.moveTo(scanX, 0); ctx.lineTo(scanX, H);
    ctx.strokeStyle = 'rgba(0,255,80,0.04)';
    ctx.lineWidth = 8; ctx.stroke();
  }

  // ══════════════════════════════════════════════════
  //  ORIGINAL VISUALIZERS (kept)
  // ══════════════════════════════════════════════════
  function drawDualWaveform(ctx: CanvasRenderingContext2D, W: number, H: number, d: Uint8Array, s: number) {
    const sw = W / d.length; let x = 0;
    ctx.beginPath();
    for (let i = 0; i < d.length; i++) {
      const y = (d[i] - 128) / 128 * H * 0.25 * s + H / 4;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); x += sw;
    }
    ctx.strokeStyle = "#3b82f6"; ctx.lineWidth = 2; ctx.stroke();
    x = 0; ctx.beginPath();
    for (let i = 0; i < d.length; i++) {
      const y = (d[i] - 128) / 128 * H * 0.25 * s + H * 0.75;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); x += sw;
    }
    ctx.strokeStyle = "#f97316"; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, H/2); ctx.lineTo(W, H/2);
    ctx.strokeStyle = "rgba(255,255,255,0.1)"; ctx.lineWidth = 1; ctx.stroke();
  }

  function drawRmsMeter(ctx: CanvasRenderingContext2D, W: number, H: number, d: Uint8Array, s: number) {
    let sum = 0; for (const v of d) sum += v;
    const rms = Math.min(1, (sum / d.length / 255) * s);
    const mw = W - 40, mh = 20, mx = 20, my = H/2 - 10;
    ctx.fillStyle = "#1e1e2e"; ctx.fillRect(mx, my, mw, mh);
    const c = rms < 0.6 ? "#22c55e" : rms < 0.8 ? "#eab308" : "#ef4444";
    ctx.fillStyle = c; ctx.fillRect(mx, my, mw * rms, mh);
    ctx.font = "bold 20px monospace"; ctx.fillStyle = c;
    ctx.fillText(`${Math.floor(rms*100)}%`, W/2-30, my-10);
  }

  function drawAurora(ctx: CanvasRenderingContext2D, W: number, H: number, d: Uint8Array, s: number, t: number) {
    for (let i = 0; i < d.length; i++) {
      const v = d[i]/255, bh = v * H * 0.5 * s, hue = (t*20 + i*0.5) % 360;
      const g = ctx.createLinearGradient(0,H,0,H-bh);
      g.addColorStop(0,`hsla(${hue},100%,50%,${0.3+v*0.5})`);
      g.addColorStop(1,`hsla(${hue+40},100%,30%,0.1)`);
      ctx.fillStyle = g; ctx.fillRect(i*(W/d.length), H-bh, W/d.length, bh);
    }
  }

  function drawVuMeter(ctx: CanvasRenderingContext2D, W: number, H: number, d: Uint8Array, s: number) {
    const n=20,sz=15,sp=8,sx=(W-n*(sz+sp))/2,y=H/2-sz/2;
    let sum=0; for (const v of d) sum+=v;
    const lit = Math.floor(Math.min(1,(sum/d.length/255)*s)*n);
    for (let i=0;i<n;i++) {
      const x=sx+i*(sz+sp), isLit=i<lit;
      const c = i<n*0.6?"#22c55e":i<n*0.8?"#eab308":"#ef4444";
      ctx.fillStyle = isLit?c:"#1e1e2e"; ctx.fillRect(x,y,sz,sz);
      if (isLit) { ctx.shadowBlur=8; ctx.shadowColor=c; ctx.fillRect(x,y,sz,sz); ctx.shadowBlur=0; }
    }
  }

  function drawLissajous(ctx: CanvasRenderingContext2D, W: number, H: number, d: Uint8Array, s: number) {
    const cx=W/2,cy=H/2,r=Math.min(W,H)/3,h=Math.floor(d.length/2);
    ctx.beginPath();
    for (let i=0;i<h;i++) {
      const x=cx+((d[i]-128)/128)*r*s, y=cy+((d[i+h]-128)/128)*r*s;
      i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
    }
    ctx.strokeStyle="#00ff88"; ctx.lineWidth=1.5; ctx.stroke();
  }

  function drawWave(ctx: CanvasRenderingContext2D, W: number, H: number, d: Uint8Array, s: number) {
    const sw=W/d.length, yo=H*0.7; let x=0;
    ctx.beginPath();
    for (let i=0;i<d.length;i++) {
      const y=yo+(d[i]-128)/128*H*0.25*s;
      i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); x+=sw;
    }
    ctx.strokeStyle="#1e40af"; ctx.lineWidth=2.5; ctx.stroke();
    ctx.lineTo(W,H); ctx.lineTo(0,H); ctx.closePath();
    const g=ctx.createLinearGradient(0,yo,0,H);
    g.addColorStop(0,"rgba(30,64,175,0.15)"); g.addColorStop(1,"rgba(30,64,175,0)");
    ctx.fillStyle=g; ctx.fill();
  }

  // ══════════════════════════════════════════════════
  //  CANVAS EVENT HANDLERS
  // ══════════════════════════════════════════════════
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek) return;
    const r = canvasRef.current!.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
  };
  const handleMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !onSeek) return;
    const r = canvasRef.current!.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
  };

  return (
    <canvas
      ref={canvasRef} width={800} height={200}
      className="w-full h-48 rounded-lg bg-black/20 cursor-pointer"
      onClick={handleClick}
      onMouseDown={() => setIsDragging(true)}
      onMouseMove={handleMove}
      onMouseUp={() => setIsDragging(false)}
      onMouseLeave={() => setIsDragging(false)}
      style={{ display: "block" }}
    />
  );
}
