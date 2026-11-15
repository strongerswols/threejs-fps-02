# RUSTLINE DEPOT — a three.js tactical FPS

A round-based tactical shooter in the Counter-Strike style, built on three.js 0.187.0
as plain static files: no build step, no network, single-player against bots.

## The game

Vanguard (you + two AI teammates) defends two bomb sites in a container yard at dusk
against the Rustjackals (four AI attackers). First team to 5 round wins takes the match.

- **Rounds**: 15 s buy phase, then a 100 s round. Win by eliminating the enemy team,
  holding the sites until time runs out, or defusing the bomb.
- **Objective**: the enemy carrier walks a route to site A or B and plants the bomb
  (3.5 s). Once planted it ticks for 35 s — hold **E** beside it for 5 s to defuse.
- **Economy**: start with $800 and a pistol. Kills pay $300, round wins $3250, losses
  $1900. Spend it in the buy menu (**B** during the buy phase) on a rifle, SMG,
  shotgun, HE grenade or kevlar vest.
- **Gunplay**: hitscan with headshot damage (4x), recoil and spread that punish firing
  on the move, acceleration-based movement, crouching, jumping and map collision.
  Stopping to aim pays.
- **Bots**: they walk waypoint routes to the sites, hold angles, strafe while firing
  in bursts, react to what they see and hear, and defend a planted bomb.
- **HUD**: health and armor bars, ammo, money, round timer, team score, kill feed,
  a live minimap, a crosshair that widens with spread, and a bomb timer.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (click to lock) |
| Click | Fire |
| R | Reload |
| Ctrl / C | Crouch |
| Space | Jump |
| B | Buy menu (buy phase) |
| G | Throw grenade |
| E | Defuse (hold, at the bomb) |
| 1–4 | Switch weapon |

## Run it

```sh
node serve.ts   # serves game/ at http://localhost:8080
```

Hand it in (as the make.fun entry program does):

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Files

- `main.ts` — the entry program: copies `game/` + `screenshots/` to `/output` and
  writes `dossier.json` with the vendored `vendor/makefun-threejs.ts` library.
- `game/` — the game: `index.html` (HUD + import map), `src/` (one module per job:
  `main`, `world`, `physics`, `bots`, `weapons`, `bomb`, `economy`, `effects`,
  `audio`, `hud`, `input`, `palette`), `vendor/three/` (three.js 0.187.0).
- `screenshots/` — four real renders of the game's own code.
