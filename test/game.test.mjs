import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import vm from 'node:vm';
import { checkAct } from '../lib/acts.mjs';

// Failures to exercise before implementation: accidental entry while typing, stuck keys, hidden-tab jumps,
// missing scenes, slide input, repeated pickups, unaffordable builds, absent acts, early spending, canceled
// builds, duplicate builds, unsafe saves, storage exceptions, nondeterministic or insufficient placement.
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const parts = json('src/parts.json');
const { machines, boat } = json('src/machines.json');
const sprites = json('src/sprites.json');
const actualActs = readdirSync('cutscenes').filter((f) => f.endsWith('.json')).sort();
const cutscenes = actualActs.map((file) => ({ id: file.slice(0, -5), ...json(`cutscenes/${file}`) }));
const worldData = { game: { parts, machines, boat }, cutscenes, sprites, acts: [] };
for (const { id, ...act } of cutscenes) assert.deepEqual(checkAct(id, act, sprites), [], id);
const duration = (act) => act.beats.reduce((n, beat) => n + beat.for, 0);
let atomic;

const source = readFileSync('src/game.js', 'utf8');
const checks = [];
function check(name, fn) { fn(); checks.push(name); }
function browser({ saved, world = worldData, missingScene = false, brokenStorage = false, day = 6 } = {}) {
  let time = 0, frame = 0, stored = saved, canceled = 0;
  const acts = [], nodes = [], events = new Map();
  function node(tagName = 'DIV') {
    const el = { tagName, textContent: '', hidden: false, attributes: {}, isContentEditable: false,
      setAttribute(k, v) { this.attributes[k] = v; }, append(...children) { nodes.push(...children); },
      addEventListener(type, fn) { const key = `${tagName}:${type}`; events.set(key, [...(events.get(key) ?? []), fn]); } };
    Object.defineProperty(el, 'innerHTML', { set() { throw Error('innerHTML is forbidden'); } });
    return el;
  }
  const document = node('DOCUMENT');
  document.body = node('BODY');
  document.hidden = false;
  document.createElement = (tag) => node(tag.toUpperCase());
  const data = node('SCRIPT'); data.textContent = JSON.stringify(world);
  document.getElementById = (id) => id === 'world' ? data : nodes.find((n) => n.id === id);
  const window = node('WINDOW');
  window.tides = { now: () => new Date(2026, 9, day, 12), skyOf: () => 'day',
    scenes: { home: {}, ...(missingScene ? {} : { monterey: {} }) } };
  const storage = { getItem() { if (brokenStorage) throw Error('blocked'); return stored ?? null; },
    setItem(key, value) { assert.equal(key, 'tides.game.v1'); if (brokenStorage) throw Error('full'); stored = value; } };
  const context = vm.createContext({ window, document, localStorage: storage,
    performance: { now: () => time * 1000 }, location: { search: '' }, URLSearchParams, Date, Math, JSON, console });
  vm.runInContext(readFileSync('src/clawd.js', 'utf8'), context);
  const { playAct, cancelAct } = window.tides.clawd;
  window.tides.clawd.playAct = (act, from) => { acts.push({ act, from: { ...from } }); return playAct(act, from); };
  window.tides.clawd.cancelAct = () => { canceled++; cancelAct(); };
  vm.runInContext(source, context);
  const game = window.tides.game;
  const emit = (surface, type, options = {}) => {
    const e = { key: '', target: node(), preventDefault() { this.prevented = true; }, ...options };
    for (const fn of events.get(`${surface}:${type}`) ?? []) fn(e);
    return e;
  };
  const key = (value, options) => emit('WINDOW', 'keydown', { key: value, ...options });
  const up = (value) => emit('WINDOW', 'keyup', { key: value });
  const tick = (seconds = 0.125) => {
    time += seconds; frame += seconds; game.update(frame);
    if (game.mode === 'cutscene') window.tides.clawd.draw({
      put() {}, pix(c, r, art) { assert.ok(art.some((row) => row.includes('#')), 'real Clawd frame'); },
      rowsOf: () => 3, spot: (x, y) => ({ c: Math.round(x * 100), r: Math.round(y * 30) }),
    }, { rise: 6, set: 18 }, frame, 'day');
  };
  const advance = (seconds) => { for (let n = 0; n < Math.ceil(seconds / 0.125); n++) tick(); };
  const start = () => { key('d'); up('d'); tick(); };
  const walkTo = (x, y) => {
    for (const [axis, goal, positive, negative] of [['y', y, 's', 'w'], ['x', x, 'd', 'a']]) {
      let count = 0;
      while (Math.abs(game.player[axis] - goal) > 0.026) {
        const k = game.player[axis] < goal ? positive : negative;
        key(k); tick(); up(k);
        assert.ok(++count < 100, `reaches ${axis}=${goal}`);
      }
    }
  };
  return { game, key, up, tick, advance, start, walkTo, acts, nodes, emit, document,
    get saved() { return stored; }, get time() { return time; }, get canceled() { return canceled; } };
}
const plain = (v) => JSON.parse(JSON.stringify(v));

