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

## Deploy

A push to `main` runs `.github/workflows/site.yml`. The workflow runs `make check test` and then deploys `dist/` to GitHub Pages at https://benpham3206.github.io/tides/. The check needs the repository secret `TIDES_DENYLIST_TEXT` (the private denylist). If the secret is missing, the check fails and nothing deploys.

## Tides

The build fetches a month of predicted high and low tides for Monterey (NOAA station 9413450) and puts them in the home page. The beach's water line rises and falls with the real tide, eased between predictions. The workflow also runs daily at 11:00 UTC to refresh the table. If NOAA cannot be reached, the build still succeeds and the beach uses a simple day/night tide. The post labels (`high` = morning, `low` = night) do not follow the real tide.
