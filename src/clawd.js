// Clawd's life on the beach. The day is planned from the date, the way a desktop pet queues its steps,
// but laid out ahead of time: every reader sees the same Clawd at the same local hour, a reload never resets it,
// and an errand that takes three hours really takes three hours.
//   Each day Clawd builds one machine; the beach keeps the last four, and the tide takes the oldest.
//   In its free time Clawd plays acts: animations it writes for itself as data (acts/*.json, see ACTS.md).
// Add ?day=N to see another day of the progression, ?act=name to have Clawd play one act now.
(() => {
  const { now, skyOf } = window.tides;
  const { sprites: SPRITES, acts: ACTS } = JSON.parse(document.getElementById('world').textContent);
  const params = new URLSearchParams(location.search);
  const H = 3600, DAY = 86400;
  const EPOCH = new Date(2026, 9, 5); // Clawd's first day on the beach
  const SPEED = 0.005;                // beach widths a second, walking
  const CAMP = { x: 0.6, y: 0.95 }, SHORE = { x: 0.45, y: 0.02 };
  const SLOTS = [{ x: 0.2, y: 0.45 }, { x: 0.5, y: 0.75 }, { x: 0.74, y: 0.3 }, { x: 0.86, y: 0.85 }];

  // ---------- machines: one a day, in this order, then round again ----------

  const flip = (t, s) => Math.floor(t / s) % 2;
  const FIRE = [['  (  ', ' )\\( ', '(()()'], ['  )  ', ' (/) ', ')()()'], [' (   ', '  )\\ ', '()())'], ['   ) ', ' /( )', '(())(']];
  const SEESAW = [['         ====', '    =====    ', '==== /_\\     '], ['             ', '=============', '     /_\\     '],
                  ['====         ', '    =====    ', '     /_\\ ===='], ['             ', '=============', '     /_\\     ']];
  const LOW = [2, 1, 0, 1]; // which of the see-saw's three rows its left end sits on, per frame; the right end mirrors it
  const MACHINES = [
    { name: 'see-saw', w: 13, rows: (t, s) => SEESAW[s.using ? Math.floor(t / 0.5) % 4 : s.seated ? 2 : 0] },
    { name: 'pinwheel', w: 5, rows: (t, s) => [
      ...(flip(t, s.using ? 0.15 : 0.45) ? [' \\ / ', '  o  ', ' / \\ '] : ['  |  ', '--o--', '  |  ']), '  |  ', '  |  ', ' _|_ '] },
    { name: 'kite', w: 3, rows: () => [' | ', '_|_'], sky: true },
    { name: 'sundial', w: 7, rows: () => ['   |\\  ', '(__|_\\_)'], dial: true },
    { name: 'bell', w: 7, rows: (t, s) => ['._____.', '|  |  |', s.using && flip(t, 0.3) ? '|(_)  |' : s.using ? '|  (_)|' : '| (_) |', '|     |'] },
    { name: 'sail cart', w: 8, rows: (t, s) => ['   |\\   ', '   | \\  ', s.using && flip(t, 0.4) ? '   |__) ' : '   |__\\ ', ' o====o '] },
    { name: 'swing', w: 7, rows: (t, s) => {
      const f = s.using ? [0, 1, 2, 1][Math.floor(t / 0.45) % 4] : 1;
      return ['._____.', ['| /   |', '|  |  |', '|   \\ |'][f], ['|/    |', '|  |  |', '|    \\|'][f], ['|=+=  |', '| =+= |', '|  =+=|'][f], '|     |'];
    } },
    { name: 'telescope', w: 5, rows: () => ['    o', '   / ', '  /  ', ' /\\  ', '/  \\ '] },
    { name: 'flag', w: 4, rows: (t) => [flip(t, 0.6) ? '|>~ ' : '|~> ', '|   ', '|   ', '|   ', '|_  '] },
    { name: 'lighthouse', w: 5, rows: () => ['  ^  ', ' [#] ', ' |=| ', ' |=| ', '/___\\'], lamp: true },
  ];

  // ---------- acts ----------

  // Lays an act's beats out as keyframes per actor. Clawd starts where the act says, or where it already stands.
  function compile(act, from) {
    const sprites = { ...SPRITES, ...act.sprites, clawd: { ...SPRITES.clawd, poses: { ...SPRITES.clawd.poses, ...act.sprites?.clawd?.poses } } };
    const cast = { ...act.cast, clawd: { sprite: 'clawd', at: act.cast?.clawd?.at ?? [from.x, from.y], pose: 'idle' } };
    const actors = Object.fromEntries(Object.entries(cast).map(([name, c]) => {
      const sp = sprites[c.sprite];
      return [name, { sprite: sp, pos: { x: c.at[0], y: c.at[1] }, pose: c.pose ?? Object.keys(sp.poses)[0], show: !c.hidden, keys: [] }];
    }));
    let t = 0;
    for (const beat of act.beats) {
      for (const [name, a] of Object.entries(actors)) {
        const m = beat[name] ?? {};
        const to = m.to ? { x: m.to[0], y: m.to[1] } : a.pos;
        if (m.pose) a.pose = m.pose;
        if (m.show !== undefined) a.show = m.show;
        a.keys.push({ t0: t, t1: t + beat.for, from: a.pos, to, pose: a.pose, show: a.show, say: m.say, hop: m.hop ?? 0 });
        a.pos = to;
      }
      t += beat.for;
    }
    return { id: act.id, title: act.title, dur: t, actors, start: { x: cast.clawd.at[0], y: cast.clawd.at[1] }, end: actors.clawd.pos };
  }

  // ---------- the plan for a day ----------

  const rng = (seed) => () => {
    seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayIndex = (d) => params.has('day') ? Number(params.get('day')) : Math.round((midnight(d) - EPOCH) / 864e5);
  const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const onBeach = (k) => {
    const out = [];
    for (let i = Math.max(0, k - 3); i <= k; i++) out.push({ i, slot: SLOTS[i % 4], m: MACHINES[i % MACHINES.length] });
    return out;
  };
  const beside = (slot) => ({ x: Math.min(1, slot.x + 0.08), y: slot.y });

  const plans = new Map();
  function plan(k, sun, today) {
    if (plans.has(k)) return plans.get(k);
    const r = rng(k * 7919 + 1), steps = [], built = onBeach(k).filter((b) => b.i < k);
    let t = 0, at = CAMP;
    const add = (kind, dur, to = at, extra = {}) => {
      if (dur > 0) steps.push({ kind, t0: t, t1: t + dur, a: at, b: to, ...extra });
      t += Math.max(0, dur); at = to;
    };
    const walk = (to, extra) => add('walk', dist(at, to) / SPEED + 1, to, extra);
    const wander = () => {
      walk({ x: 0.04 + r() * 0.92, y: 0.08 + r() * 0.92 });
      if (r() < 0.6) add('dig', 20 + r() * 80); else add('look', 8 + r() * 30, at, { found: r() < 0.3 });
    };
    const play = () => {
      if (!built.length) return wander();
      const b = built[Math.floor(r() * built.length)];
      walk(beside(b.slot)); add('play', 90 + r() * 240, at, { i: b.i });
    };
    // An act Clawd wrote today comes up four times as often as the rest.
    const perform = () => {
      const sky = skyOf(t / H, sun);
      const pool = ACTS.filter((a) => (a.when ?? ['dawn', 'day', 'dusk']).includes(sky));
      const weight = (a) => (a.id.startsWith(today) ? 4 : 1);
      let pick = r() * pool.reduce((n, a) => n + weight(a), 0);
      const act = pool.find((a) => (pick -= weight(a)) < 0);
      if (!act) return wander();
      const c = compile(act, at);
      walk(c.start); add('act', c.dur, c.end, { act: c });
    };
    const until = (end, fill) => { while (t < end - 60) fill(); };

    add('sleep', sun.rise * H - 25 * 60 + r() * 900);
    walk(SHORE); add('sit', sun.rise * H + 45 * 60 - t); // watches the sun come up
    until((10 + r() * 1.5) * H, () => (r() < 0.45 ? perform : wander)());

    // Off to collect materials: off to the right, or along the water until the haze takes it.
    const gone = (r() < 0.2 ? 3.5 + r() * 1.5 : 1 + r() * 2) * H;
    if (r() < 0.55) { walk({ x: 1.2, y: 0.2 + r() * 0.6 }); add('away', gone); }
    else {
      walk({ x: 0.05 + r() * 0.3, y: 0.02 });
      add('fade', 50); add('away', gone); add('fade', 50, at, { back: true, carry: true });
    }

    if (k >= 0) {
      const site = beside(SLOTS[k % 4]), spells = 4 + Math.floor(r() * 3);
      walk(site, { carry: true });
      let work = 0;
      for (let s = 0; s < spells; s++) {
        const d = (20 + r() * 20) * 60;
        add('build', d, at, { p0: work, p1: work + d });
        work += d;
        if (s < spells - 1) { (r() < 0.5 ? play : perform)(); walk(site); }
      }
      for (const s of steps) if (s.kind === 'build') { s.p0 /= work; s.p1 /= work; }
    }
    until(sun.set * H - 40 * 60, () => { const x = r(); (x < 0.4 ? perform : x < 0.7 ? play : wander)(); });
    walk(SHORE); add('sit', sun.set * H + 40 * 60 - t); // watches it go down
    const scope = built.find((b) => b.m.name === 'telescope');
    if (scope) { walk(beside(scope.slot)); add('play', 22 * H - t, at, { i: scope.i }); }
    else until(21.5 * H, () => (r() < 0.3 ? perform : wander)());
    walk(CAMP); add('sleep', DAY - t);
    // ponytail: a very long errand can push the plan past midnight; Clawd then sleeps wherever the plan ended.
    plans.set(k, steps);
    return steps;
  }

  const stateAt = (steps, T) => steps.find((s) => T >= s.t0 && T < s.t1) ?? { kind: 'sleep', t0: 0, t1: DAY, a: steps.at(-1)?.b ?? CAMP, b: CAMP };
  const progress = (steps, T) => {
    let p = 0;
    for (const s of steps) if (s.kind === 'build') {
      if (T >= s.t1) p = s.p1;
      else if (T >= s.t0) p = s.p0 + (s.p1 - s.p0) * (T - s.t0) / (s.t1 - s.t0);
    }
    return p;
  };
  const frameOf = (pose, t) => pose.frames[Math.floor(t / pose.every) % pose.frames.length];

  // ?act=name: play that act now, from the middle of the beach, on a loop.
  const named = params.get('act') && ACTS.find((a) => a.id === params.get('act'));
  const shown = named && compile(named, { x: 0.5, y: 0.5 });
  const shownFrom = performance.now() / 1000;

  // ---------- drawing ----------

  // On the beach, x runs 0..1 left to right and y runs 0 (the water's edge) to 1 (the sea wall).
  //   put(col, row, char, cls)      text into the scene
  //   pix(col, row, frame, y, fade) a pixel sprite, feet centred on that cell, sized by how near it is
  //   rowsOf(frame, y)              how many text rows that pixel sprite covers
  //   spot(x, y) → {c, r}           beach coordinates to cells
  //   scenery: [{r, fn}]            things on the sand Clawd can walk behind
  function draw({ put, pix, rowsOf, spot }, sun, t, sky, scenery = []) {
    const d = now(), T = (d - midnight(d)) / 1000;
    const k = dayIndex(d), steps = plan(k, sun, dateKey(d));
    let st = stateAt(steps, T);
    if (shown) {
      const tt = (performance.now() / 1000 - shownFrom) % (shown.dur + 3);
      st = tt < shown.dur ? { kind: 'act', act: shown, t0: T - tt, t1: T - tt + shown.dur }
        : { kind: 'look', t0: T, t1: T + 1, a: shown.end, b: shown.end };
    }
    const back = steps.find((s) => s.carry && s.kind === 'walk'); // the walk home with materials
    const art = (c, r, rows, cls, stage = 1) => {
      const show = Math.ceil(stage * rows.length);
      rows.forEach((row, j) => j >= rows.length - show && [...row].forEach((ch, i) => ch !== ' ' && put(c + i, r - rows.length + 1 + j, ch, cls)));
    };
    const sprites = [...scenery]; // drawn back to front with Clawd and the machines
    // The see-saw needs two: a passerby wanders over, they ride, and it goes on its way before Clawd gets up.
    const seesaw = st.kind === 'play' && MACHINES[st.i % MACHINES.length].name === 'see-saw' ? SLOTS[st.i % 4] : null;
    const company = seesaw ? Math.min(T - st.t0, st.t1 - T) / 20 : 0; // 0..1 while it walks over or away, then more

    for (const b of onBeach(k)) {
      const today = b.i === k;
      const stage = today ? progress(steps, T) : 1;
      const p = spot(b.slot.x, b.slot.y), c = p.c - Math.floor(b.m.w / 2);
      const using = st.kind === 'play' && st.i === b.i;
      sprites.push({ r: p.r, fn: () => {
        if (today && back && T >= back.t1 && stage < 1) art(c - 1, p.r, ['▬▬▬', '▬▬▬▬'], 'wood'); // the pile of materials
        if (stage <= 0) return;
        art(c, p.r, b.m.rows(t, { using: using && stage >= 1 && (!seesaw || company >= 1), seated: using, sky }), 'machine', stage);
        if (b.m.lamp && stage >= 1 && sky === 'night' && flip(t, 1.2)) put(c + 2, p.r - 4, '*', 'lamp');
        if (b.m.sky && stage >= 1 && sky !== 'night') {
          const kx = c + 12 + Math.round(2 * Math.sin(t * 0.7)), ky = Math.max(2, p.r - 14) + Math.round(Math.sin(t * 1.1));
          for (let s = 1; s < 12; s++) put(Math.round(c + 1 + (kx - c - 1) * s / 12), Math.round(p.r - 2 + (ky + 4 - p.r) * s / 12), '.', 'string');
          art(kx - 1, ky + 1, ['/\\', '\\/'], 'kite');
          put(kx, ky + 2, flip(t, 0.4) ? '~' : 's', 'kite');
        }
        if (b.m.dial && stage >= 1 && sky !== 'night') {
          const f = (T / H - sun.rise) / (sun.set - sun.rise), len = Math.max(1, Math.round(6 * Math.abs(f - 0.5)));
          for (let s = 1; s <= len; s++) put(c + 3 + (f < 0.5 ? s : -s), p.r, '=', 'shadow');
        }
      } });
    }

    // Footprints fade behind a walking Clawd.
    for (let n = 1; n <= 40 && !shown; n++) {
      const s = stateAt(steps, T - n * 12);
      if (s.kind !== 'walk' && s.kind !== 'fade') continue;
      const f = Math.min(1, (T - n * 12 - s.t0) / (s.t1 - s.t0)), x = s.a.x + (s.b.x - s.a.x) * f, y = s.a.y + (s.b.y - s.a.y) * f;
      if (x < 0 || x > 1) continue;
      const p = spot(x, y);
      put(p.c, p.r, n % 2 ? '.' : ':', `print p${Math.min(4, Math.floor(n / 10))}`);
    }

    // Any actor: a pixel sprite (Clawd) or a text sprite, with an optional word above it.
    const actor = (sprite, pose, x, y, tt, { hop = 0, say, fade = 1 } = {}) => {
      const p = spot(x, y), frame = frameOf(sprite.poses[pose], tt), r = p.r - Math.round(hop);
      const tall = sprite.kind === 'pixels' ? rowsOf(frame, y) : frame.length;
      sprites.push({ r: p.r, fn: () => {
        if (sprite.kind === 'pixels') pix(p.c, r, frame, y, fade);
        else art(p.c - Math.floor(Math.max(...frame.map((row) => row.length)) / 2), r, frame, `act c-${sprite.color ?? 'ink'}`);
        if (say) [...say].forEach((ch, i) => put(p.c - Math.floor(say.length / 2) + i, r - tall - 1, ch, 'say'));
      } });
    };

    if (st.kind === 'act') {
      const tt = T - st.t0;
      for (const a of Object.values(st.act.actors)) {
        const key = a.keys.find((kf) => tt < kf.t1) ?? a.keys.at(-1);
        if (!key.show) continue;
        const f = Math.min(1, (tt - key.t0) / (key.t1 - key.t0));
        actor(a.sprite, key.pose, key.from.x + (key.to.x - key.from.x) * f, key.from.y + (key.to.y - key.from.y) * f, tt,
          { hop: key.hop * Math.sin(Math.PI * f), say: key.say });
      }
    } else if (st.kind !== 'away') {
      const f = (T - st.t0) / (st.t1 - st.t0);
      const at = st.kind === 'walk' ? { x: st.a.x + (st.b.x - st.a.x) * f, y: st.a.y + (st.b.y - st.a.y) * f } : st.a;
      const moving = st.kind === 'walk' || st.kind === 'fade';
      const pose = moving ? (st.carry ? 'carry' : 'walk')
        : { sleep: 'sleep', sit: 'sit', dig: 'dig', build: 'dig', look: 'idle', play: 'idle' }[st.kind];
      const fade = st.kind === 'fade' ? (st.back ? f : 1 - f) : 1;
      if (seesaw) {
        const f = company >= 1 ? Math.floor(t / 0.5) % 4 : 2, col = 1 / (spot(1, seesaw.y).c - spot(0, seesaw.y).c);
        const end = (side, row) => ({ x: seesaw.x + side * 4.5 * col, hop: 3 - row }); // sitting on that end of the plank
        const mine = end(1, 2 - LOW[f]), theirs = end(-1, LOW[f]);
        actor(SPRITES.clawd, 'sit', mine.x, seesaw.y, t, { hop: mine.hop - 1 }); // pixels sit on the plank's own row, text above it
        if (company < 1) actor(SPRITES.human, 'walk', -0.1 + (theirs.x + 0.1) * company, seesaw.y, t);
        else actor(SPRITES.human, LOW[f] === 0 ? 'cheer' : 'sit', theirs.x, seesaw.y, t, { hop: theirs.hop });
      } else actor(SPRITES.clawd, pose, at.x, at.y, t, { fade, say: st.kind === 'look' && st.found && T - st.t0 < 3 ? '!' : undefined });
      if (st.kind === 'build' && flip(t, 0.3)) { const p = spot(at.x, at.y); put(p.c - 5, p.r - 1, '*', 'spark'); }
      if (st.kind === 'sleep') { // a small fire keeps it company through the night
        const p = spot(at.x + 0.09, at.y), n = Math.floor(t * 5);
        sprites.push({ r: p.r, fn: () => {
          art(p.c - 2, p.r - 1, FIRE[n % FIRE.length], 'fire');
          art(p.c - 2, p.r, ['=/\\='], 'wood');
          const rise = (t * 2) % 4; // an ember drifts up and goes out
          if (rise < 3) put(p.c + Math.round(Math.sin(t * 3 + n)), p.r - 4 - Math.floor(rise), rise < 2 ? '*' : '.', 'ember');
        } });
      }
    }

    sprites.sort((a, b) => a.r - b.r).forEach((s) => s.fn());

    if (st.kind === 'act') return `Clawd ${st.act.title}.`;
    return `Clawd ${{
      sleep: 'is asleep on the sand', sit: 'sits at the water’s edge, watching the sun',
      walk: st.carry ? 'carries an armful of driftwood' : 'wanders along the beach', dig: 'digs in the sand',
      look: 'looks at something it found', away: 'is away collecting materials', fade: 'walks along the water',
      build: `is building a ${MACHINES[k % MACHINES.length].name}`, play: company >= 1 ? 'rides the see-saw with someone passing by' : `plays with its ${MACHINES[(st.i ?? 0) % MACHINES.length].name}`,
    }[st.kind]}.`;
  }

  window.tides.clawd = { draw };
})();
