/**
 * Interactive Bezier Curve / Graph Editor for Cinematic Director
 * Solves cubic-bezier(x1, y1, x2, y2) and provides interactive canvas UI with draggable control handles.
 */

export class BezierSolver {
  constructor(x1 = 0.42, y1 = 0.0, x2 = 0.58, y2 = 1.0) {
    this.set(x1, y1, x2, y2);
  }

  set(x1, y1, x2, y2) {
    this.x1 = Math.min(Math.max(x1, 0), 1);
    this.y1 = y1;
    this.x2 = Math.min(Math.max(x2, 0), 1);
    this.y2 = y2;
  }

  // Sample Bezier at parametric t
  sampleX(t) {
    return 3 * (1 - t) * (1 - t) * t * this.x1 + 3 * (1 - t) * t * t * this.x2 + t * t * t;
  }

  sampleY(t) {
    return 3 * (1 - t) * (1 - t) * t * this.y1 + 3 * (1 - t) * t * t * this.y2 + t * t * t;
  }

  sampleSlopeX(t) {
    return 3 * (1 - t) * (1 - t) * this.x1 + 6 * (1 - t) * t * (this.x2 - this.x1) + 3 * t * t * (1 - this.x2);
  }

  // Solve for t given x in [0, 1] using Newton-Raphson with bisection fallback
  solveT(x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    let t = x; // Initial guess
    for (let i = 0; i < 8; i++) {
      const currentX = this.sampleX(t) - x;
      if (Math.abs(currentX) < 1e-6) return t;
      const slope = this.sampleSlopeX(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= currentX / slope;
      if (t < 0 || t > 1) break;
    }

    // Fallback to binary bisection
    let t0 = 0, t1 = 1;
    t = x;
    for (let i = 0; i < 16; i++) {
      const currentX = this.sampleX(t);
      if (Math.abs(currentX - x) < 1e-6) return t;
      if (x > currentX) t0 = t;
      else t1 = t;
      t = (t0 + t1) * 0.5;
    }
    return t;
  }

  // Returns progress y for time progress x in [0, 1]
  solve(x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const t = this.solveT(x);
    return this.sampleY(t);
  }
}

export const EASING_PRESETS = {
  'linear': { name: 'Linear (Konstan)', p1: [0.0, 0.0], p2: [1.0, 1.0] },
  'ease-in-out': { name: 'Ease In-Out (Halus)', p1: [0.42, 0.0], p2: [0.58, 1.0] },
  'ease-in': { name: 'Ease In (Akselerasi)', p1: [0.42, 0.0], p2: [1.0, 1.0] },
  'ease-out': { name: 'Ease Out (Deselerasi)', p1: [0.0, 0.0], p2: [0.58, 1.0] },
  'slow-mo': { name: 'Slow-Mo Tengah (Dramatis)', p1: [0.8, 0.05], p2: [0.2, 0.95] },
  'snappy': { name: 'Snappy Fast-In', p1: [0.16, 1.0], p2: [0.3, 1.0] },
  'smooth-step': { name: 'Smooth Step', p1: [0.25, 0.1], p2: [0.25, 1.0] },
  'anticipate': { name: 'Anticipate & Punch', p1: [0.35, -0.25], p2: [0.2, 1.25] }
};

export class InteractiveCurveEditor {
  constructor(canvasElement, onChangeCallback) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.onChange = onChangeCallback || (() => {});

    this.solver = new BezierSolver(0.42, 0.0, 0.58, 1.0);
    this.preset = 'ease-in-out';
    this.activeHandle = null; // 'p1' or 'p2'

    this.padding = 24;
    this.previewProgress = 0;

    this.setupListeners();
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width || 260;
    const h = rect.height || 180;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawWidth = w;
    this.drawHeight = h;
    this.render();
  }

  setCurve(p1, p2, preset = 'custom') {
    this.solver.set(p1[0], p1[1], p2[0], p2[1]);
    this.preset = preset;
    this.render();
  }

  getCurve() {
    return {
      p1: [Number(this.solver.x1.toFixed(3)), Number(this.solver.y1.toFixed(3))],
      p2: [Number(this.solver.x2.toFixed(3)), Number(this.solver.y2.toFixed(3))],
      preset: this.preset
    };
  }

  graphToCanvas(gx, gy) {
    const w = this.drawWidth - 2 * this.padding;
    const h = this.drawHeight - 2 * this.padding;
    return {
      x: this.padding + gx * w,
      y: this.drawHeight - this.padding - gy * h
    };
  }

  canvasToGraph(cx, cy) {
    const w = this.drawWidth - 2 * this.padding;
    const h = this.drawHeight - 2 * this.padding;
    const gx = Math.min(Math.max((cx - this.padding) / w, 0), 1);
    const gy = (this.drawHeight - this.padding - cy) / h;
    return { x: gx, y: gy };
  }

