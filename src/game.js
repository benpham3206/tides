(() => {
  const tides = window.tides;
  const world = JSON.parse(document.getElementById('world').textContent);
  const { parts = [], machines = [], boat } = world.game ?? {};
  const partIds = new Set(parts.map((p) => p.id)), machineIds = new Set(machines.map((m) => m.id));
  const keys = new Set(), directions = { w: [0, -1], arrowup: [0, -1], s: [0, 1], arrowdown: [0, 1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] };
  const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const safeId = (id) => /^[a-z][a-z0-9-]*$/.test(id) && !['constructor', 'prototype', '__proto__'].includes(id);
  const fresh = () => ({ parts: Object.create(null), built: [] });
  let save = fresh();
  try {
    const data = JSON.parse(localStorage.getItem('tides.game.v1'));
    if (object(data) && object(data.parts) && Array.isArray(data.built)) {
      for (const [id, n] of Object.entries(data.parts))
        if (safeId(id) && partIds.has(id) && Number.isInteger(n) && n >= 0 && n <= 99) save.parts[id] = n;
      save.built = [...new Set(data.built.filter((id) => typeof id === 'string' && safeId(id) && machineIds.has(id)))];
    }
  } catch {}

  const hud = document.createElement('div');
  hud.id = 'game-hud'; hud.className = 'game-hud'; hud.hidden = true;
  hud.tabIndex = 0; hud.setAttribute('aria-label', 'Parts, built machines, and the future boat.');
  const live = document.createElement('div');
  live.id = 'game-live'; live.className = 'game-live'; live.setAttribute('aria-live', 'polite');
  document.body.append(hud, live);
  const announce = (text) => { live.textContent = text; };
  const refresh = () => {
    const inventory = parts.filter((p) => save.parts[p.id]).map((p) => `${p.name} ${save.parts[p.id]}`).join(', ') || 'empty';
    const collection = machines.filter((m) => save.built.includes(m.id)).map((m) => m.name).join(', ') || 'none';
    hud.textContent = `${inventory} · ${collection}\n${boat?.art?.length ? boat.art.join('\n') : '? boat'}`;
  };
  const persist = () => { try { localStorage.setItem('tides.game.v1', JSON.stringify(save)); } catch {} refresh(); };
  refresh();

  const date = tides.now();
  let seed = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const items = [];
  let slot = 0;
  for (const [i, part] of parts.entries()) {
    const needed = machines.reduce((n, m) => n + (m.recipe[part.id] ?? 0), 0);
    for (let j = 0; j < Math.max(3, needed); j++) {
      const home = i < 3 && j === 0, n = home ? i : slot++;
      items.push({ id: `${part.id}-${j}`, part, scene: home ? 'home' : 'monterey', taken: false,
        x: (home ? 0.3 + n * 0.2 : 0.12 + (n % 6) * 0.14) + (random() - 0.5) * 0.025,
        y: (home ? 0.7 : 0.2 + (Math.floor(n / 6) % 5) * 0.14) + (random() - 0.5) * 0.025 });
    }
  }
  // ponytail: pickups last for this page session; persist consumed placements if repeat visits need scarcity.
  const game = tides.game = { mode: 'ambient', scene: 'home', player: { x: 0.6, y: 0.75, facing: 'right', moving: false }, save, items, slide: null, update, scenery };
  let last = null, pending = null, floating = null;
  const clear = () => { keys.clear(); game.player.moving = false; };
  function exit() {
    clear(); pending = null; floating = null; game.slide = null;
    game.mode = 'ambient'; game.scene = 'home'; hud.hidden = true;
    game.player.x = 0.6; game.player.y = 0.75; last = null;
    tides.clawd?.cancelAct(); announce('Clawd is back to his day.');
  }
  function build() {
    const machine = machines.find((m) => !save.built.includes(m.id)
      && (world.cutscenes ?? []).some((a) => a.id === `build-${m.id}`)
      && Object.entries(m.recipe).every(([id, n]) => (save.parts[id] ?? 0) >= n));
    if (!machine) { announce('Collect more parts to build a machine.'); return; }
    const act = world.cutscenes.find((a) => a.id === `build-${machine.id}`);
    const duration = act.beats.reduce((n, b) => n + b.for, 0);
    if (duration < 6 || duration > 12 || !tides.clawd?.playAct) return;
    tides.clawd.playAct(act, game.player);
    pending = { machine, end: performance.now() / 1000 + duration };
    clear(); game.mode = 'cutscene'; announce(`Building ${machine.name}.`);
  }
  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (key === 'escape' && game.mode !== 'ambient') { event.preventDefault(); exit(); return; }
    const target = event.target;
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return;
    if (!Object.hasOwn(directions, key) && key !== 'e') return;
    if (game.mode === 'ambient') {
      if (key === 'e') return;
      game.mode = 'play'; hud.hidden = false; last = null;
      announce('You are walking Clawd. Escape to stop.');
    }
    event.preventDefault();
    if (game.mode !== 'play') return;
    if (key === 'e') { if (!event.repeat) build(); }
    else keys.add(key);
  });
  window.addEventListener('keyup', (event) => { keys.delete(event.key.toLowerCase()); });
  window.addEventListener('blur', clear);
  document.addEventListener('visibilitychange', () => { clear(); last = null; });

  function update(t) {
    const dt = last === null ? 0 : Math.max(0, Math.min(0.125, t - last));
    last = t;
    if (game.mode === 'ambient') return;
    if (game.mode === 'slide') {
      if (t - game.slide.start >= 0.6) {
        game.scene = game.slide.to; game.player.x = game.slide.direction > 0 ? 0 : 1;
        game.slide = null; game.mode = 'play'; clear();
      }
      return;
    }
    if (game.mode === 'cutscene') {
      if (performance.now() / 1000 >= pending.end) {
        const m = pending.machine;
        for (const [id, n] of Object.entries(m.recipe)) save.parts[id] -= n;
        save.built.push(m.id); pending = null; game.mode = 'play';
        tides.clawd.cancelAct(); clear(); persist(); announce(`Built ${m.name}.`);
      }
      return;
    }
    let dx = 0, dy = 0;
    for (const key of keys) { dx += directions[key][0]; dy += directions[key][1]; }
    const length = Math.hypot(dx, dy), p = game.player;
    p.moving = length > 0;
    if (dx) p.facing = dx < 0 ? 'left' : 'right';
    if (length) { p.x += dx / length * 0.25 * dt; p.y += dy / length * 0.25 * dt; }
    p.y = Math.max(-0.3, Math.min(1, p.y));
    const to = game.scene === 'home' && p.x > 1 ? 'monterey' : game.scene === 'monterey' && p.x < 0 ? 'home' : null;
    p.x = Math.max(0, Math.min(1, p.x));
    if (to) {
      if (tides.scenes?.[to]) {
        game.slide = { from: game.scene, to, direction: to === 'monterey' ? 1 : -1, start: t };
        game.mode = 'slide'; clear();
      } else announce('Monterey is not available yet.');
      return;
    }
    for (const item of items) {
      if (item.taken || item.scene !== game.scene || Math.hypot(p.x - item.x, p.y - item.y) > 0.065) continue;
      item.taken = true; save.parts[item.part.id] = Math.min(99, (save.parts[item.part.id] ?? 0) + 1);
      floating = { text: `+ ${item.part.name}`, end: t + 1.8 }; persist(); announce(floating.text);
    }
    if (floating && t >= floating.end) floating = null;
  }
  function scenery(put, c) {
    if (game.mode === 'ambient') return [];
    const scene = c.sceneId ?? game.scene, out = [];
    for (const item of items) {
      if (item.taken || item.scene !== scene) continue;
      const p = c.spot(item.x, item.y), art = item.part.art;
      out.push({ r: p.r, fn: () => art.forEach((row, j) => [...row].forEach((ch, i) => ch !== ' ' && put(p.c - Math.floor(row.length / 2) + i, p.r - art.length + 1 + j, ch, `c-${item.part.color}`))) });
    }
    if (floating && scene === game.scene && game.mode === 'play') {
      const p = c.spot(game.player.x, game.player.y), text = floating.text;
      const height = c.rowsOf ? c.rowsOf(world.sprites?.clawd?.poses?.idle?.frames?.[0] ?? ['#'], game.player.y) : 3;
      out.push({ r: p.r, fn: () => [...text].forEach((ch, i) => put(p.c - Math.floor(text.length / 2) + i, p.r - height - 1, ch, 'c-ink')) });
    }
    return out;
  }
})();
