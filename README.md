# tides

This project uses the Agent Engineering operating layer. Start with `GOAL.md`, `ARCHITECTURE.md`, `STATUS.md`, `AGENTS.md`, and `SECURITY.md`.

## Fonts

The site uses Hina Mincho for brush titles, Zen Old Mincho for body text, and JetBrains Mono for the beach. All come from Google Fonts. The `<link>` is in `page()` in `build.mjs`.

Shortlist of approved alternates (weight in brackets):

- Zen Old Mincho (700)
- Shippori Mincho B1 (700)
- Zen Antique (400)
- Kaisei Tokumin (700)
- Hina Mincho (400)
- Klee One (600)
- Cormorant Garamond (500)
- Ma Shan Zheng (400)

To change a font, change the family in the `<link>` and the `--brush` or `--serif` variable in `src/style.css`.