  setupListeners() {
    const getPos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: clientX - rect.left,
        y: clientY - rect.top
      };
    };

    const onPointerDown = (e) => {
      const pos = getPos(e);
      const cp1 = this.graphToCanvas(this.solver.x1, this.solver.y1);
      const cp2 = this.graphToCanvas(this.solver.x2, this.solver.y2);

      const d1 = Math.hypot(pos.x - cp1.x, pos.y - cp1.y);
      const d2 = Math.hypot(pos.x - cp2.x, pos.y - cp2.y);

      if (d1 < 18) {
        this.activeHandle = 'p1';
      } else if (d2 < 18) {
        this.activeHandle = 'p2';
      } else {
        if (d1 < d2 && d1 < 40) this.activeHandle = 'p1';
        else if (d2 < 40) this.activeHandle = 'p2';
      }

      if (this.activeHandle) {
        e.preventDefault();
      }
    };

    const onPointerMove = (e) => {
      if (!this.activeHandle) return;
      e.preventDefault();
      const pos = getPos(e);
      const g = this.canvasToGraph(pos.x, pos.y);

      if (this.activeHandle === 'p1') {
        this.solver.x1 = g.x;
        this.solver.y1 = Math.min(Math.max(g.y, -0.5), 1.5);
      } else if (this.activeHandle === 'p2') {
        this.solver.x2 = g.x;
        this.solver.y2 = Math.min(Math.max(g.y, -0.5), 1.5);
      }
      this.preset = 'custom';
      this.render();
      this.onChange(this.getCurve());
    };

    const onPointerUp = () => {
      if (this.activeHandle) {
        this.activeHandle = null;
        this.render();
        this.onChange(this.getCurve());
      }
    };

    this.canvas.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);

    this.canvas.addEventListener('touchstart', onPointerDown, { passive: false });
    window.addEventListener('touchmove', onPointerMove, { passive: false });
    window.addEventListener('touchend', onPointerUp);
  }

  setPreviewProgress(progress) {
    this.previewProgress = Math.min(Math.max(progress, 0), 1);
    this.render();
  }

  render() {
    const ctx = this.ctx;
    const w = this.drawWidth;
    const h = this.drawHeight;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);

    // Coordinate Area
    const p0 = this.graphToCanvas(0, 0);
    const pEnd = this.graphToCanvas(1, 1);

    ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
    ctx.fillRect(p0.x, pEnd.y, pEnd.x - p0.x, p0.y - pEnd.y);

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 1;
    for (let i = 0.25; i <= 0.75; i += 0.25) {
      const gx = this.graphToCanvas(i, 0).x;
      const gy = this.graphToCanvas(0, i).y;
      ctx.beginPath();
      ctx.moveTo(gx, pEnd.y);
      ctx.lineTo(gx, p0.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(p0.x, gy);
      ctx.lineTo(pEnd.x, gy);
      ctx.stroke();
    }

    // Linear diagonal reference line
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(pEnd.x, pEnd.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Axes Box
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(p0.x, pEnd.y, pEnd.x - p0.x, p0.y - pEnd.y);

    // Labels
    ctx.fillStyle = '#64748b';
    ctx.font = '9px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('0%', p0.x, p0.y + 14);
    ctx.fillText('Waktu / Durasi', p0.x + (pEnd.x - p0.x) / 2, p0.y + 14);
    ctx.fillText('100%', pEnd.x, p0.y + 14);

    ctx.textAlign = 'right';
    ctx.fillText('100%', p0.x - 4, pEnd.y + 4);
    ctx.fillText('0%', p0.x - 4, p0.y + 4);

    // Control Handle Lines
    const cp1 = this.graphToCanvas(this.solver.x1, this.solver.y1);
    const cp2 = this.graphToCanvas(this.solver.x2, this.solver.y2);

    // P1 Line (Cyan)
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(cp1.x, cp1.y);
    ctx.stroke();

    // P2 Line (Emerald)
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pEnd.x, pEnd.y);
    ctx.lineTo(cp2.x, cp2.y);
    ctx.stroke();

    // Bezier Curve
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);

    const steps = 50;
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      const val = this.solver.solve(u);
      const pt = this.graphToCanvas(u, val);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();

    // Handle 1 (P1)
    ctx.fillStyle = '#06b6d4';
    ctx.beginPath();
    ctx.arc(cp1.x, cp1.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Handle 2 (P2)
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(cp2.x, cp2.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Playhead indicator
    if (this.previewProgress >= 0) {
      const currentY = this.solver.solve(this.previewProgress);
      const livePt = this.graphToCanvas(this.previewProgress, currentY);

      ctx.strokeStyle = 'rgba(250, 204, 21, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(livePt.x, pEnd.y);
      ctx.lineTo(livePt.x, p0.y);
      ctx.stroke();

      ctx.fillStyle = '#facc15';
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(livePt.x, livePt.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
}