check('secret entry, safe typing, exact announcement and complete exit', () => {
  const b = browser();
  assert.equal(b.game.mode, 'ambient');
  assert.equal(b.nodes.find((n) => n.id === 'game-hud').hidden, true);
  for (const options of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true },
    { target: { tagName: 'INPUT' } }, { target: { tagName: 'TEXTAREA' } }, { target: { tagName: 'SELECT' } }, { target: { isContentEditable: true } }]) b.key('w', options);
  b.key('e'); b.key('q');
  assert.equal(b.game.mode, 'ambient');
  assert.equal(b.key('ArrowRight').prevented, true);
  assert.equal(b.game.mode, 'play');
  const live = b.nodes.find((n) => n.id === 'game-live');
  assert.equal(live.attributes['aria-live'], 'polite');
  assert.equal(live.textContent, 'You are walking Clawd. Escape to stop.');
  assert.equal(b.nodes.find((n) => n.id === 'game-hud').hidden, false);
  assert.doesNotMatch(b.nodes.find((n) => n.id === 'game-hud').textContent, /\?/); // no boat before the first machine
  b.key('Escape', { ctrlKey: true, target: { tagName: 'INPUT' } });
  assert.equal(b.game.mode, 'ambient');
  assert.equal(b.game.scene, 'home');
  assert.equal(b.nodes.find((n) => n.id === 'game-hud').hidden, true);
  b.advance(1); assert.equal(b.game.player.moving, false);
});

check('movement speed, facing, diagonal speed, clamp and clock discontinuity', () => {
  const b = browser(); b.start();
  const x = b.game.player.x; b.key('d'); b.advance(1); b.up('d');
  assert.ok(Math.abs(b.game.player.x - x - 0.25) < 0.001);
  b.key('a'); b.advance(0.5); b.up('a'); assert.equal(b.game.player.facing, 'left');
  const p = { ...b.game.player }; b.key('a'); b.key('w'); b.advance(0.5); b.up('a'); b.up('w');
  assert.ok(Math.abs(Math.hypot(b.game.player.x - p.x, b.game.player.y - p.y) - 0.125) < 0.001);
  b.key('w'); b.advance(10); b.up('w'); assert.equal(b.game.player.y, -1.4); // out past the surf, swimming
  b.key('s'); b.advance(10); b.up('s'); assert.equal(b.game.player.y, 1);
  b.key('a'); b.advance(10); b.up('a'); assert.equal(b.game.player.x, 0);
  b.key('d'); const before = b.game.player.x; b.tick(1000); b.up('d');
  assert.ok(b.game.player.x - before <= 0.03126);
  b.tick(); assert.equal(b.game.player.moving, false);
});

check('blur and visibility clear movement keys', () => {
  for (const surface of ['blur', 'visibility']) {
    const b = browser(); b.start(); b.key('a'); b.tick();
    if (surface === 'blur') b.emit('WINDOW', 'blur');
    else { b.document.hidden = true; b.emit('DOCUMENT', 'visibilitychange'); }
    const x = b.game.player.x; b.advance(2); assert.equal(b.game.player.x, x);
  }
});

