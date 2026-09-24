// Throwaway design-review mockup — radial N-player Ludo board.
// Not wired to game-logic.js / server.js in any way. Pure visual comparison tool.

const SVGNS = 'http://www.w3.org/2000/svg';

const DEFAULT_COLORS = {
  4: ['#e63946', '#2ecc71', '#ffd60a', '#2f6fed'],                 // classic: red, green, yellow, blue
  5: ['#e63946', '#2ecc71', '#ffd60a', '#2f6fed', '#f4820a'],      // + orange, per the reference image
};

const PLAYER_NAMES = (n) => Array.from({ length: n }, (_, i) => `Player ${i + 1}`);

const state = {
  count: 5,
  colors: { ...DEFAULT_COLORS[5] },
  showLabels: true,
  showPieces: true,
};

const svg = document.getElementById('board');
const colorInputsEl = document.getElementById('colorInputs');
const showLabelsEl = document.getElementById('showLabels');
const showPiecesEl = document.getElementById('showPieces');
const toggleEl = document.getElementById('playerCountToggle');
const resetBtn = document.getElementById('resetColors');

const CX = 400, CY = 400;
const INNER_R = 80;    // radius of the shared center polygon (home-stretch hub)
const HOME_APEX_R = 220; // where each home triangle's inward point sits
const OUTER_R = 370;   // board rim
const ARM_HALF_WIDTH = 100;

function el(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children) node.appendChild(c);
  return node;
}

// Rotate a local point (arm pointing "up", i.e. -Y is outward) by angleDeg around the board center.
function rotatePoint(x, y, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const rx = x * cos - y * sin;
  const ry = x * sin + y * cos;
  return [CX + rx, CY + ry];
}

function pointsAttr(pts) {
  return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

function buildArm(index, total, color) {
  const angle = -90 + (index * 360) / total; // -90 so player 0 starts pointing up
  const group = el('g', { class: `player-${index + 1}-arm`, 'data-color': color });

  // --- Home triangle (wide base at the rim, apex pointing toward center) ---
  const homeLocal = [
    [-ARM_HALF_WIDTH, -OUTER_R],
    [ARM_HALF_WIDTH, -OUTER_R],
    [0, -HOME_APEX_R],
  ];
  const homePts = homeLocal.map(([x, y]) => rotatePoint(x, y, angle));
  group.appendChild(
    el('polygon', {
      class: `player-${index + 1}-path`,
      points: pointsAttr(homePts),
      fill: color,
      stroke: 'rgba(0,0,0,0.25)',
      'stroke-width': '2',
    })
  );

  // Star outline in the middle of the home triangle
  const starCenterLocal = [0, -(OUTER_R + HOME_APEX_R) / 2 - 10];
  const [starX, starY] = rotatePoint(starCenterLocal[0], starCenterLocal[1], angle);
  group.appendChild(buildStar(starX, starY, 22, 'rgba(255,255,255,0.85)'));

  // 4 piece circles inside the home triangle
  if (state.showPieces) {
    const offsets = [
      [-42, -OUTER_R + 55],
      [42, -OUTER_R + 55],
      [-42, -OUTER_R + 100],
      [42, -OUTER_R + 100],
    ];
    for (const [ox, oy] of offsets) {
      const [px, py] = rotatePoint(ox, oy, angle);
      group.appendChild(
        el('circle', {
          class: `player-${index + 1}-piece`,
          cx: px, cy: py, r: 14,
          fill: '#fff',
          stroke: color,
          'stroke-width': '5',
        })
      );
    }
  }

  // --- Track path: lane of square cells from the center hub out to the home apex ---
  const rows = 4;
  const cellSize = (HOME_APEX_R - INNER_R) / rows;
  for (let r = 0; r < rows; r++) {
    const yTop = -(INNER_R + r * cellSize);
    const yBot = -(INNER_R + (r + 1) * cellSize);
    const corners = [
      [-ARM_HALF_WIDTH * 0.32, yTop],
      [ARM_HALF_WIDTH * 0.32, yTop],
      [ARM_HALF_WIDTH * 0.32, yBot],
      [-ARM_HALF_WIDTH * 0.32, yBot],
    ].map(([x, y]) => rotatePoint(x, y, angle));

    const isStarCell = r === 1;
    const cell = el('polygon', {
      class: 'track-cell-shared',
      points: pointsAttr(corners),
      fill: isStarCell ? 'rgba(255,255,255,0.08)' : 'var(--bg-card2, #1a1a38)',
      stroke: 'rgba(255,255,255,0.35)',
      'stroke-width': '1.5',
    });
    group.appendChild(cell);

    if (isStarCell) {
      const [sx, sy] = rotatePoint(0, (yTop + yBot) / 2, angle);
      group.appendChild(buildStar(sx, sy, 10, 'rgba(255,255,255,0.6)', 'start-star'));
    }
  }

  // Entry arrow at the innermost cell, pointing toward the center hub
  const arrowTip = rotatePoint(0, -(INNER_R - 6), angle);
  const arrowBase = rotatePoint(0, -(INNER_R + cellSize * 0.7), angle);
  group.appendChild(buildArrow(arrowBase, arrowTip, color));

  // Label at the outer rim
  if (state.showLabels) {
    const [lx, ly] = rotatePoint(0, -OUTER_R - 20, angle);
    const label = el('text', {
      x: lx, y: ly,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      fill: 'var(--text, #e8e8f4)',
      'font-size': '15',
      'font-weight': '600',
      'font-family': 'inherit',
    });
    label.textContent = PLAYER_NAMES(total)[index];
    group.appendChild(label);
  }

  return group;
}

function buildStar(cx, cy, radius, fill, cssClass = '') {
  const points = 5;
  const inner = radius * 0.45;
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? radius : inner;
    const a = (Math.PI / points) * i - Math.PI / 2;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return el('g', { class: `cell-star ${cssClass}`.trim() }, [
    el('polygon', { points: pointsAttr(pts), fill, stroke: 'none' }),
  ]);
}

function buildArrow(from, to, color) {
  const [x1, y1] = from, [x2, y2] = to;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = 12;
  const p1 = [x2, y2];
  const p2 = [x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6)];
  const p3 = [x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6)];
  return el('g', { class: 'entry-arrow' }, [
    el('line', { x1, y1, x2, y2, stroke: color, 'stroke-width': 3 }),
    el('polygon', { points: pointsAttr([p1, p2, p3]), fill: color }),
  ]);
}

