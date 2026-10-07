// Which journal entry is due, from Monterey's real tides. Each Pacific day has two: the high tide entry at the day's
// first high tide, and the low tide entry at the first low tide after it. Prints the oldest entry whose tide has
// passed in the last 36 hours and comes after the newest entry, as "YYYY-MM-DD high 6:12 AM", or nothing.
import { readdirSync } from 'node:fs';
import { tides } from './lib/tides.mjs';

const zone = { timeZone: 'America/Los_Angeles' };
const dateOf = (t) => new Date(t).toLocaleDateString('sv-SE', zone);
const clock = (t) => new Date(t).toLocaleTimeString('en-US', { ...zone, hour: 'numeric', minute: '2-digit' });

const newest = readdirSync('posts').filter((f) => f.endsWith('.md')).sort().at(-1)?.slice(0, -3) ?? ''; // never reach back past it
const now = Date.now(), events = (await tides()).sort((a, b) => a.t - b.t);
if (!events.length) throw new Error('no tide predictions from NOAA');
const due = [];
for (const date of new Set(events.map((e) => dateOf(e.t)))) {
  const high = events.find((e) => e.hi && dateOf(e.t) === date);
  const low = high && events.find((e) => !e.hi && e.t > high.t);
  for (const [tide, e] of [['high', high], ['low', low]])
    if (e && e.t <= now && now - e.t < 36 * 36e5 && `${date}-${tide}` > newest) due.push({ t: e.t, slot: `${date} ${tide} ${clock(e.t)}` });
}
const next = due.sort((a, b) => a.t - b.t)[0];
if (next) console.log(next.slot);
