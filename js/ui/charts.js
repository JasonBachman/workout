/**
 * Minimal SVG chart helpers for analytics.
 * No dependencies — just returns SVG strings.
 */

const CHART_COLORS = [
  '#e2725b', '#4ade80', '#facc15', '#60a5fa', '#c084fc',
  '#f472b6', '#34d399', '#fb923c', '#a78bfa', '#38bdf8',
];

/**
 * Line chart.
 *
 * @param {Array<{label: string, value: number}>} data
 * @param {Object} opts
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {string} opts.color
 * @param {string} opts.unit
 * @param {boolean} opts.showDots
 * @returns {string} SVG HTML
 */
export function lineChart(data, opts = {}) {
  const w = opts.width ?? 340;
  const h = opts.height ?? 160;
  const color = opts.color ?? CHART_COLORS[0];
  const unit = opts.unit ?? '';
  const showDots = opts.showDots ?? true;
  const pad = { top: 20, right: 12, bottom: 32, left: 44 };

  if (data.length === 0) return '<div class="text-sm text-muted">No data yet</div>';

  const values = data.map((d) => d.value);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;

  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const points = data.map((d, i) => {
    const x = pad.left + (i / Math.max(data.length - 1, 1)) * plotW;
    const y = pad.top + plotH - ((d.value - minV) / range) * plotH;
    return { x, y, label: d.label, value: d.value };
  });

  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');

  // Gradient fill under line
  const areaPoints = [
    `${points[0].x},${pad.top + plotH}`,
    ...points.map((p) => `${p.x},${p.y}`),
    `${points[points.length - 1].x},${pad.top + plotH}`,
  ].join(' ');

  // Y-axis labels (3 ticks)
  const yTicks = [minV, minV + range / 2, maxV].map((v) => ({
    value: Math.round(v),
    y: pad.top + plotH - ((v - minV) / range) * plotH,
  }));

  // X-axis labels (first, middle, last)
  const xIdxs = [0, Math.floor(data.length / 2), data.length - 1].filter((v, i, a) => a.indexOf(v) === i);

  return `
    <svg viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px;">
      <defs>
        <linearGradient id="fill-${color.slice(1)}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>

      <!-- Grid lines -->
      ${yTicks.map((t) => `
        <line x1="${pad.left}" y1="${t.y}" x2="${w - pad.right}" y2="${t.y}"
          stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
        <text x="${pad.left - 6}" y="${t.y + 4}" text-anchor="end"
          fill="rgba(255,255,255,0.35)" font-size="10" font-family="var(--font-mono)">${t.value}${unit}</text>
      `).join('')}

      <!-- Area fill -->
      <polygon points="${areaPoints}" fill="url(#fill-${color.slice(1)})"/>

      <!-- Line -->
      <polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>

      <!-- Dots -->
      ${showDots && data.length <= 30 ? points.map((p) => `
        <circle cx="${p.x}" cy="${p.y}" r="3" fill="${color}"/>
      `).join('') : ''}

      <!-- X labels -->
      ${xIdxs.map((i) => `
        <text x="${points[i].x}" y="${h - 6}" text-anchor="middle"
          fill="rgba(255,255,255,0.35)" font-size="10">${data[i].label}</text>
      `).join('')}
    </svg>
  `;
}

/**
 * Horizontal bar chart.
 *
 * @param {Array<{label: string, value: number, max?: number, color?: string}>} data
 * @returns {string} HTML
 */
export function barChart(data) {
  if (data.length === 0) return '<div class="text-sm text-muted">No data yet</div>';

  const maxVal = Math.max(...data.map((d) => d.max ?? d.value), 1);

  return `
    <div class="flex flex-col gap-3">
      ${data.map((d, i) => {
        const pct = Math.min(100, (d.value / maxVal) * 100);
        const col = d.color ?? CHART_COLORS[i % CHART_COLORS.length];
        return `
          <div class="progress-labeled">
            <div class="progress-label">
              <span>${d.label}</span>
              <span class="font-mono">${d.value}${d.max ? ' / ' + d.max : ''}</span>
            </div>
            <div class="progress">
              <div class="progress-fill" style="width:${pct}%;background:${col};"></div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/**
 * Calendar heatmap (last 12 weeks).
 *
 * @param {Object.<string, number>} dateCounts - 'YYYY-MM-DD' → set count
 * @returns {string} SVG HTML
 */
export function calendarHeatmap(dateCounts) {
  const weeks = 12;
  const cellSize = 14;
  const gap = 3;
  const w = weeks * (cellSize + gap) + 40;
  const h = 7 * (cellSize + gap) + 24;

  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun

  // Start from 12 weeks ago, aligned to Sunday
  const start = new Date(today);
  start.setDate(start.getDate() - (weeks * 7) + (7 - dayOfWeek));

  const maxCount = Math.max(1, ...Object.values(dateCounts));
  const dayLabels = ['', 'M', '', 'W', '', 'F', ''];

  const cells = [];
  const d = new Date(start);

  for (let week = 0; week < weeks; week++) {
    for (let day = 0; day < 7; day++) {
      const dateStr = d.toISOString().slice(0, 10);
      const count = dateCounts[dateStr] ?? 0;
      const futureDay = d > today;

      let fill;
      if (futureDay) {
        fill = 'rgba(255,255,255,0.02)';
      } else if (count === 0) {
        fill = 'rgba(255,255,255,0.05)';
      } else {
        const intensity = Math.min(count / maxCount, 1);
        const alpha = 0.2 + intensity * 0.8;
        fill = `rgba(74, 222, 128, ${alpha})`;
      }

      cells.push(`<rect x="${40 + week * (cellSize + gap)}" y="${day * (cellSize + gap)}"
        width="${cellSize}" height="${cellSize}" rx="3" fill="${fill}">
        <title>${dateStr}: ${count} sets</title>
      </rect>`);

      d.setDate(d.getDate() + 1);
    }
  }

  return `
    <svg viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px;">
      ${dayLabels.map((label, i) => `
        <text x="28" y="${i * (cellSize + gap) + cellSize - 2}" text-anchor="end"
          fill="rgba(255,255,255,0.3)" font-size="10">${label}</text>
      `).join('')}
      ${cells.join('')}
    </svg>
  `;
}

/** Get a color from the palette by index. */
export function chartColor(i) {
  return CHART_COLORS[i % CHART_COLORS.length];
}