check('two scene edges, horizontal slide, paused input and safe missing scene', () => {
  const b = browser(); b.start(); b.key('d');
  while (b.game.mode === 'play') b.tick();
  b.up('d'); assert.equal(b.game.mode, 'slide');
  assert.equal(b.game.slide.from, 'home'); assert.equal(b.game.slide.to, 'monterey'); assert.equal(b.game.slide.direction, 1);
  const p = plain(b.game.player); b.key('w'); b.advance(0.5); assert.deepEqual(plain(b.game.player), p);
  b.advance(0.125); assert.equal(b.game.mode, 'play'); assert.equal(b.game.scene, 'monterey'); assert.equal(b.game.player.x, 0);
  b.tick(); assert.equal(b.game.player.y, p.y);
  b.key('a'); b.tick(); b.up('a'); assert.equal(b.game.mode, 'slide');
  assert.equal(b.game.slide.direction, -1); b.advance(0.625); assert.equal(b.game.scene, 'home'); assert.equal(b.game.player.x, 1);
  b.key('Escape'); assert.equal(b.game.mode, 'ambient'); assert.equal(b.game.scene, 'home');
  const missing = browser({ missingScene: true }); missing.start(); missing.key('d'); missing.advance(4);
  assert.equal(missing.game.mode, 'play'); assert.equal(missing.game.scene, 'home'); assert.equal(missing.game.player.x, 1);
  assert.match(missing.nodes.find((n) => n.id === 'game-live').textContent, /Monterey/);
});

check('daily placement is deterministic, sufficient and mostly Monterey', () => {
  const a = browser(), b = browser(), next = browser({ day: 7 });
  assert.deepEqual(plain(a.game.items), plain(b.game.items));
  assert.notDeepEqual(plain(a.game.items), plain(next.game.items));
  assert.ok(a.game.items.filter((p) => p.scene === 'home').length <= 4);
  assert.ok(a.game.items.filter((p) => p.scene === 'monterey').length > a.game.items.length / 2);
  for (const part of parts) {
    const needed = machines.reduce((n, m) => n + (m.recipe[part.id] ?? 0), 0);
    assert.ok(a.game.items.filter((p) => p.part.id === part.id).length >= Math.max(1, needed));
  }
});

check('walking, rendering, pickup once, floating text, save and two builds under three minutes', () => {
  const b = browser(); b.start();
  let picked = 0;
  const collect = (item) => {
    const before = b.game.save.parts[item.part.id] ?? 0;
    b.walkTo(item.x, item.y); b.tick();
    assert.equal(item.taken, true);
    assert.ok(b.game.save.parts[item.part.id] >= before + 1);
    const count = b.game.save.parts[item.part.id]; b.advance(0.25); assert.equal(b.game.save.parts[item.part.id], count);
    const text = [];
    const scenery = b.game.scenery((x, y, ch) => text.push(ch), { spot: (x, y) => ({ c: Math.round(x * 100), r: Math.round(y * 30) }), rowsOf: () => 3 });
    scenery.sort((a, z) => a.r - z.r).forEach((s) => s.fn());
    assert.match(text.join(''), /\+ /);
    picked++;
  };
  collect(b.game.items.find((i) => i.scene === 'home'));
  b.key('d'); while (b.game.mode === 'play') b.tick(); b.up('d'); b.advance(0.625);
  for (const part of ['driftwood', 'pebble', 'gear', 'kelp']) {
    while ((b.game.save.parts[part] ?? 0) < (part === 'driftwood' ? 2 : 1)) collect(b.game.items.find((i) => i.scene === 'monterey' && i.part.id === part && !i.taken));
  }
  while (picked < 6) collect(b.game.items.find((i) => i.scene === 'monterey' && !i.taken));
  const before = plain(b.game.save.parts); b.key('e');
  assert.equal(b.game.mode, 'cutscene'); assert.equal(b.acts[0].act.id, 'build-lever');
  assert.deepEqual(plain(b.game.save.parts), before);
  b.key('w'); b.key('e'); const p = plain(b.game.player); b.advance(Math.floor(duration(b.acts[0].act) / 0.125) * 0.125);
  assert.deepEqual(plain(b.game.player), p); assert.equal(b.game.save.built.length, 0);
  b.advance(0.125); assert.equal(b.game.mode, 'play'); assert.deepEqual(plain(b.game.save.built), ['lever']);
  assert.equal(b.game.save.parts.driftwood, before.driftwood - 1); assert.equal(b.game.save.parts.pebble, before.pebble - 1);
  b.tick(); assert.equal(b.game.player.y, p.y);
  b.key('e'); assert.equal(b.acts[1].act.id, 'build-wheel-and-axle'); b.advance(duration(b.acts[1].act));
  assert.deepEqual(plain(b.game.save.built), ['lever', 'wheel-and-axle']);
  const collected = b.game.items.filter((item) => item.taken).length;
  assert.ok(collected >= 6);
  assert.ok(b.time < 180, `six pickups and two machines in ${b.time}s`);
  atomic = { date: '2026-10-06', collected, built: plain(b.game.save.built), seconds: b.time,
    cutscenes: b.acts.map(({ act }) => ({ id: act.id, seconds: duration(act) })) };
  assert.match(b.nodes.find((n) => n.id === 'game-hud').textContent, /lever/);
  assert.match(b.nodes.find((n) => n.id === 'game-hud').textContent, /\?/);
  const reloaded = browser({ saved: b.saved }); assert.deepEqual(plain(reloaded.game.save), plain(b.game.save));
});

