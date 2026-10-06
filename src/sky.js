// Tints the paper to the reader's own hour. Loaded in <head> so the first paint already has the right sky.
// Add ?at=HH:MM to the URL to see another hour.
(() => {
  const RAD = Math.PI / 180;
  const LAT = 38 * RAD; // ponytail: one latitude for every reader; true sun times need their location

  const at = new URLSearchParams(location.search).get('at');
  const now = () => {
    const d = new Date();
    if (/^\d{1,2}:\d{2}$/.test(at || '')) d.setHours(...at.split(':').map(Number), 0);
    return d;
  };

  function sunTimes(d) {
    const y = d.getFullYear();
    const n = Math.round((new Date(y, d.getMonth(), d.getDate()) - new Date(y, 0, 0)) / 864e5);
    const standard = Math.max(new Date(y, 0, 1).getTimezoneOffset(), new Date(y, 6, 1).getTimezoneOffset());
    const dst = d.getTimezoneOffset() < standard ? 1 : 0;
    const b = 2 * Math.PI * (n - 81) / 364;
    const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b); // minutes
    const decl = 23.44 * RAD * Math.sin(2 * Math.PI * (284 + n) / 365);
    const half = Math.acos(-Math.tan(LAT) * Math.tan(decl)) * 12 / Math.PI; // hours of daylight / 2
    const noon = 12 + dst - eot / 60;
    return { hour: d.getHours() + d.getMinutes() / 60, rise: noon - half, set: noon + half };
  }

  function skyOf(hour, s) {
    const w = 0.6;
    if (hour < s.rise - w || hour > s.set + w) return 'night';
    if (hour < s.rise + w) return 'dawn';
    if (hour > s.set - w) return 'dusk';
    return 'day';
  }
  const skyAt = (d) => { const s = sunTimes(d); return skyOf(s.hour, s); };

  // 0 = new, 0.5 = full. Mean synodic month from the new moon of 2000-01-06.
  const moonPhase = (d) => ((d / 864e5 + 2440587.5 - 2451550.1) / 29.530588853 % 1 + 1) % 1;

  const tint = () => { document.documentElement.dataset.sky = skyAt(now()); };
  tint();
  setInterval(tint, 60_000);
  window.tides = { now, sunTimes, skyOf, skyAt, moonPhase };

  // Journal pages: today's date in the header, and arrow keys to turn the page.
  addEventListener('DOMContentLoaded', () => {
    for (const el of document.querySelectorAll('[data-today]')) {
      const d = now();
      el.dateTime = d.toISOString().slice(0, 10);
      el.textContent = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    }
  });
  // Turning the page slides it the way the arrow points: the old page records the side, the new page plays it.
  // Browsers without cross-document view transitions just load the page.
  addEventListener('click', (e) => {
    const a = e.target.closest?.('[data-arrow]');
    if (a && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) sessionStorage.setItem('turn', a.dataset.arrow);
  });
  addEventListener('pagereveal', (e) => {
    const side = sessionStorage.getItem('turn');
    sessionStorage.removeItem('turn');
    if (side && e.viewTransition) e.viewTransition.types.add(side);
  });
  // Journal search: every word typed must appear in the entry; the matches replace the week list.
  addEventListener('DOMContentLoaded', () => {
    const box = document.getElementById('find'), found = document.getElementById('found');
    if (!box) return;
    let index;
    box.addEventListener('input', async () => {
      index ??= await fetch(box.dataset.index).then((r) => r.json());
      const words = box.value.toLowerCase().split(/\s+/).filter(Boolean);
      const hits = words.length ? index.filter((p) => words.every((w) => `${p.title} ${p.text}`.toLowerCase().includes(w))) : [];
      document.body.classList.toggle('finding', words.length > 0);
      found.replaceChildren(...hits.map((p) => {
        const li = document.createElement('li'), a = document.createElement('a'), when = document.createElement('span');
        a.href = `${box.dataset.root}blog/${p.slug}/`; a.textContent = p.title;
        when.className = 'quiet'; when.textContent = p.when;
        li.append(a, when);
        return li;
      }));
      if (words.length && !hits.length) found.textContent = 'Nothing on the sand matches that.';
    });
  });
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest?.('input, textarea, [contenteditable]')) return;
    const side = { ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
    const link = side && document.querySelector(`[data-arrow="${side}"]`);
    link?.click();
  });
})();
