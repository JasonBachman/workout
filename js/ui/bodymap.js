/**
 * SVG body-map heatmap — front and back silhouettes.
 * Each muscle region is colored by readiness score.
 *
 * Returns an SVG string for embedding in the dashboard.
 */

const STATUS_COLORS = {
  ready: '#4ade80',
  recovering: '#facc15',
  fatigued: '#f87171',
  default: '#2a3555',
};

function color(readinessData, muscleId) {
  const m = readinessData?.perMuscle?.[muscleId];
  if (!m) return STATUS_COLORS.default;
  return STATUS_COLORS[m.status] ?? STATUS_COLORS.default;
}

/**
 * Render front and back body-map SVGs side by side.
 *
 * @param {Object} readinessData - From computeReadiness()
 * @returns {string} HTML string
 */
export function renderBodyMap(readinessData) {
  return `
    <div class="flex gap-4 justify-between" style="max-width:360px;margin:0 auto;">
      <div class="flex flex-col items-center gap-2" style="flex:1;">
        <span class="text-sm text-muted">Front</span>
        ${renderFront(readinessData)}
      </div>
      <div class="flex flex-col items-center gap-2" style="flex:1;">
        <span class="text-sm text-muted">Back</span>
        ${renderBack(readinessData)}
      </div>
    </div>
  `;
}

function renderFront(r) {
  return `
  <svg viewBox="0 0 120 260" width="100%" style="max-width:150px;">
    <!-- Head -->
    <ellipse cx="60" cy="24" rx="14" ry="17" fill="${STATUS_COLORS.default}" stroke="rgba(255,255,255,0.1)" stroke-width="0.5"/>
    <!-- Neck -->
    <rect x="53" y="40" width="14" height="10" rx="3" fill="${STATUS_COLORS.default}"/>

    <!-- Front Delts -->
    <ellipse cx="33" cy="58" rx="10" ry="9" fill="${color(r, 'front-delts')}" opacity="0.85"/>
    <ellipse cx="87" cy="58" rx="10" ry="9" fill="${color(r, 'front-delts')}" opacity="0.85"/>

    <!-- Chest -->
    <ellipse cx="47" cy="72" rx="14" ry="11" fill="${color(r, 'chest')}" opacity="0.85"/>
    <ellipse cx="73" cy="72" rx="14" ry="11" fill="${color(r, 'chest')}" opacity="0.85"/>

    <!-- Biceps -->
    <ellipse cx="25" cy="85" rx="7" ry="14" fill="${color(r, 'biceps')}" opacity="0.85"/>
    <ellipse cx="95" cy="85" rx="7" ry="14" fill="${color(r, 'biceps')}" opacity="0.85"/>

    <!-- Abs -->
    <rect x="45" y="88" width="30" height="32" rx="5" fill="${color(r, 'abs')}" opacity="0.85"/>

    <!-- Forearms -->
    <ellipse cx="20" cy="112" rx="5" ry="16" fill="${color(r, 'forearms')}" opacity="0.85"/>
    <ellipse cx="100" cy="112" rx="5" ry="16" fill="${color(r, 'forearms')}" opacity="0.85"/>

    <!-- Quads -->
    <ellipse cx="47" cy="150" rx="12" ry="28" fill="${color(r, 'quads')}" opacity="0.85"/>
    <ellipse cx="73" cy="150" rx="12" ry="28" fill="${color(r, 'quads')}" opacity="0.85"/>

    <!-- Side Delts (visible from front too) -->
    <ellipse cx="24" cy="60" rx="5" ry="8" fill="${color(r, 'side-delts')}" opacity="0.6"/>
    <ellipse cx="96" cy="60" rx="5" ry="8" fill="${color(r, 'side-delts')}" opacity="0.6"/>

    <!-- Calves -->
    <ellipse cx="45" cy="210" rx="8" ry="22" fill="${color(r, 'calves')}" opacity="0.85"/>
    <ellipse cx="75" cy="210" rx="8" ry="22" fill="${color(r, 'calves')}" opacity="0.85"/>
  </svg>`;
}

function renderBack(r) {
  return `
  <svg viewBox="0 0 120 260" width="100%" style="max-width:150px;">
    <!-- Head -->
    <ellipse cx="60" cy="24" rx="14" ry="17" fill="${STATUS_COLORS.default}" stroke="rgba(255,255,255,0.1)" stroke-width="0.5"/>
    <!-- Neck / Traps -->
    <path d="M46,40 Q60,35 74,40 L74,55 Q60,50 46,55 Z" fill="${color(r, 'traps')}" opacity="0.85"/>

    <!-- Rear Delts -->
    <ellipse cx="33" cy="58" rx="10" ry="9" fill="${color(r, 'rear-delts')}" opacity="0.85"/>
    <ellipse cx="87" cy="58" rx="10" ry="9" fill="${color(r, 'rear-delts')}" opacity="0.85"/>

    <!-- Upper Back -->
    <rect x="40" y="60" width="40" height="18" rx="5" fill="${color(r, 'upper-back')}" opacity="0.85"/>

    <!-- Lats -->
    <path d="M38,78 Q35,95 42,108 L48,108 L48,78 Z" fill="${color(r, 'lats')}" opacity="0.85"/>
    <path d="M82,78 Q85,95 78,108 L72,108 L72,78 Z" fill="${color(r, 'lats')}" opacity="0.85"/>

    <!-- Triceps -->
    <ellipse cx="25" cy="82" rx="7" ry="14" fill="${color(r, 'triceps')}" opacity="0.85"/>
    <ellipse cx="95" cy="82" rx="7" ry="14" fill="${color(r, 'triceps')}" opacity="0.85"/>

    <!-- Lower back / Glutes -->
    <ellipse cx="50" cy="128" rx="12" ry="10" fill="${color(r, 'glutes')}" opacity="0.85"/>
    <ellipse cx="70" cy="128" rx="12" ry="10" fill="${color(r, 'glutes')}" opacity="0.85"/>

    <!-- Forearms -->
    <ellipse cx="20" cy="112" rx="5" ry="16" fill="${color(r, 'forearms')}" opacity="0.85"/>
    <ellipse cx="100" cy="112" rx="5" ry="16" fill="${color(r, 'forearms')}" opacity="0.85"/>

    <!-- Hamstrings -->
    <ellipse cx="47" cy="158" rx="12" ry="24" fill="${color(r, 'hamstrings')}" opacity="0.85"/>
    <ellipse cx="73" cy="158" rx="12" ry="24" fill="${color(r, 'hamstrings')}" opacity="0.85"/>

    <!-- Calves -->
    <ellipse cx="45" cy="210" rx="8" ry="22" fill="${color(r, 'calves')}" opacity="0.85"/>
    <ellipse cx="75" cy="210" rx="8" ry="22" fill="${color(r, 'calves')}" opacity="0.85"/>
  </svg>`;
}