check('affordability, unavailable acts, repeats and cancellation never spend', () => {
  const empty = browser(); empty.start(); empty.key('e'); assert.equal(empty.game.mode, 'play'); assert.equal(empty.acts.length, 0);
  const saved = JSON.stringify({ parts: { driftwood: 3, pebble: 3 }, built: [] });
  const b = browser({ saved }); b.start(); b.key('e', { repeat: true }); assert.equal(b.acts.length, 0);
  b.key('e'); b.advance(2); b.key('Escape'); b.advance(20);
  assert.equal(b.game.mode, 'ambient'); assert.deepEqual(plain(b.game.save), { parts: { driftwood: 3, pebble: 3 }, built: [] }); assert.ok(b.canceled > 0);
  const missing = browser({ saved, world: { ...worldData, cutscenes: [] } }); missing.start(); missing.key('e');
  assert.equal(missing.game.mode, 'play'); assert.deepEqual(plain(missing.game.save), { parts: { driftwood: 3, pebble: 3 }, built: [] });
  const built = browser({ saved: JSON.stringify({ parts: { driftwood: 1, pebble: 1 }, built: ['lever'] }) }); built.start(); built.key('e'); assert.equal(built.acts.length, 0);
});

check('all six real cutscenes render and spend their recipes once', () => {
  const b = browser({ saved: JSON.stringify({ parts: Object.fromEntries(parts.map((p) => [p.id, 99])), built: [] }) });
  b.start();
  for (const machine of machines) {
    const before = plain(b.game.save.parts);
    b.key('e');
    assert.equal(b.game.mode, 'cutscene');
    assert.equal(b.acts.at(-1).act.id, `build-${machine.id}`);
    b.advance(duration(b.acts.at(-1).act));
    assert.equal(b.game.mode, 'play');
    for (const [id, n] of Object.entries(machine.recipe)) assert.equal(b.game.save.parts[id], before[id] - n);
  }
  assert.deepEqual(plain(b.game.save.built), ['lever', 'wheel-and-axle', 'pulley', 'inclined-plane', 'wedge', 'screw']);
  b.key('e'); assert.equal(b.acts.length, 6);
});

