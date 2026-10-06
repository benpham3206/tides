// The contract for sprites and acts. An act is an animation Clawd writes for itself: data, never code. This check is
// the boundary every act crosses before it reaches the site, and it refuses anything it does not describe.
// The format is documented for writers in ACTS.md.

export const SKIES = ['dawn', 'day', 'dusk', 'night'];
export const COLORS = ['ink', 'clawd', 'sea', 'sun', 'sand', 'wood', 'land', 'lamp', 'moon'];
// Pixel art: . clear  # Clawd  o eyes  k ink  d wood  s sun  b sea  w paper
export const PIXEL = /^[.#okdsbwg]*$/;
const TEXT = /^[\x20-\x7E─-▟]*$/; // printable ASCII, box drawing, block elements
const WORDS = /^[A-Za-z0-9 ,.'’!?:;()-]*$/;
const NAME = /^[a-z][a-z0-9-]{0,23}$/;
export const ACT_ID = /^(\d{4}-\d{2}-\d{2}-)?[a-z][a-z0-9-]{0,47}$/;
const LIMIT = {
  poses: 16, frames: 32, rows: 24, textCols: 16, pixelCols: 32, every: [0.05, 5],
  sprites: 6, cast: 8, beats: 60, beat: [0.1, 1800], act: 3600, say: 16, title: 60, hop: 8,
  x: [-0.5, 1.5], y: [-3, 1.3],
};

const has = (o, k) => isObj(o) && Object.hasOwn(o, k);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v, [lo, hi]) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

function only(v, keys, where, errors) {
  if (!isObj(v)) { errors.push(`${where}: must be an object`); return false; }
  for (const k of Object.keys(v)) if (!keys.includes(k)) errors.push(`${where}: unknown key "${k}"`);
  return true;
}

function words(v, max, where, errors) {
  if (typeof v !== 'string' || !v.length || v.length > max || !WORDS.test(v)) errors.push(`${where}: 1-${max} plain characters`);
}

function point(v, where, errors) {
  if (!Array.isArray(v) || v.length !== 2 || !num(v[0], LIMIT.x) || !num(v[1], LIMIT.y))
    errors.push(`${where}: must be [x, y] with x in ${LIMIT.x.join('..')} and y in ${LIMIT.y.join('..')}`);
}

export function checkSprite(name, s, where, errors) {
  if (!NAME.test(name)) errors.push(`${where}: bad sprite name "${name}"`);
  if (!only(s, ['kind', 'color', 'poses'], where, errors)) return;
  const pixels = s.kind === 'pixels';
  if (s.kind !== undefined && !['text', 'pixels'].includes(s.kind)) errors.push(`${where}.kind: text or pixels`);
  if (s.color !== undefined && (pixels || !COLORS.includes(s.color))) errors.push(`${where}.color: one of ${COLORS.join(', ')} (text sprites only)`);
  if (!isObj(s.poses) || !Object.keys(s.poses).length || Object.keys(s.poses).length > LIMIT.poses) {
    errors.push(`${where}.poses: 1-${LIMIT.poses} poses`); return;
  }
  for (const [pose, p] of Object.entries(s.poses)) {
    const at = `${where}.poses.${pose}`;
    if (!NAME.test(pose)) errors.push(`${at}: bad pose name`);
    if (!only(p, ['every', 'frames'], at, errors)) continue;
    if (!num(p.every, LIMIT.every)) errors.push(`${at}.every: seconds per frame, ${LIMIT.every.join('-')}`);
    if (!Array.isArray(p.frames) || !p.frames.length || p.frames.length > LIMIT.frames) { errors.push(`${at}.frames: 1-${LIMIT.frames} frames`); continue; }
    p.frames.forEach((f, i) => {
      const ok = Array.isArray(f) && f.length && f.length <= LIMIT.rows && f.every((row) => typeof row === 'string'
        && row.length <= (pixels ? LIMIT.pixelCols : LIMIT.textCols) && (pixels ? PIXEL : TEXT).test(row));
      if (!ok) errors.push(`${at}.frames[${i}]: 1-${LIMIT.rows} rows of ${pixels ? `pixel art (${PIXEL.source}), ${LIMIT.pixelCols}` : `text, ${LIMIT.textCols}`} wide at most`);
    });
  }
}

// builtins: the sprites in src/sprites.json, already checked.
export function checkAct(id, act, builtins) {
  const errors = [];
  if (!ACT_ID.test(id)) errors.push(`name must be lowercase-with-dashes, optionally after a YYYY-MM-DD- date`);
  if (!only(act, ['title', 'when', 'sprites', 'cast', 'beats'], 'act', errors)) return errors;
  words(act.title, LIMIT.title, 'title', errors);
  if (act.when !== undefined && (!Array.isArray(act.when) || !act.when.length || act.when.some((s) => !SKIES.includes(s)) || new Set(act.when).size !== act.when.length))
    errors.push(`when: a list drawn from ${SKIES.join(', ')}`);

  // Sprites: new ones, or new poses for Clawd. Nothing built in can be replaced.
  const sprites = { ...builtins, clawd: { ...builtins.clawd, poses: { ...builtins.clawd.poses } } };
  if (act.sprites !== undefined) {
    if (!isObj(act.sprites) || Object.keys(act.sprites).length > LIMIT.sprites) errors.push(`sprites: at most ${LIMIT.sprites}`);
    else for (const [name, s] of Object.entries(act.sprites)) {
      if (name === 'clawd') {
        if (!only(s, ['poses'], 'sprites.clawd', errors)) continue;
        checkSprite(name, { kind: 'pixels', poses: s.poses }, 'sprites.clawd', errors);
        for (const pose of Object.keys(s.poses ?? {})) {
          if (has(builtins.clawd.poses, pose)) errors.push(`sprites.clawd.poses.${pose}: Clawd already has this pose`);
          else sprites.clawd.poses[pose] = s.poses[pose];
        }
      } else if (has(builtins, name)) errors.push(`sprites.${name}: a built-in sprite has this name`);
      else { checkSprite(name, s, `sprites.${name}`, errors); sprites[name] = s; }
    }
  }

  const cast = { clawd: 'clawd' }; // actor → sprite name
  if (act.cast !== undefined) {
    if (!isObj(act.cast) || Object.keys(act.cast).length > LIMIT.cast) errors.push(`cast: at most ${LIMIT.cast} actors`);
    else for (const [name, c] of Object.entries(act.cast)) {
      const at = `cast.${name}`;
      if (!NAME.test(name)) errors.push(`${at}: bad actor name`);
      if (name === 'clawd') { if (only(c, ['at'], at, errors)) point(c.at, `${at}.at`, errors); continue; }
      if (!only(c, ['sprite', 'at', 'hidden', 'pose'], at, errors)) continue;
      if (!has(sprites, c.sprite)) { errors.push(`${at}.sprite: no sprite "${c.sprite}"`); continue; }
      point(c.at, `${at}.at`, errors);
      if (c.hidden !== undefined && typeof c.hidden !== 'boolean') errors.push(`${at}.hidden: true or false`);
      if (c.pose !== undefined && !has(sprites[c.sprite].poses, c.pose)) errors.push(`${at}.pose: "${c.sprite}" has no pose "${c.pose}"`);
      cast[name] = c.sprite;
    }
  }

  if (!Array.isArray(act.beats) || !act.beats.length || act.beats.length > LIMIT.beats) {
    errors.push(`beats: 1-${LIMIT.beats} beats`);
    return errors;
  }
  let total = 0;
  act.beats.forEach((beat, i) => {
    const at = `beats[${i}]`;
    if (!only(beat, ['for', ...Object.keys(cast)], at, errors)) return;
    if (!num(beat.for, LIMIT.beat)) errors.push(`${at}.for: seconds, ${LIMIT.beat.join('-')}`);
    else total += beat.for;
    for (const [actor, m] of Object.entries(beat)) {
      if (actor === 'for' || !has(cast, actor) || !only(m, ['to', 'pose', 'say', 'hop', 'show'], `${at}.${actor}`, errors)) continue;
      if (m.to !== undefined) point(m.to, `${at}.${actor}.to`, errors);
      if (m.pose !== undefined && !has(sprites[cast[actor]].poses, m.pose)) errors.push(`${at}.${actor}.pose: "${cast[actor]}" has no pose "${m.pose}"`);
      if (m.say !== undefined) words(m.say, LIMIT.say, `${at}.${actor}.say`, errors);
      if (m.hop !== undefined && !num(m.hop, [0, LIMIT.hop])) errors.push(`${at}.${actor}.hop: rows, 0-${LIMIT.hop}`);
      if (m.show !== undefined && typeof m.show !== 'boolean') errors.push(`${at}.${actor}.show: true or false`);
    }
  });
  if (total > LIMIT.act) errors.push(`the act runs ${Math.round(total)} s; at most ${LIMIT.act}`);
  return errors;
}
