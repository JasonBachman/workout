/**
 * "More" screen — body metrics tracking, backup/restore, settings.
 */

import { logMetric, getMetricsByType, getAllMetrics } from '../data/metrics.js';
import { lineChart } from './charts.js';

let container = null;
let db = null;
let state = {
  tab: 'body',  // 'body' | 'backup'
  bodyweightHistory: [],
  measurementHistory: [],
  bwValue: '',
  measValue: '',
  measLabel: 'waist',
};

const MEASUREMENT_LABELS = ['waist', 'chest', 'arm', 'thigh', 'neck', 'hips'];

export const morePage = {
  async mount(el, ctx) {
    container = el;
    db = ctx.db;

    state.bodyweightHistory = await getMetricsByType(db, 'bodyweight');
    state.bodyweightHistory.sort((a, b) => a.date.localeCompare(b.date));

    state.measurementHistory = await getMetricsByType(db, 'measurement');
    state.measurementHistory.sort((a, b) => a.date.localeCompare(b.date));

    render();
  },

  unmount() {
    container = null;
  },
};

function render() {
  if (!container) return;

  container.innerHTML = `
    <div class="container flex flex-col gap-4" style="padding-top: var(--sp-4);">
      <h2 style="font-size: var(--text-xl); font-weight: 700;">More</h2>

      <!-- Tab toggle -->
      <div class="flex gap-2">
        <button class="btn btn-sm ${state.tab === 'body' ? 'btn-primary' : 'btn-secondary'}" data-tab="body">Body</button>
        <button class="btn btn-sm ${state.tab === 'backup' ? 'btn-primary' : 'btn-secondary'}" data-tab="backup">Backup</button>
      </div>

      ${state.tab === 'body' ? renderBody() : renderBackup()}
    </div>
  `;

  // Tab switching
  container.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      render();
    });
  });

  // Tab-specific events
  if (state.tab === 'body') bindBodyEvents();
  if (state.tab === 'backup') bindBackupEvents();
}

function renderBody() {
  // Bodyweight trend
  const bwData = state.bodyweightHistory.map((m) => ({
    label: m.date.slice(5),
    value: m.value,
  }));

  // Group measurements by label
  const measByLabel = {};
  for (const m of state.measurementHistory) {
    const key = m.label ?? 'other';
    if (!measByLabel[key]) measByLabel[key] = [];
    measByLabel[key].push(m);
  }

  return `
    <!-- Log Bodyweight -->
    <div class="card flex flex-col gap-3">
      <div class="card-header">Bodyweight</div>
      <div class="flex gap-3">
        <input class="input font-mono" type="number" inputmode="decimal" id="bw-input"
          placeholder="lbs" value="${state.bwValue}" style="flex:1;font-size:var(--text-xl);text-align:center;">
        <button class="btn btn-primary" id="log-bw-btn">Log</button>
      </div>
      ${bwData.length > 0 ? `
        <div class="mt-2">${lineChart(bwData, { color: '#60a5fa', unit: '' })}</div>
        <div class="text-sm text-muted">
          Latest: <span class="font-mono">${bwData[bwData.length - 1].value} lbs</span>
          ${bwData.length >= 2 ? `&middot; ${bwDelta(bwData)}` : ''}
        </div>
      ` : '<div class="text-sm text-muted">No entries yet.</div>'}
    </div>

    <!-- Log Measurement -->
    <div class="card flex flex-col gap-3">
      <div class="card-header">Measurements</div>
      <div class="flex gap-2" style="flex-wrap:wrap;">
        ${MEASUREMENT_LABELS.map((l) => `
          <button class="btn btn-sm meas-label-btn ${state.measLabel === l ? 'btn-primary' : 'btn-secondary'}" data-label="${l}">${l}</button>
        `).join('')}
      </div>
      <div class="flex gap-3">
        <input class="input font-mono" type="number" inputmode="decimal" id="meas-input"
          placeholder="inches" value="${state.measValue}" style="flex:1;text-align:center;">
        <button class="btn btn-primary" id="log-meas-btn">Log</button>
      </div>
    </div>

    <!-- Measurement Trends -->
    ${Object.entries(measByLabel).map(([label, entries]) => {
      const data = entries.map((m) => ({ label: m.date.slice(5), value: m.value }));
      return `
        <div class="card">
          <div class="card-header">${label} trend</div>
          <div class="mt-2">${lineChart(data, { color: '#c084fc', height: 100, unit: '"' })}</div>
          <div class="text-sm text-muted">Latest: ${data[data.length - 1].value}"</div>
        </div>
      `;
    }).join('')}
  `;
}

function renderBackup() {
  return `
    <div class="card flex flex-col gap-4">
      <div class="card-header">Backup & Restore</div>
      <p class="text-sm text-muted">Export all your data as a JSON file, or restore from a previous backup.</p>
      <button class="btn btn-secondary w-full" id="btn-export">Export JSON Backup</button>
      <button class="btn btn-secondary w-full" id="btn-import">Import from JSON</button>
    </div>

    <div class="card flex flex-col gap-3">
      <div class="card-header">About</div>
      <div class="text-sm text-muted">
        Strength Tracker — a personal PWA for tracking training volume,
        readiness, and progress. All data stored locally on your device.
      </div>
    </div>
  `;
}

function bindBodyEvents() {
  container.querySelector('#bw-input')?.addEventListener('input', (e) => {
    state.bwValue = e.target.value;
  });

  container.querySelector('#log-bw-btn')?.addEventListener('click', async () => {
    const value = parseFloat(state.bwValue);
    if (!value || value <= 0) return;

    const record = await logMetric(db, { type: 'bodyweight', value });
    state.bodyweightHistory.push(record);
    state.bodyweightHistory.sort((a, b) => a.date.localeCompare(b.date));
    state.bwValue = '';
    render();
  });

  container.querySelectorAll('.meas-label-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.measLabel = btn.dataset.label;
      render();
    });
  });

  container.querySelector('#meas-input')?.addEventListener('input', (e) => {
    state.measValue = e.target.value;
  });

  container.querySelector('#log-meas-btn')?.addEventListener('click', async () => {
    const value = parseFloat(state.measValue);
    if (!value || value <= 0) return;

    const record = await logMetric(db, { type: 'measurement', value, label: state.measLabel });
    state.measurementHistory.push(record);
    state.measurementHistory.sort((a, b) => a.date.localeCompare(b.date));
    state.measValue = '';
    render();
  });
}

function bindBackupEvents() {
  container.querySelector('#btn-export')?.addEventListener('click', async () => {
    const data = await db.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `strength-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  container.querySelector('#btn-import')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        await db.importAll(data);
        location.reload();
      } catch (err) {
        alert('Import failed: ' + err.message);
      }
    };
    input.click();
  });
}

function bwDelta(data) {
  const first = data[0].value;
  const last = data[data.length - 1].value;
  const diff = Math.round((last - first) * 10) / 10;
  if (diff > 0) return `<span style="color:var(--text-secondary);">+${diff} lbs</span>`;
  if (diff < 0) return `<span style="color:var(--text-secondary);">${diff} lbs</span>`;
  return 'no change';
}