function buildCenterHub(total, colors) {
  const group = el('g', { id: 'center-hub' });
  // N colored wedges, one per player, meeting at the exact board center.
  for (let i = 0; i < total; i++) {
    const a0 = -90 + (i * 360) / total - 180 / total;
    const a1 = -90 + (i * 360) / total + 180 / total;
    const p0 = rotatePoint(0, -INNER_R, a0);
    const p1 = rotatePoint(0, -INNER_R, a1);
    group.appendChild(
      el('polygon', {
        class: `center-wedge player-${i + 1}-path`,
        points: pointsAttr([[CX, CY], p0, p1]),
        fill: colors[i],
        stroke: 'rgba(0,0,0,0.3)',
        'stroke-width': '1.5',
      })
    );
  }
  // Dice sitting in the very middle, on top of the wedges.
  const dice = el('g', { id: 'center-dice' });
  dice.appendChild(el('rect', { x: CX - 26, y: CY - 26, width: 52, height: 52, rx: 8, fill: '#fff', stroke: '#111', 'stroke-width': 2 }));
  const pips = [[-11, -11], [11, 11], [-11, 11], [11, -11], [0, 0]];
  for (const [dx, dy] of pips) {
    dice.appendChild(el('circle', { cx: CX + dx, cy: CY + dy, r: 4.2, fill: '#111' }));
  }
  group.appendChild(dice);
  return group;
}

function render() {
  svg.innerHTML = '';
  const { count, colors } = state;
  const board = el('g', { id: 'game-board' });
  const startTriangles = el('g', { id: 'start-triangles' });

  for (let i = 0; i < count; i++) {
    startTriangles.appendChild(buildArm(i, count, colors[i]));
  }
  board.appendChild(startTriangles);
  board.appendChild(buildCenterHub(count, colors));
  svg.appendChild(board);
}

function buildColorInputs() {
  colorInputsEl.innerHTML = '';
  const names = PLAYER_NAMES(state.count);
  state.colors.forEach((color, i) => {
    const row = document.createElement('div');
    row.className = 'colorRow';
    const input = document.createElement('input');
    input.type = 'color';
    input.value = color;
    input.addEventListener('input', (e) => {
      state.colors[i] = e.target.value;
      render();
    });
    const label = document.createElement('span');
    label.textContent = names[i];
    row.appendChild(input);
    row.appendChild(label);
    colorInputsEl.appendChild(row);
  });
}

function setCount(count) {
  state.count = count;
  state.colors = [...DEFAULT_COLORS[count]];
  [...toggleEl.children].forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.count) === count);
  });
  buildColorInputs();
  render();
}

toggleEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-count]');
  if (!btn) return;
  setCount(Number(btn.dataset.count));
});

showLabelsEl.addEventListener('change', (e) => { state.showLabels = e.target.checked; render(); });
showPiecesEl.addEventListener('change', (e) => { state.showPieces = e.target.checked; render(); });
resetBtn.addEventListener('click', () => {
  state.colors = [...DEFAULT_COLORS[state.count]];
  buildColorInputs();
  render();
});

// Init
buildColorInputs();
render();
