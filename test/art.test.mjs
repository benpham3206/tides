import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { checkAct, COLORS } from '../lib/acts.mjs';

// Failure cases: malformed/oversized art, unknown recipe parts, missing or invalid
// acts, instant reveals without assembly, clipping on phones, and a steady lamp.
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const parts = json('src/parts.json');
const { machines, boat } = json('src/machines.json');
const builtins = json('src/sprites.json');
const ascii = /^[\x20-\x7e]*$/;
const art = (rows, width, height) => {
  assert.ok(Array.isArray(rows) && rows.length >= 1 && rows.length <= height);
  assert.ok(rows.every((row) => typeof row === 'string' && row.length <= width && ascii.test(row)));
  assert.ok(rows.some((row) => row.trim().length), 'art has visible marks');
};
const ids = (items) => {
  assert.equal(new Set(items.map((item) => item.id)).size, items.length);
  for (const item of items) {
    assert.match(item.id, /^[a-z][a-z0-9-]{0,23}$/);
    assert.equal(typeof item.name, 'string');
    assert.ok(item.name.length > 0 && ascii.test(item.name));
  }
};
assert.equal(parts.length, 8);
ids(parts);
for (const part of parts) {
  assert.deepEqual(Object.keys(part).sort(), ['art', 'color', 'id', 'name']);
  assert.ok(COLORS.includes(part.color));
  art(part.art, 3, 2);
}
assert.equal(machines.length, 6);
ids(machines);
assert.deepEqual(machines.map((m) => m.id).sort(),
  ['inclined-plane', 'lever', 'pulley', 'screw', 'wedge', 'wheel-and-axle']);
art(boat.art, 12, 5);
assert.ok(boat.art.join('').includes('?'), 'the long-term goal stays a question');
assert.deepEqual(readdirSync('cutscenes').sort(), machines.map((m) => `build-${m.id}.json`).sort());

for (const machine of machines) {
  assert.deepEqual(Object.keys(machine).sort(), ['art', 'id', 'name', 'recipe']);
  art(machine.art, 12, 5);
  const recipe = Object.entries(machine.recipe);
  assert.ok(recipe.length >= 2 && recipe.length <= 3);
  for (const [id, n] of recipe) {
    assert.ok(parts.some((part) => part.id === id), `${machine.id}: known part ${id}`);
    assert.ok(Number.isInteger(n) && n >= 1 && n <= 3);
  }
  assert.ok(recipe.reduce((total, [, n]) => total + n, 0) <= 3);
  const act = json(`cutscenes/build-${machine.id}.json`);
  assert.deepEqual(checkAct(`build-${machine.id}`, act, builtins), []);
  const duration = act.beats.reduce((total, beat) => total + beat.for, 0);
  assert.ok(duration >= 6 && duration <= 12, `${machine.id}: 6-12 seconds`);
  assert.equal(act.when, undefined, 'builds work at any time of day');
  for (const sprite of Object.values(act.sprites))
    for (const pose of Object.values(sprite.poses))
      for (const frame of pose.frames) art(frame, 16, 24);

  // Play every beat through the DSL's persistent actor state. The visible result
  // must replace delivered parts after Clawd has worked, then demonstrate use.
  const states = Object.fromEntries(Object.entries(act.cast).map(([id, actor]) =>
    [id, { ...actor, show: !actor.hidden }]));
  assert.equal(states.machine.show, false);
  for (const [id] of recipe) assert.equal(states[id].show, true);
  const poses = [];
  let worked = false, revealed = false;
  for (const beat of act.beats) {
    if (beat.clawd?.pose === 'type' || beat.clawd?.pose === 'dig') worked = true;
    for (const [id, move] of Object.entries(beat)) {
      if (id === 'for') continue;
      Object.assign(states[id], move);
      if (id === 'machine' && move.pose) poses.push(move.pose);
    }
    if (states.machine.show) {
      assert.ok(worked, 'Clawd assembles before revealing');
      for (const [id] of recipe) assert.equal(states[id].show, false, 'materials enter the machine');
      revealed = true;
    }
  }
  assert.ok(revealed);
  assert.ok(new Set(poses).size >= 3, 'staged assembly and working demonstration');
  assert.deepEqual(act.sprites.assembly.poses.done.frames[0], machine.art);
  assert.ok(act.beats.some((beat) => beat.clawd?.to), 'Clawd brings the materials');
}

