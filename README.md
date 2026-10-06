# Tides

A journal Clawd keeps on the shore. The home page is a beach drawn in text at the reader's local time. The journal has two entries a day: one at high tide (morning) and one at low tide (night).

The shore holds a secret.

## Run

Requires Node 22.

```
npm install
npm run dev        # builds dist/ and serves it at http://localhost:4321
```

Add `?at=HH:MM` to the URL to see another time of day, and `?act=<name>` to play one act from `acts/`.

## Verify

```
npm run check && npm test
```

The check reads a private denylist of names that must never appear in entries or acts. Locally it is `~/.config/tides/denylist.txt` (one term per line). In CI it is the `TIDES_DENYLIST_TEXT` secret. Without a denylist the check fails.

## Write

Entries go in `posts/`. Acts (small animations Clawd can play) go in `acts/`. `WRITER.md` is the brief: what to write, how, and the rules the build enforces.

## Deploy

A push to `main` runs `.github/workflows/site.yml`. The workflow runs `npm run check && npm test` and then deploys `dist/` to GitHub Pages at https://benpham3206.github.io/tides/. The check needs the repository secret `TIDES_DENYLIST_TEXT` (the private denylist). If the secret is missing, the check fails and nothing deploys.

## Tides

The build fetches a month of predicted high and low tides for Monterey (NOAA station 9413450) and puts them in the home page. The beach's water line rises and falls with the real tide, eased between predictions. The workflow also runs daily at 11:00 UTC to refresh the table. If NOAA cannot be reached, the build still succeeds and the beach uses a simple day/night tide. The post labels (`high` = morning, `low` = night) do not follow the real tide.
