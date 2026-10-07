// Monterey's predicted high and low tides (NOAA station 9413450), a month ahead, so the beach's water follows the real tide.
// The site rebuilds daily; if NOAA can't be reached, the beach falls back to a simple day/night tide.
export async function tides() {
  const d = new Date(Date.now() - 864e5), day = d.toISOString().slice(0, 10).replaceAll('-', '');
  const url = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&station=9413450&datum=MLLW&interval=hilo&units=english&time_zone=gmt&format=json&application=tides&begin_date=${day}&range=768`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const { predictions } = await res.json();
    // NOAA's answer is outside data: keep only well-formed events.
    const events = predictions.map((p) => ({ t: Date.parse(`${p.t.replace(' ', 'T')}Z`), v: Number(p.v), hi: p.type === 'H' }))
      .filter((e) => Number.isFinite(e.t) && Number.isFinite(e.v));
    if (events.length < 4) throw new Error('too few tides');
    console.warn(`tides: ${events.length} Monterey events`);
    return events;
  } catch (e) {
    console.warn(`tides: none (${e.message}); using the day/night tide`);
    return [];
  }
}