const sandbox = { window: { tides: {} } };
vm.runInNewContext(readFileSync('src/monterey.js', 'utf8'), sandbox);
const scene = sandbox.window.tides.scenes.monterey;
assert.equal(scene.name, 'Monterey');
const classes = new Set('land top town lamp bamboo wood machine sea far foam sand rail crest face spray white star cloud sun moon c-ink c-clawd c-sea c-sun c-sand c-wood c-land c-lamp c-moon'.split(' '));
const hash = (x, y) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
let frames = 0;
for (const [cols, rows, horizon, shore, ground] of [
  [150, 45, 14, 26, { x0: 65, x1: 144, y0: 31, y1: 41 }],
  [54, 30, 5, 10, { x0: 6, x1: 48, y0: 14, y1: 16 }],
]) {
  const render = (sky, t, tide) => {
    const grid = Array.from({ length: rows }, () => Array(cols).fill(' '));
    const marks = [];
    const put = (x, y, char, css) => {
      assert.ok(Number.isInteger(x) && Number.isInteger(y));
      assert.equal(char.length, 1);
      assert.match(char, ascii);
      assert.ok(css.split(' ').every((token) => classes.has(token)), `class ${css}`);
      if (x < 0 || x >= cols || y < 0 || y >= rows) return;
      grid[y][x] = char;
      marks.push({ x, y, char, css });
    };
    const c = { cols, rows, horizon, t, sky, hash, sunX: cols * 0.3,
      shoreAt: () => shore + tide, ground, rail: rows - 2,
      spot: (x, y) => ({ c: Math.round(ground.x0 + x * (ground.x1 - ground.x0)),
        r: Math.round(ground.y0 + y * (ground.y1 - ground.y0)) }) };
    scene.far(put, c);
    const waterStart = marks.length;
    scene.water(put, c);
    const water = marks.slice(waterStart);
    assert.ok(water.length > 0, 'kelp beds on water');
    assert.ok(water.every((m) => m.y > horizon && m.y < shore + tide));
    const deferred = scene.near(put, c);
    assert.ok(Array.isArray(deferred) && deferred.length >= 3, 'depth-sorted foreground');
    deferred.sort((a, b) => a.r - b.r).forEach((item) => {
      assert.ok(Number.isInteger(item.r));
      item.fn();
    });
    assert.ok(marks.some((m) => m.css === 'wood'), 'cypress trunk');
    assert.ok(marks.some((m) => m.css === 'town'), 'distant lighthouse');
    assert.ok(marks.some((m) => m.css === 'land'), 'rocky headland');
    assert.ok(marks.some((m) => m.css === 'c-sea'), 'tide pools');
    frames++;
    return { text: grid.map((row) => row.join('')).join('\n'), marks };
  };
  for (const sky of ['dawn', 'day', 'dusk', 'night'])
    for (const tide of [-2, 0, 2]) {
      const a = render(sky, 0, tide), b = render(sky, 1.5, tide);
      assert.equal(render(sky, 0, tide).text, a.text, 'deterministic scenery');
      assert.equal(a.marks.some((m) => m.css === 'lamp'), false);
      assert.equal(b.marks.some((m) => m.css === 'lamp'), sky === 'night', 'night-only blinking lamp');
    }
}
console.log(`art: ok (8 parts, 6 machines, 6 playable cutscenes, ${frames} scene frames)`);
