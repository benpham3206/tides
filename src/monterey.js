(() => {
  const art = (put, x, bottom, rows, color) => rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++)
      if (row[i] !== ' ') put(x + i, bottom - rows.length + 1 + j, row[i], color);
  });
  window.tides.scenes = window.tides.scenes || {};
  window.tides.scenes.monterey = {
    name: 'Monterey',
    far(put, { cols, horizon, hash, sky, t }) {
      const small = horizon < 8, height = small ? 2 : 4;
      const ridge = (x) => {
        const u = (x / cols - 0.8) / 0.22;
        return Math.round(height * Math.exp(-u * u)) + (x > cols * 0.92 ? 1 : 0);
      };
      for (let x = Math.floor(cols * 0.52); x < cols; x++) {
        const top = ridge(x);
        for (let j = 1; j <= top; j++)
          put(x, horizon - j, j === top ? '_,.'[Math.floor(hash(x, 3) * 3)]
            : '%&#'[Math.floor(hash(x, j) * 3)], j === top ? 'land top' : 'land');
      }
      const cypress = (fraction) => {
        const x = Math.round(cols * fraction), bottom = horizon - ridge(x) - 1;
        art(put, x - (small ? 3 : 6), bottom - 1,
          small ? ['_,___,'] : ['   _,____,___', ' ,#########\' ', '  `--,##--\'  '], 'land');
        art(put, x, bottom, small ? ['/'] : [' /', '/ '], 'wood');
      };
      cypress(0.67);
      if (!small) cypress(0.94);
      const lighthouse = Math.round(cols * 0.83), base = horizon - ridge(lighthouse);
      art(put, lighthouse - 1, base, ['_^_', '[o]', '|#|'], 'town');
      if (sky === 'night' && Math.floor(t / 1.5) % 2)
        put(lighthouse, base - 1, '*', 'lamp');
      const stack = Math.round(cols * 0.36);
      art(put, stack - 2, horizon, small ? [' /#', '/%#_']
        : ['  _, ', ' /%# ', ' |&#\\', '_/%#_'], 'land');
    },
    water(put, { cols, horizon, shoreAt, hash, t }) {
      for (const center of [0.27, 0.57]) {
        const x0 = Math.round(cols * center), width = Math.max(4, Math.round(cols * 0.08));
        for (let i = 0; i < width; i++) {
          const x = x0 + i, depth = shoreAt(x) - horizon;
          if (depth < 3 || hash(i, x0) > 0.65) continue;
          const y = horizon + Math.max(1, Math.round(depth * (center < 0.3 ? 0.3 : 0.5)));
          put(x, y, Math.sin(t * 0.5 + i) > 0 ? '~' : '-', 'land');
          if (hash(x, 18) < 0.22 && y + 1 < shoreAt(x)) put(x, y + 1, ')', 'sea');
        }
      }
    },
    near(put, { cols, ground, spot, hash, rail }) {
      const small = ground.y1 - ground.y0 < 5, items = [];
      const place = (x, y, rows, color) => {
        const p = spot(x, y), width = Math.max(...rows.map((row) => row.length));
        items.push({ r: p.r, fn: () => art(put, p.c - Math.floor(width / 2), p.r, rows, color) });
      };
      place(0.13, 0.18, small ? [' ._.', '/%_#\\'] : ['  __,', ' / . \\', '/_%__#\\'], 'c-ink');
      place(0.43, 0.18, small ? ['(~~o_)'] : [' .____.', '(~ . ~_)', ' `----\''], 'c-sea');
      place(0.78, 0.72, small ? [' /#\\', '/_._\\'] : ['   _--.', ' _/ . #\\', '/_%____#\\'], 'c-ink');
      // Keep the bluff beside the playable sand, above the foreground railing.
      const right = Math.min(cols - 1, ground.x1 + 5), bottom = Math.min(rail - 1, ground.y1);
      items.push({ r: bottom, fn: () => {
        for (let x = Math.max(0, right - (small ? 3 : 7)); x <= right; x++) {
          const top = bottom - Math.round((right - x) * 0.22);
          put(x, top - 1, hash(x, 81) < 0.35 ? '*' : 'v', hash(x, 81) < 0.35 ? 'c-clawd' : 'land');
          for (let y = top; y <= bottom; y++)
            put(x, y, hash(x, y) < 0.3 ? '%' : '.', 'land');
        }
      } });
      return items;
    },
  };
})();
