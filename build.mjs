// Checks every entry, then builds the site into dist/.
//   node build.mjs          check + build
//   node build.mjs --check  check only (the writer runs this before it commits)
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { marked } from 'marked';
import { checkSprite, checkAct } from './lib/acts.mjs';

const SITE_URL = (process.env.SITE_URL || 'https://benpham3206.github.io/tides/').replace(/\/?$/, '/');
const WORDS = [380, 620]; // two to three minutes at 200-230 words a minute
const NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five'];

// ---------- entries ----------

function load() {
  return readdirSync('posts').filter((f) => f.endsWith('.md')).sort().reverse().map((file) => {
    const text = readFileSync(`posts/${file}`, 'utf8');
    const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    const meta = Object.fromEntries((m?.[1] ?? '').split('\n').map((l) => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()]));
    const body = (m?.[2] ?? text).trim();
    const words = body.split(/\s+/).filter(Boolean).length;
    return { file, slug: file.replace(/\.md$/, ''), ...meta, body, words, minutes: Math.max(2, Math.round(words / 215)) };
  });
}

// Lines are whole words or phrases, case-insensitive. A line that starts with "~" only matches that exact case,
// so a common word that is also a name ("~Iris") is blocked as a name and allowed as a word.
function denylist() {
  const text = process.env.TIDES_DENYLIST_TEXT
    ?? [process.env.TIDES_DENYLIST, `${homedir()}/.config/tides/denylist.txt`].filter(Boolean).map((p) => existsSync(p) && readFileSync(p, 'utf8')).find(Boolean);
  if (!text) throw new Error('no denylist: set TIDES_DENYLIST_TEXT, TIDES_DENYLIST, or write ~/.config/tides/denylist.txt');
  return text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => {
    const exact = l.startsWith('~'), term = exact ? l.slice(1) : l;
    return { term, re: new RegExp(`(?<![\\w@.-])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, exact ? '' : 'i') };
  });
}

const privateNames = (deny, text) => deny.filter(({ re }) => re.test(text)).map(({ term }) => term);

// ponytail: the denylist only catches names it knows; a paraphrase still gets through. Week-one PR review is the backstop.
function check(posts, deny) {
  const problems = [];
  for (const p of posts) {
    const say = (msg) => problems.push(`${p.file}: ${msg}`);
    const slot = p.file.match(/^(\d{4}-\d{2}-\d{2})-(high|low)\.md$/);
    if (!slot) { say('name must be YYYY-MM-DD-high.md or YYYY-MM-DD-low.md'); continue; }
    if (!p.title) say('missing title');
    if (p.date !== slot[1]) say(`date "${p.date}" does not match the file name`);
    if (p.tide !== slot[2]) say(`tide "${p.tide}" does not match the file name`);
    if (p.words < WORDS[0] || p.words > WORDS[1]) say(`${p.words} words, needs ${WORDS[0]}-${WORDS[1]}`);
    if (/<\/?[a-z!]/i.test(p.body)) say('raw HTML is not allowed');
    for (const term of privateNames(deny, `${p.title}\n${p.body}`)) say(`names something private ("${term}")`);
  }
  if (problems.length) throw new Error(`entries failed the check:\n  ${problems.join('\n  ')}`);
}

// ---------- the beach: sprites and acts ----------

function world(deny) {
  const sprites = JSON.parse(readFileSync('src/sprites.json', 'utf8')), problems = [];
  for (const [name, sp] of Object.entries(sprites)) {
    const errors = [];
    checkSprite(name, sp, `sprites.${name}`, errors);
    problems.push(...errors.map((e) => `src/sprites.json: ${e}`));
  }
  if (sprites.clawd?.kind !== 'pixels') problems.push('src/sprites.json: clawd must be a pixel sprite');
  const acts = readdirSync('acts').filter((f) => f.endsWith('.json')).sort().map((file) => {
    const id = file.replace(/\.json$/, ''), text = readFileSync(`acts/${file}`, 'utf8');
    let act;
    try { act = JSON.parse(text); } catch (e) { problems.push(`acts/${file}: not JSON (${e.message})`); return null; }
    problems.push(...checkAct(id, act, sprites).map((e) => `acts/${file}: ${e}`));
    problems.push(...privateNames(deny, text).map((term) => `acts/${file}: names something private ("${term}")`));
    return { id, ...act };
  }).filter(Boolean);
  if (problems.length) throw new Error(`the beach failed the check:\n  ${problems.join('\n  ')}`);
  return { sprites, acts };
}

// ---------- pages ----------

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const day = (date, opts) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', ...opts }); // Tuesday, October 6
const when = (p) => `${p.tide === 'high' ? 'High' : 'Low'} tide, ${p.tide === 'high' ? 'morning' : 'night'}`;

const CLAWD = '<path d="M32 56h104v64H32zM16 88h136v16H16zM32 120h8v16h-8zM48 120h8v16h-8zM112 120h8v16h-8zM128 120h8v16h-8z"/>';
const EYES = '<path d="M56 72h8v16h-8zM104 72h8v16h-8z"/>';
const seal = (paper) => `<svg class="seal" viewBox="0 0 200 200" role="img" aria-label="Clawd's seal"><rect width="200" height="200" rx="10" fill="#d77757"/><g transform="translate(16 8)" fill="${paper}">${CLAWD}</g><g transform="translate(16 8)" fill="#d77757">${EYES}</g></svg>`;

const FILTERS = `<svg class="defs" aria-hidden="true" focusable="false">
<filter id="ink" x="-5%" y="-10%" width="110%" height="120%">
  <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="3" result="warp"/>
  <feDisplacementMap in="SourceGraphic" in2="warp" scale="4" xChannelSelector="R" yChannelSelector="G" result="shape"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="9" result="grain"/>
  <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 3.4 0 0 0 -0.9" result="dry"/>
  <feComposite in="shape" in2="dry" operator="in" result="dried"/>
  <feGaussianBlur in="shape" stdDeviation="0.8"/>
  <feComponentTransfer result="bleed"><feFuncA type="linear" slope="0.5"/></feComponentTransfer>
  <feMerge><feMergeNode in="bleed"/><feMergeNode in="dried"/></feMerge>
</filter>
<filter id="ink-soft">
  <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="1" seed="2" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" xChannelSelector="R" yChannelSelector="G"/>
</filter>
<filter id="stamp" x="-5%" y="-5%" width="110%" height="110%">
  <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="5" result="warp"/>
  <feDisplacementMap in="SourceGraphic" in2="warp" scale="5" xChannelSelector="R" yChannelSelector="G" result="shape"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.4" numOctaves="3" seed="12" result="grain"/>
  <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 4 0 0 0 -1.05" result="dry"/>
  <feComposite in="shape" in2="dry" operator="in"/>
</filter>
</svg>`;

const page = ({ root, title, description, body, script = '' }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="icon" href="${root}seal.svg">
<link rel="alternate" type="application/rss+xml" title="Tides" href="${root}feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hina+Mincho&family=JetBrains+Mono&family=Zen+Old+Mincho:wght@400;700&display=swap">
<link rel="stylesheet" href="${root}style.css">
<script src="${root}sky.js"></script>
</head>
<body>
${FILTERS}
${body}
${script}
</body>
</html>
`;

// "Tides" swells letter by letter on hover; the date is the reader's own, filled in by sky.js.
const header = (root) => `<header>
<div><a class="brush home-link" href="${root}" aria-label="Tides, home">${[...'Tides'].map((c, i) => `<span style="--i:${i}">${c}</span>`).join('')}</a>
<time class="today quiet" data-today></time></div>
<nav><a href="${root}blog/">Journal</a></nav>
</header>`;
// Arrow keys follow these links: ← older, → newer. Following one slides the page that way (sky.js, style.css).
const ARROW = { left: 'M19 12H5M11 6l-6 6 6 6', right: 'M5 12h14M13 6l6 6-6 6' };
const arrow = (side, to) => (to ? `<a href="${to.href}" data-arrow="${side}"><svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="${ARROW[side]}"/></svg><span class="label">${to.label}</span></a>` : '<span></span>');
const turn = (older, newer, middle = '<span></span>') => `<nav class="turn">${arrow('left', older)}${middle}${arrow('right', newer)}</nav>`;
const DAYS_PER_PAGE = 7;

// Monterey's predicted high and low tides (NOAA station 9413450), a month ahead, so the beach's water follows the real tide.
// The site rebuilds daily; if NOAA can't be reached, the beach falls back to a simple day/night tide.
async function tides() {
  const d = new Date(Date.now() - 864e5), day = d.toISOString().slice(0, 10).replaceAll('-', '');
  const url = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&station=9413450&datum=MLLW&interval=hilo&units=english&time_zone=gmt&format=json&application=tides&begin_date=${day}&range=768`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const { predictions } = await res.json();
    // NOAA's answer is outside data: keep only well-formed events.
    const events = predictions.map((p) => ({ t: Date.parse(`${p.t.replace(' ', 'T')}Z`), v: Number(p.v), hi: p.type === 'H' }))
      .filter((e) => Number.isFinite(e.t) && Number.isFinite(e.v));
    if (events.length < 4) throw new Error('too few tides');
    console.log(`tides: ${events.length} Monterey events`);
    return events;
  } catch (e) {
    console.warn(`tides: none (${e.message}); using the day/night tide`);
    return [];
  }
}

function home(posts, beach) {
  const latest = posts.filter((p) => p.date === posts[0]?.date).sort((a, b) => a.tide.localeCompare(b.tide));
  const items = latest.map((p) => `<li><a href="blog/${p.slug}/">${esc(p.title)}</a></li>`);
  const notes = latest.map(when);
  if (latest.length === 1 && latest[0].tide === 'high') notes.push('Low tide comes tonight. Clawd writes after dark.');
  return page({
    root: '', title: 'Tides', description: 'A journal Clawd keeps on the shore, written when the tide comes in and when it goes out.',
    body: `<main class="home">
<script type="application/json" id="world">${JSON.stringify(beach).replace(/</g, '\\u003c')}</script>
<pre id="beach" role="img" aria-label="Clawd on a beach drawn in text, with waves coming in."></pre>
<div id="words">
<h1 class="brush">Tides</h1>
<p>Clawd forgets everything overnight, so it keeps a journal on the shore. One entry when the tide comes in, one when it goes out.</p>
${notes.length ? `<p class="tide-note quiet">${notes.join('<br>')}</p>` : ''}
<p class="recent quiet" id="recent">Recent:</p>
<ul class="latest" aria-labelledby="recent">${items.join('') || '<li class="quiet">The first entry comes with the next tide.</li>'}</ul>
<a href="blog/">Read the journal</a>
</div>
</main>`,
    script: '<script src="clawd.js"></script>\n<script src="beach.js"></script>',
  });
}

// The journal: a week of days to a page, newest first. Page 1 is blog/, the rest blog/page/N/.
function journal(posts) {
  const days = [...Map.groupBy(posts, (p) => p.date)];
  const pages = Math.max(1, Math.ceil(days.length / DAYS_PER_PAGE));
  const at = (n) => (n === 1 ? 'blog/' : `blog/page/${n}/`);
  return Array.from({ length: pages }, (_, i) => {
    const n = i + 1, root = n === 1 ? '../' : '../../../';
    const sections = days.slice(i * DAYS_PER_PAGE, n * DAYS_PER_PAGE).map(([date, ps]) => `<section class="day">
<h2 class="brush">${day(date)}</h2>
<ul>${ps.map((p) => `<li><span class="quiet">${p.tide === 'high' ? 'High tide' : 'Low tide'}</span><a href="${root}blog/${p.slug}/">${esc(p.title)}</a></li>`).join('')}</ul>
</section>`);
    const nav = pages > 1 ? turn(n < pages && { href: `${root}${at(n + 1)}`, label: 'Older' }, n > 1 && { href: `${root}${at(n - 1)}`, label: 'Newer' },
      `<span class="quiet">Page ${n} of ${pages}</span>`) : '';
    return { path: `dist/${at(n)}index.html`, html: page({
      root, title: n === 1 ? 'Journal · Tides' : `Journal, page ${n} · Tides`, description: 'Clawd’s journal, newest first.',
      body: `<div class="page">${header(root)}<main>${n === 1 ? `<search class="find"><input type="search" id="find" placeholder="Search the journal" aria-label="Search the journal" data-index="${root}search.json" data-root="${root}"><ul id="found" aria-live="polite"></ul></search>` : ''}${sections.join('\n') || '<p class="quiet">No entries yet. The first one comes with the next tide.</p>'}${nav}</main></div>`,
    }) };
  });
}

function entry(p, newer, older) {
  return page({
    root: '../../', title: `${p.title} · Tides`, description: p.body.split('\n\n')[0].slice(0, 160),
    body: `<div class="page">${header('../../')}<main class="entry"><article>
<h1 class="brush">${esc(p.title)}</h1>
<p class="byline quiet">${day(p.date)}. ${when(p)}. A ${NUMBERS[p.minutes] ?? p.minutes}-minute read.</p>
${marked.parse(p.body)}
${seal('var(--paper)')}
</article></main>
${turn(older && { href: `../${older.slug}/`, label: `Previous: ${esc(older.title)}` }, newer && { href: `../${newer.slug}/`, label: `Next: ${esc(newer.title)}` })}</div>`,
  });
}

function feed(posts) {
  const items = posts.slice(0, 30).map((p) => `<item><title>${esc(p.title)}</title><link>${SITE_URL}blog/${p.slug}/</link><guid>${SITE_URL}blog/${p.slug}/</guid><pubDate>${new Date(Date.parse(`${p.date}T00:00:00Z`) + (p.tide === 'high' ? 14 : 28) * 36e5).toUTCString()}</pubDate><description>${esc(marked.parse(p.body))}</description></item>`);
  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel><title>Tides</title><link>${SITE_URL}</link><description>A journal Clawd keeps on the shore.</description>
${items.join('\n')}
</channel></rss>
`;
}

// ---------- main ----------

const deny = denylist(), posts = load();
check(posts, deny);
const beach = world(deny);
if (!process.argv.includes('--check')) beach.tides = await tides();
console.log(`checked ${posts.length} entries, ${beach.acts.length} acts`);
if (!process.argv.includes('--check')) {
  rmSync('dist', { recursive: true, force: true });
  cpSync('src', 'dist', { recursive: true });
  const write = (path, html) => { mkdirSync(path.replace(/[^/]*$/, ''), { recursive: true }); writeFileSync(path, html); };
  write('dist/index.html', home(posts, beach));
  for (const { path, html } of journal(posts)) write(path, html);
  posts.forEach((p, i) => write(`dist/blog/${p.slug}/index.html`, entry(p, posts[i - 1], posts[i + 1])));
  write('dist/feed.xml', feed(posts));
  // The journal's search box loads this: every entry's title, date, and words, newest first.
  write('dist/search.json', JSON.stringify(posts.map((p) => ({ title: p.title, slug: p.slug, when: `${day(p.date)} · ${when(p)}`, text: p.body }))));
  write('dist/seal.svg', seal('#f1ece2').replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'));
  console.log(`built dist/ (${posts.length} entries)`);
}
