// The act check is the trust boundary for animations an agent writes, so it gets a runnable check of its own:
// every act in acts/ passes, and each kind of bad act is refused. Run: node test/acts.test.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { checkAct, checkSprite } from '../lib/acts.mjs';

const sprites = JSON.parse(readFileSync('src/sprites.json', 'utf8'));
for (const [name, s] of Object.entries(sprites)) {
  const errors = [];
  checkSprite(name, s, name, errors);
  assert.deepEqual(errors, [], `built-in sprite ${name}`);
}
for (const file of readdirSync('acts')) {
  assert.deepEqual(checkAct(file.replace(/\.json$/, ''), JSON.parse(readFileSync(`acts/${file}`, 'utf8')), sprites), [], file);
}

const ok = { title: 'waves', beats: [{ for: 2, clawd: { pose: 'wave' } }] };
const refused = (why, act, id = 'an-act') => assert.notDeepEqual(checkAct(id, act, sprites), [], `should refuse: ${why}`);
assert.deepEqual(checkAct('2026-10-06-waves', ok, sprites), [], 'a minimal act passes');

refused('an unknown key', { ...ok, script: 'alert(1)' });
refused('markup in a word', { ...ok, beats: [{ for: 2, clawd: { say: '<img src=x>' } }] });
refused('markup in a title', { ...ok, title: '</script><script>' });
refused('a pose the sprite lacks', { ...ok, beats: [{ for: 2, clawd: { pose: 'fly' } }] });
refused('a pose from the prototype', { ...ok, beats: [{ for: 2, clawd: { pose: 'constructor' } }] });
refused('an actor not in the cast', { ...ok, beats: [{ for: 2, gull: { pose: 'fly' } }] });
refused('a prototype key as an actor', JSON.parse('{"title":"x","cast":{"__proto__":{"sprite":"gull","at":[0,0]}},"beats":[{"for":1}]}'));
refused('replacing a built-in sprite', { ...ok, sprites: { gull: { poses: { sit: { every: 1, frames: [['x']] } } } } });
refused('replacing a pose Clawd has', { ...ok, sprites: { clawd: { poses: { idle: { every: 1, frames: [['#']] } } } } });
refused('pixel art outside the palette', { ...ok, sprites: { clawd: { poses: { glow: { every: 1, frames: [['#x#']] } } } } });
refused('text art that is too wide', { ...ok, sprites: { kelp: { poses: { sway: { every: 1, frames: [['~'.repeat(17)]] } } } } });
refused('a spot far off the beach', { ...ok, beats: [{ for: 2, clawd: { to: [9, 0] } }] });
refused('an act longer than an hour', { ...ok, beats: [{ for: 1800, clawd: {} }, { for: 1800, clawd: {} }, { for: 1, clawd: {} }] });
refused('a beat with no length', { ...ok, beats: [{ clawd: { pose: 'wave' } }] });
refused('a bad name', ok, '../../etc/passwd');
refused('a sky that does not exist', { ...ok, when: ['noon'] });

// The page carries the acts as JSON inside a <script>; no act text may close that tag.
execFileSync(process.execPath, ['build.mjs'], { stdio: 'ignore' });
const html = readFileSync('dist/index.html', 'utf8');
const world = html.match(/<script type="application\/json" id="world">([\s\S]*?)<\/script>/)[1];
assert.ok(!world.includes('<'), 'the inlined world has no "<"');
assert.equal(JSON.parse(world).acts.length, readdirSync('acts').length, 'every act reaches the page');

console.log('acts: ok');
