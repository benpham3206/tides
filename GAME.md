# The secret game

Press W, A, S, D, or an arrow key on the home page to walk Clawd. W and up walk toward the water, and on into it: past the waterline, Clawd swims. S and down walk toward you. A and left walk left. D and right walk right.

The game takes Clawd from where it stands. If Clawd is away collecting materials, the view trucks right to Monterey, where Clawd is. The sky holds still while the shore slides past.

Walk past the right edge of the home beach to reach Monterey. Walk past Monterey's left edge to return. Walk onto parts to collect them. The top-right inventory shows your parts and built machines. If the inventory covers a recipe, press E to build the first affordable machine you have not built. Its cutscene pauses movement for 6–12 seconds. Escape returns Clawd to its planned day. Escape during a build cancels it without spending parts.

The boat silhouette with a question mark is a future goal. You cannot build the boat in v1. The HUD scrolls horizontally when the inventory exceeds the phone width.

## Files

`src/game.js` owns controls, daily placements, inventory, builds, storage, and the HUD. `src/beach.js` draws the shared sky and sea, registers the home scene, and slides between scenes. `src/monterey.js` registers Monterey using the same scene contract. `src/clawd.js` draws Clawd and compiles both ambient acts and build cutscenes.

`src/parts.json` defines parts. `src/machines.json` defines recipes, machine art, and boat art. `cutscenes/build-<machineId>.json` contains a build act. `build.mjs` validates and inlines these into `world.game` and `world.cutscenes`. The build treats absent game data and cutscenes as empty. If Monterey is absent, the player stays on the home beach.

## Add a part

Add an object to `src/parts.json` with a unique lowercase `id`, a plain-text `name`, a `color` from `COLORS` in `lib/acts.mjs`, and `art`. Part art has at most two rows of three characters. The engine places each kind from the local calendar date. The first three kinds each have one home pickup. Most pickups are in Monterey.

## Add a machine

Add an object to the `machines` array in `src/machines.json`. Give it a unique lowercase `id`, a plain-text `name`, a `recipe` of two or three known part kinds with positive integer counts, and `art` of at most five rows of twelve characters. Keep recipe counts small enough to collect in a short walk. Array order determines build priority.

Add its matching cutscene before expecting E to build the machine. Set `boat.art` in the same file for the future boat silhouette. The engine currently supports at most eight part kinds and six machines.

## Add a cutscene

Create `cutscenes/build-<machineId>.json` using the act format validated by [lib/acts.mjs](lib/acts.mjs). Use built-in sprites from `src/sprites.json` or act-local text sprites. Give the act a total duration of 6–12 seconds. The build runs `checkAct` from `lib/acts.mjs` and the same private denylist check as ambient acts. Cutscenes never enter the ambient day pool.

## Save and recovery

Inventory and collection use `localStorage` key `tides.game.v1`. The stored shape is `{"parts":{"rope":2},"built":["pulley"]}`. The engine accepts only known ids and integer counts from 0 through 99. It drops invalid entries and duplicate machine ids. A malformed container resets to empty. Storage errors leave the current game playable.

Pickup consumption lasts for the current page session. Reloading places the same day's parts again while retaining inventory and machines. A new day changes placement. The save format does not store position, scene, or consumed pickups.

## Verify

From the repository root, run the same command used by CI.

```sh
npm run check && npm test
```

The check requires the denylist described in [README.md](README.md). `test/game.test.mjs` drives keyboard events and the frame clock in a Node browser model using the real parts, recipes, Monterey scene, sprites, and cutscene renderer. It covers entry and exit, movement, both scene edges, pickups, build affordability and cancellation, reloads, bad storage, and all six cutscenes. It writes `runs/game-test-evidence.json` with check names, source hashes, and the measured time to collect at least six parts and build two machines. `test/art.test.mjs` also checks the art and scene frames across desktop and phone layouts.
