// The home page: a beach drawn in text, after the shore at Shichirigahama looking out to Enoshima, at the reader's
// own time of day. Clawd's part of it lives in clawd.js.
(() => {
  const pre = document.getElementById('beach');
  const canvas = document.createElement('canvas'); // Clawd is pixels, drawn over the text
  canvas.id = 'pixels';
  canvas.setAttribute('aria-hidden', 'true');
  pre.after(canvas);
  const pen = canvas.getContext('2d');
  const INK = { '#': '--clawd', o: '--eye', k: '--ink', d: '--bamboo', s: '--sun', b: '--wash', w: '--paper', g: '--moon' };
  const words = document.getElementById('words'); // the sand stays clear behind this text
  const { now, sunTimes, skyAt, moonPhase, clawd } = window.tides;
  const PERIOD = 8; // seconds for a breaker to roll in
  const PHASES = ['new moon', 'waxing crescent', 'first quarter', 'waxing gibbous',
    'full moon', 'waning gibbous', 'last quarter', 'waning crescent'];
  const CLOUDS = [
    ['    .--.     ', ' .-(    ).   ', '(___.__)__)  '],
    ['   _  _      ', ' _( )( )_    ', '(________)   '],
    ['      .-~~-.    ', '  .-~(      )-. ', ' (___________)  '],
  ];

  const hash = (x, y) => {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  // The real tide at Monterey, eased between the predicted highs and lows.
  const TIDES = JSON.parse(document.getElementById('world').textContent).tides ?? [];
  const [LO, HI] = [Math.min(...TIDES.map((e) => e.v)), Math.max(...TIDES.map((e) => e.v))];
  const tideAt = (ms) => {
    const i = TIDES.findIndex((e) => e.t > ms);
    if (i < 1) return null;
    const a = TIDES[i - 1], b = TIDES[i], f = (ms - a.t) / (b.t - a.t);
    const v = a.v + (b.v - a.v) * (1 - Math.cos(Math.PI * f)) / 2;
    return (2 * (v - LO)) / (HI - LO) - 1;
  };
  const tideWord = (ms) => {
    const next = TIDES.find((e) => e.t > ms);
    if (!next) return '';
    const at = new Date(next.t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return ` The tide is ${next.hi ? 'coming in' : 'going out'}; ${next.hi ? 'high' : 'low'} tide at ${at}.`;
  };

  window.tides.scenes = window.tides.scenes || {};
  window.tides.scenes.home = {
    name: 'Home',
    far(put, { cols, horizon, hash, sky, t }) {
      const ix = cols * 0.7, iw = Math.max(12, cols * 0.13);
      const island = (x) => { const u = (x - ix) / iw; return Math.round(Math.max(5.4 * Math.exp(-(((u + 0.3) / 0.42) ** 2)), 3.4 * Math.exp(-(((u - 0.55) / 0.32) ** 2)))); };
      for (let x = 0; x < cols; x++) {
        const top = island(x);
        for (let j = 1; j <= top; j++) put(x, horizon - j, j === top ? (hash(x, 3) < 0.5 ? '.' : ',') : '%&#'[Math.floor(hash(x, j) * 3)], j === top ? 'land top' : 'land');
        if (x < cols * 0.16) {
          const town = Math.floor(hash(Math.floor(x / 3), 9) * 3);
          for (let j = 1; j <= town; j++) put(x, horizon - j, j === town ? '▄' : '█', 'town');
        }
        if (x >= cols * 0.16 && x < ix - iw * 0.75) put(x, horizon, '=', 'town');
      }
      const towerX = Math.round(ix - iw * 0.3), towerTop = horizon - island(towerX) - 4;
      ['|', '[#]', '|', '|'].forEach((s, j) => [...s].forEach((c, k) => put(towerX - (s.length > 1) + k, towerTop + j, c, 'land')));
      if (sky === 'night' && Math.floor(t / 1.5) % 2) put(towerX, towerTop + 1, '*', 'lamp');
    },
    water() {},
    near(put, { cols, ground, rail }) {
      for (let x = 0; x < cols; x++) {
        put(x, rail, x % 14 === 6 ? '╦' : '═', 'rail');
        put(x, rail + 1, x % 14 === 6 ? '║' : ' ', 'rail');
      }
      const fence = (x0, r, n) => ({ r, fn: () => { for (let i = 0; i < n; i++) { put(x0 + i, r - 1, '|', 'bamboo'); put(x0 + i, r, '|', 'bamboo'); } } });
      return [
        fence(ground.x0 + Math.round((ground.x1 - ground.x0) * 0.08), ground.y1 - 1, Math.min(18, Math.round(cols * 0.12))),
        fence(ground.x0 + Math.round((ground.x1 - ground.x0) * 0.62), ground.y0 + 3, Math.min(14, Math.round(cols * 0.1))),
      ];
    },
  };

  let L; // layout, in character cells
  function layout() {
    const probe = document.createElement('span');
    probe.textContent = 'M'.repeat(40);
    pre.append(probe);
    const cw = probe.getBoundingClientRect().width / 40;
    probe.remove();
    const ch = parseFloat(getComputedStyle(pre).lineHeight);
    const box = pre.getBoundingClientRect(), w = words.getBoundingClientRect();
    const cols = Math.floor(box.width / cw), rows = Math.floor(box.height / ch);
    const clear = {
      x0: Math.floor((w.left - box.left) / cw) - 2, x1: Math.ceil((w.right - box.left) / cw) + 2,
      y0: Math.floor((w.top - box.top) / ch) - 1, y1: Math.ceil((w.bottom - box.top) / ch) + 1,
    };
    // Wide screens: the words sit on the sand and Clawd has the beach to their right.
    // Narrow screens: the whole scene fits above the words.
    const wide = clear.x1 < cols * 0.6, rail = rows - 2, top = wide ? rows : clear.y0 - 1;
    const horizon = Math.round(top * (wide ? 0.3 : 0.33)), shore = Math.round(top * (wide ? 0.57 : 0.65));
    const ground = wide
      ? { x0: clear.x1 + 5, x1: cols - 6, y0: shore + 5, y1: rail - 2 }
      : { x0: 6, x1: cols - 6, y0: shore + 4, y1: Math.max(shore + 6, top - 1) };
    const dpr = devicePixelRatio || 1;
    canvas.width = Math.round(box.width * dpr); canvas.height = Math.round(box.height * dpr);
    L = { cw, ch, dpr, cols, rows, horizon, shore, rail, clear, ground, aspect: cw / ch };
  }

  function frame(t, sceneId) {
    const { cols, rows, horizon, rail, clear, ground, aspect } = L;
    const d = now(), sky = skyAt(d), sun = sunTimes(d), phase = moonPhase(d);
    const ch = Array.from({ length: rows }, () => Array(cols).fill(' '));
    const cl = Array.from({ length: rows }, () => Array(cols).fill(''));
    const put = (x, y, c, k) => {
      if (x < 0 || x >= cols || y < 0 || y >= rows) return;
      if (y >= clear.y0 && y < clear.y1 && x >= clear.x0 && x < clear.x1) return; // keep the words on clean paper
      ch[y][x] = c; cl[y][x] = k;
    };
    const disc = (cx, cy, r, fn) => {
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
        for (let x = Math.floor(cx - r / aspect); x <= Math.ceil(cx + r / aspect); x++) {
          const u = (x + 0.5 - cx) * aspect / r, v = (y + 0.5 - cy) / r;
          if (u * u + v * v <= 1 && y < horizon) fn(x, y, u, v);
        }
    };
    const level = tideAt(d.getTime()); // -1 low … 1 high, or null with no tide table
    const shore = L.shore + (level === null ? -(sky === 'night') : Math.round(1.5 * level));
    const shoreAt = (x) => shore + Math.round(0.6 * Math.sin(x * 0.045) + 0.4 * Math.sin(x * 0.13 + 1));

    // Sky: stars, sun, moon, clouds
    if (sky === 'night') {
      for (let y = 0; y < horizon - 1; y++)
        for (let x = 0; x < cols; x++) {
          const h = hash(x, y);
          if (h < 0.01) put(x, y, Math.floor(t * 0.7 + h * 4000) % 11 ? '.' : '+', 'star');
        }
    }
    let sunX = -99;
    if (sky !== 'night') {
      const f = (sun.hour - sun.rise) / (sun.set - sun.rise);
      sunX = cols * (0.1 + 0.68 * f); // it sets behind the island
      const sunY = horizon - Math.sin(Math.PI * Math.max(-0.08, Math.min(1.08, f))) * (horizon - 5);
      const glow = sky === 'day' ? 1 : 1.6;
      disc(sunX, sunY, 2.2 * glow, (x, y, u, v) => {
        const r = Math.hypot(u, v) * glow;
        put(x, y, r < 0.6 ? '@' : r < 1 ? 'o' : '.', 'sun');
      });
    }
    const moonX = cols * 0.9, moonY = 4;
    if (Math.abs(moonX - sunX) > 14) {
      disc(moonX, moonY, 2.6, (x, y, u, v) => {
        const edge = Math.cos(2 * Math.PI * phase) * Math.sqrt(1 - v * v);
        const lit = phase < 0.5 ? u > edge : u < -edge;
        if (lit) put(x, y, '@', `moon${sky === 'day' ? ' faint' : ''}`);
        else if (sky === 'night') put(x, y, '.', 'moon dark'); // earthshine
      });
    }
    if (sky !== 'night') {
      CLOUDS.forEach((cloud, i) => {
        const span = cols + 30, x = Math.round(((i * span) / 3 + span * 4 - t * (0.12 + i * 0.03)) % span) - 15;
        cloud.forEach((row, j) => {
          const a = row.search(/\S/), z = row.trimEnd().length; // solid between its edges, so it hides the sun
          for (let k = a; k < z; k++) put(x + k, 2 + i * 3 + j, row[k], 'cloud');
        });
      });
    }

    const sceneContext = { sceneId, cols, rows, horizon, t, sky, hash, sunX, ground, rail, shoreAt };
    const scene = window.tides.scenes[sceneId] ?? window.tides.scenes.home;
    scene.far(put, sceneContext);

    // Sea: a calm swell, the sun's road on the water, then the surf.
    for (let x = 0; x < cols; x++) {
      if (ch[horizon][x] === ' ') put(x, horizon, hash(x, 7) < 0.7 ? '-' : '_', 'sea far');
      const s = shoreAt(x);
      const surf = Math.min(9, Math.round((s - horizon) * 0.65)); // rows of surf zone
      for (let y = horizon + 1; y < s - surf; y++) {
        const depth = (y - horizon) / (s - horizon);
        const h = hash(x + Math.floor(t * (0.3 + depth)), y);
        const set = Math.max(0, Math.cos(2 * Math.PI * (depth * 3 - 2 * t / PERIOD))) ** 4; // a swell line passing
        if (h < 0.08 + 0.12 * depth + 0.5 * set) put(x, y, set > 0.4 ? '~' : '-', 'sea');
        else if (h < 0.16 + 0.14 * depth) put(x, y, hash(y, x) < 0.5 ? '-' : '_', 'sea');
      }
      if (sky !== 'night') {
        for (let y = horizon + 1; y < s; y++) {
          const spread = 0.8 + (y - horizon) * 0.5;
          if (Math.abs(x - sunX) < spread && hash(x, y + Math.floor(t * 2)) < 0.3) put(x, y, '=', 'sun');
        }
      }
      // Two breakers in flight. Each stands up into a face up to three rows tall, breaks first at its peak and
      // peels out both ways, throws spray as the lip comes down, then rolls in as white water and thins out.
      for (let i = 0; i < 2; i++) {
        const cycle = t / PERIOD + i / 2, p = cycle % 1, n = Math.floor(cycle) * 2 + i;
        const y = Math.round(s - surf + surf * p ** 1.3); // the foot of the wave
        const peak = hash(n, 11) * cols, broke = 0.4 + Math.abs(x - peak) / cols * 0.5; // when this column breaks
        const flick = (j) => hash(x * 7 + j, n * 13 + Math.floor(t * 8));
        if (p < broke) {
          const tall = 1 + Math.round(2 * Math.max(0, 1 - (broke - p) / 0.3)), top = y - tall + 1;
          put(x, top, hash(x, n) < 0.85 ? '~' : '-', 'crest');
          for (let j = top + 1; j <= y; j++) if (hash(x * 5, n + j) < 0.8) put(x, j, j === y ? '-' : '=', 'face');
          if (tall === 3 && flick(0) < 0.12) put(x, top - 1, "'", 'spray'); // the lip feathers in the wind
        } else {
          const age = (p - broke) / (1 - broke), thick = age < 0.15 ? 3 : age < 0.45 ? 2 : 1, top = y - thick + 1;
          const burst = age < 0.12 ? 3 : age < 0.3 ? 1 : 0; // spray thrown up as the lip lands
          for (let j = 1; j <= burst; j++) if (flick(j) < 0.5 - j * 0.1) put(x, top - j, '.\'`'[Math.floor(flick(j + 9) * 3)], 'spray');
          put(x, top, flick(0) < 0.7 ? '≈' : '~', 'foam white');
          for (let j = top + 1; j <= y; j++) if (flick(j + 4) < 0.7) put(x, j, '~', 'foam');
        }
      }
      const q = (t * 2 / PERIOD + 0.06 * Math.sin(x * 0.07) + 1) % 1;
      const runup = q < 0.2 ? q / 0.2 : q < 0.75 ? 1 - (q - 0.2) / 0.55 : 0;
      const edge = s + Math.round(2 * runup);
      for (let y = s + 1; y < edge; y++) if (hash(x, y + Math.floor(t * 4)) < 0.15) put(x, y, ':', 'foam');
      put(x, edge, hash(x, Math.floor(t * 3)) < 0.6 ? '~' : '-', 'foam');

      // Sand, with the foreground railing along the sea wall.
      for (let y = edge + 1; y < rail; y++) {
        const h = hash(x, y * 31);
        if (h < 0.035) put(x, y, '.', 'sand');
        else if (h < 0.045) put(x, y, ',', 'sand');
      }
    }

    const spot = (x, y) => ({ c: Math.round(ground.x0 + x * (ground.x1 - ground.x0)), r: Math.round(ground.y0 + y * (ground.y1 - ground.y0)) });
    sceneContext.spot = spot;
    scene.water?.(put, sceneContext);
    const fences = scene.near(put, sceneContext) ?? [];
    const scale = (y) => 1.2 + 1.3 * Math.min(1, Math.max(0, y)); // CSS pixels per art pixel: smaller further off
    const pixels = [];
    const pix = (c, r, frame, y, fade) => pixels.push({ c, r, frame, unit: Math.max(1, Math.round(scale(y) * L.dpr)), fade });
    const rowsOf = (frame, y) => Math.ceil(frame.length * scale(y) / L.ch);
    sceneContext.rowsOf = rowsOf;
    fences.push(...(window.tides.game?.scenery(put, sceneContext) ?? []));
    const doing = clawd.draw({ put, pix, rowsOf, spot }, sun, t, sky, fences, window.tides.game?.mode === 'slide'
      ? (sceneId === window.tides.game.slide[window.tides.game.slide.pan ? 'to' : 'from'] ? window.tides.game.player : null) : undefined);

    return { ch, cl, pixels, doing, phase, d };
  }

  function draw(t) {
    const game = window.tides.game;
    game?.update(t);
    const active = game && game.mode !== 'ambient';
    let { ch, cl, pixels, doing, phase, d } = frame(t, active ? game.scene : 'home');
    if (game?.mode === 'slide') {
      const { from, to, direction, start } = game.slide;
      const f = Math.min(1, Math.max(0, (t - start) / 0.6));
      const eased = f * f * (3 - 2 * f);
      const left = { ch, cl, pixels }, right = frame(t, to);
      const shift = -direction * Math.round(L.cols * eased);
      ch = Array.from({ length: L.rows }, () => Array(L.cols).fill(' '));
      cl = Array.from({ length: L.rows }, () => Array(L.cols).fill(''));
      pixels = [];
      // A truck, not a pan: the sky is too far off to move, so sun, moon, stars, and clouds hold still while the shore slides past.
      const far = (k) => /^(sun|moon|star|cloud)\b/.test(k ?? '');
      for (let y = 0; y < L.rows; y++) for (let x = 0; x < L.cols; x++) if (far(left.cl[y][x])) { ch[y][x] = left.ch[y][x]; cl[y][x] = left.cl[y][x]; }
      for (const [part, offset] of [[left, shift], [right, shift + direction * L.cols]]) {
        for (let y = 0; y < L.rows; y++) for (let x = 0; x < L.cols; x++) {
          const c = x + offset;
          if (c < 0 || c >= L.cols || part.ch[y][x] === ' ' || far(part.cl[y][x])) continue;
          if (y >= L.clear.y0 && y < L.clear.y1 && c >= L.clear.x0 && c < L.clear.x1) continue; // behind the words
          ch[y][c] = part.ch[y][x]; cl[y][c] = part.cl[y][x];
        }
        pixels.push(...part.pixels.map((p) => ({ ...p, c: p.c + offset })));
      }
    }
    const { cols } = L;
    pre.innerHTML = ch.map((row, y) => {
      let out = '', run = '', k = cl[y][0];
      for (let x = 0; x <= cols; x++) {
        if (x === cols || cl[y][x] !== k) {
          out += k ? `<span class="${String(k).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])}">${run}</span>` : run;
          run = ''; k = cl[y][x];
        }
        if (x < cols) run += { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch[y][x]] ?? ch[y][x];
      }
      return out;
    }).join('\n');
    const css = getComputedStyle(document.documentElement);
    const colour = Object.fromEntries(Object.entries(INK).map(([k, v]) => [k, css.getPropertyValue(v).trim()]));
    pen.clearRect(0, 0, canvas.width, canvas.height);
    for (const { c, r, frame, unit, fade } of pixels) {
      const w = Math.max(...frame.map((row) => row.length)) * unit;
      const left = Math.round((c + 0.5) * L.cw * L.dpr - w / 2), bottom = Math.round((r + 1) * L.ch * L.dpr);
      pen.globalAlpha = fade;
      frame.forEach((row, j) => [...row].forEach((p, i) => {
        if (p === '.') return;
        pen.fillStyle = colour[p];
        pen.fillRect(left + i * unit, bottom - (frame.length - j) * unit, unit, unit);
      }));
    }
    pen.globalAlpha = 1;
    if (active) pen.clearRect(L.clear.x0 * L.cw * L.dpr, L.clear.y0 * L.ch * L.dpr, (L.clear.x1 - L.clear.x0) * L.cw * L.dpr, (L.clear.y1 - L.clear.y0) * L.ch * L.dpr);
    pre.setAttribute('aria-label', `A beach drawn in text, waves coming in, under a ${PHASES[Math.round(phase * 8) % 8]}.${tideWord(d.getTime())} ${doing}`);
  }

  const start = performance.now();
  const clock = () => (performance.now() - start) / 1000 + 4;
  layout();
  new ResizeObserver(() => { layout(); draw(clock()); }).observe(pre);
  setInterval(() => document.hidden || draw(clock()), 125); // the waves roll for everyone, Reduce Motion or not, on purpose
  draw(clock());
})();
