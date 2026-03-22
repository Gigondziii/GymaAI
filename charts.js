// ============================================
// GYMA — PROGRESS CHARTS
// ============================================

const Charts = (() => {
  const ORANGE = '#E8500A';
  const CARD_BG = '#141414';
  const BORDER = '#2A2A2A';
  const MUTED = '#888888';
  const TEXT = '#F0F0F0';

  function setupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = (canvas.dataset.height ? parseInt(canvas.dataset.height) : 180) * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    canvas.style.height = (canvas.dataset.height || 180) + 'px';
    return { ctx, w: rect.width, h: canvas.dataset.height ? parseInt(canvas.dataset.height) : 180 };
  }

  // Bar chart: weekly workouts
  function drawWeeklyBars(canvas, weekData) {
    const { ctx, w, h } = setupCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    if (!weekData || !weekData.length) { drawEmpty(ctx, w, h, 'No workouts yet'); return; }

    const maxVal = Math.max(...weekData.map(d => d.count), 1);
    const barW = (w - 48) / weekData.length;
    const chartH = h - 40;
    const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

    weekData.forEach((d, i) => {
      const x = 24 + i * barW + barW * 0.15;
      const bw = barW * 0.7;
      const bh = (d.count / maxVal) * chartH;
      const y = chartH - bh + 10;

      // Background bar
      ctx.fillStyle = BORDER;
      ctx.beginPath();
      roundRect(ctx, x, 10, bw, chartH, 4);
      ctx.fill();

      // Value bar
      if (d.count > 0) {
        const grad = ctx.createLinearGradient(0, y, 0, chartH + 10);
        grad.addColorStop(0, ORANGE);
        grad.addColorStop(1, '#C23B22');
        ctx.fillStyle = grad;
        ctx.beginPath();
        roundRect(ctx, x, y, bw, bh, 4);
        ctx.fill();
        // Glow
        ctx.shadowColor = ORANGE;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        roundRect(ctx, x, y, bw, 3, 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Label
      ctx.fillStyle = d.count > 0 ? TEXT : MUTED;
      ctx.font = `600 11px "DM Sans"`;
      ctx.textAlign = 'center';
      ctx.fillText(labels[i] || d.label, x + bw / 2, h - 4);
    });
  }

  // Line chart: form score over time
  function drawFormLine(canvas, scores) {
    const { ctx, w, h } = setupCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    if (!scores || scores.length < 2) { drawEmpty(ctx, w, h, 'Complete 2+ workouts'); return; }

    const padL = 28, padR = 16, padT = 12, padB = 28;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;
    const maxS = 100, minS = Math.max(0, Math.min(...scores) - 10);

    const pts = scores.map((s, i) => ({
      x: padL + (i / (scores.length - 1)) * chartW,
      y: padT + (1 - (s - minS) / (maxS - minS)) * chartH,
    }));

    // Grid
    [25, 50, 75, 100].forEach(v => {
      const y = padT + (1 - (v - 0) / 100) * chartH;
      ctx.strokeStyle = BORDER; ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = MUTED; ctx.font = '10px "Roboto Mono"'; ctx.textAlign = 'right';
      ctx.fillText(`${v}`, padL - 4, y + 4);
    });

    // Fill
    const grad = ctx.createLinearGradient(0, padT, 0, padT + chartH);
    grad.addColorStop(0, 'rgba(232,80,10,0.3)');
    grad.addColorStop(1, 'rgba(232,80,10,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, padT + chartH);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, padT + chartH);
    ctx.closePath(); ctx.fill();

    // Line
    ctx.strokeStyle = ORANGE; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();

    // Dots
    pts.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = ORANGE; ctx.fill();
    });
  }

  // Heatmap
  function drawHeatmap(canvas, activeDates) {
    const { ctx, w, h } = setupCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const activeSet = new Set(activeDates);
    const cols = Math.floor((w - 8) / 16);
    const rows = 7;
    const today = new Date();

    for (let c = cols - 1; c >= 0; c--) {
      for (let r = 0; r < rows; r++) {
        const d = new Date(today);
        d.setDate(today.getDate() - (cols - 1 - c) * 7 - (6 - r));
        const key = d.toISOString().split('T')[0];
        const isActive = activeSet.has(key);
        const x = c * 16 + 4;
        const y = r * 16 + 4;
        ctx.fillStyle = isActive ? ORANGE : BORDER;
        ctx.shadowColor = isActive ? ORANGE : 'transparent';
        ctx.shadowBlur = isActive ? 6 : 0;
        ctx.beginPath(); roundRect(ctx, x, y, 12, 12, 3); ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  }

  function drawEmpty(ctx, w, h, msg) {
    ctx.fillStyle = MUTED;
    ctx.font = `14px "DM Sans"`;
    ctx.textAlign = 'center';
    ctx.fillText(msg, w / 2, h / 2);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  return { drawWeeklyBars, drawFormLine, drawHeatmap };
})();

window.Charts = Charts;