check('external storage validates ids, types, counts and prototype keys', () => {
  for (const saved of ['garbage', 'null', '[]', '1', '{}', '{"parts":[],"built":[]}', '{"parts":{},"built":{}}']) {
    const b = browser({ saved }); assert.deepEqual(plain(b.game.save), { parts: {}, built: [] });
    assert.equal(Object.getPrototypeOf(b.game.save.parts), null);
  }
  const b = browser({ saved: '{"parts":{"rope":2,"driftwood":-1,"pebble":1.5,"gear":100,"shell":"1","cork":99,"plank":1e99,"unknown":2,"__proto__":3,"constructor":4},"built":["lever","unknown","lever","__proto__",3,"screw"]}' });
  assert.deepEqual(plain(b.game.save), { parts: { rope: 2, cork: 99 }, built: ['lever', 'screw'] });
  assert.equal(Object.getPrototypeOf(b.game.save.parts), null);
  const full = browser({ saved: '{"parts":{"rope":99},"built":[]}' }); full.start();
  const item = full.game.items.find((i) => i.scene === 'home' && i.part.id === 'rope');
  if (item) { full.walkTo(item.x, item.y); full.tick(); assert.equal(full.game.save.parts.rope, 99); }
  const blocked = browser({ brokenStorage: true }); blocked.start(); const pick = blocked.game.items.find((i) => i.scene === 'home');
  blocked.walkTo(pick.x, pick.y); blocked.tick(); assert.ok(blocked.game.save.parts[pick.part.id] >= 1);
});

check('real renderer draws one Clawd across desktop and phone slides', () => {
  for (const width of [1440, 390]) {
    let draw, pixels = 0;
    const pen = { clearRect(x, y) { if (x === 0 && y === 0) pixels = 0; }, fillRect() { pixels++; } };
    const pre = { append() {}, after() {}, setAttribute() {}, getBoundingClientRect() { return { width, height: 900, left: 0, top: 0 }; } };
    const words = { getBoundingClientRect() { return width > 500 ? { left: 86, right: 566, top: 570, bottom: 830 } : { left: 20, right: 370, top: 500, bottom: 830 }; } };
    const document = { hidden: false, documentElement: {},
      getElementById(id) { return { beach: pre, words, world: { textContent: JSON.stringify({ ...worldData, sprites, acts: [] }) } }[id]; },
      createElement(tag) { return tag === 'canvas' ? { getContext() { return pen; }, setAttribute() {} } : { getBoundingClientRect() { return { width: 320 }; }, remove() {} }; } };
    const game = { mode: 'play', scene: 'home', player: { x: 1, y: 0.7, facing: 'right', moving: false }, update() {}, scenery() { return []; } };
    const tides = { game, now: () => new Date(2026, 9, 6, 12), skyOf: () => 'day', skyAt: () => 'day', moonPhase: () => 0.5,
      sunTimes: () => ({ hour: 12, rise: 6, set: 18 }) };
    const context = vm.createContext({ window: { tides }, document, location: { search: '' }, URLSearchParams, Date, Math,
      performance: { now: () => 1000 }, devicePixelRatio: 1,
      getComputedStyle() { return { lineHeight: '18.75', getPropertyValue(k) { return k; } }; },
      ResizeObserver: class { observe() {} }, setInterval(fn) { draw = fn; } });
    for (const file of ['src/clawd.js', 'src/monterey.js', 'src/beach.js']) vm.runInContext(readFileSync(file, 'utf8'), context, { filename: file });
    draw(); assert.equal(pixels, 256, 'controlled Clawd is rendered');
    for (const direction of [1, -1]) {
      game.mode = 'slide'; game.scene = direction > 0 ? 'home' : 'monterey';
      game.slide = { from: game.scene, to: direction > 0 ? 'monterey' : 'home', direction, start: 3.7 };
      draw(); assert.equal(pixels, 256, 'slide does not render a second Clawd');
    }
  }
});

mkdirSync('runs', { recursive: true });
const evidence = join('runs', 'game-test-evidence.json');
writeFileSync(evidence, JSON.stringify({ command: 'node test/game.test.mjs', checks, atomic, actualCutscenes: actualActs,
  sources: Object.fromEntries(['src/game.js', 'src/beach.js', 'src/clawd.js', 'src/monterey.js', 'src/sprites.json', 'src/parts.json', 'src/machines.json', 'test/game.test.mjs', ...actualActs.map((f) => `cutscenes/${f}`)].map((f) => [f, createHash('sha256').update(readFileSync(f)).digest('hex')])) }, null, 2) + '\n');
console.log(`game: ${checks.length} browser-flow checks passed; evidence ${evidence}`);
