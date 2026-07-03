# grapple - a web-swing plugin

A spool `KitPlugin` (`dp.grapple()`): raycast an anchor, tag the player, then each
tick pull them toward it as a momentum-preserving **pendulum**. The engine's own
gravity does the falling (it's left on); the plugin only adds the rope-correction
**impulse** each taut tick, so a slack tick adds nothing and you simply fall. Built
**only** on the public API of `player_motion` (its `launchInput` + `applyGlobal`) and
helix's typed math primitives - it never pokes another plugin's internals.

This folder is a **NestJS-style module**: controllers (the invoked functions), services
(the behaviours), a repository (the persistent state), and a physics library (the math).
Start with `tuning.ts` (the *why* / the physics) and `grapple.module.ts` (the wiring -
who depends on what), then follow the flow below.

## The files

**Module & controller (the composition root + the invoked functions)**

| file | role | holds |
| --- | --- | --- |
| `index.ts` | plugin entry | the `KitPlugin`, `dp.grapple()` augmentation, `deps: [player_motion, raycast]` - nothing else |
| `grapple.module.ts` | **module** | `defineGrapple` → builds every provider once, then the services on top, then wires init + the controller. The dependency graph, spelled out |
| `grapple.controller.ts` | **controller** | the three "routes": `grapple/start` (public), `grapple/tick` (tick-tagged loop), `grapple/stop` (public) - each thin, delegating its body to a service |

**Providers (what used to be the `context.ts` god-object, split by concern)**

| file | role | holds |
| --- | --- | --- |
| `config.ts` | config | resolved `GrappleOptions` → reach-in-steps, anchor block filter, marker type + NBT |
| `selectors.ts` | selectors | every `@s`/`@e[…]` query, named (`grappling()`, `freshAnchor()`, `aimTarget()`…) |
| `scratch.ts` | scratch | the `grapple.work` per-tick working memory: `scalar`/`vector` factories + `swingScratch` |
| `constants.ts` | constants | the `grapple.const` seeded scalars (`negOne`, `fracScale`, `baumDiv`…) + the `seeds` table init writes |
| `state.repository.ts` | **repository** | the persistent per-player scoreboard row (anchor/prev/vel/rope²/id), as `self`-bound `ScoreVec3` views, and the sole owner of the `Pos[]` NBT layout (`readPos`) |
| `functions.ts` | wiring | the `FunctionRef` table, created up front so any body can call any other |

**Services (the behaviours) + the physics library**

| file | role | holds |
| --- | --- | --- |
| `physics.ts` | **library** | the pure swing math - `ScoreVec3` algebra + the `Fixed` constraint solver (SENSE / CONSTRAIN / RELEASE). Reads the repo + scratch; no selectors-beyond-`self`, no particles, no function wiring |
| `anchor.service.ts` | service | the raycast's on-hit payload: summon the marker, read its Pos → anchor scores |
| `attach.service.ts` | service | `latch` - on a placed anchor: fix the rope length, stamp the shared id, tag `grappling`, zero gravity |
| `swing.service.ts` | service | builds `grapple/drive` + `grapple/constrain`; `driveAll` fans the tick over every grappler |
| `rope.service.ts` | service | builds `grapple/rope` (particle marcher); `draw` aims + fires it each tick |
| `release.service.ts` | service | `release` - fling along the look direction (`physics.releaseKick`), untag, restore gravity, kill the anchor |
| `debug.service.ts` | service | the live action-bar readout + per-tick chat log (`DEBUG`/`LOG` only) |
| `init.ts` | lifecycle | `grapple/init` (load-tagged): create objectives, seed constants |
| `tuning.ts` | constants | every knob **and the physics rationale behind each** - read this first |

The **web raycast is a separate plugin** (`spool/plugins/raycast`): `grapple.module.ts`
registers `dp.raycast({ name: "grapple/web", … onHit: anchor.place })`, so the recursive
marcher lives at `raycast/grapple/web`, not in this folder.

**library vs service:** `physics.ts` is the only pure-logic file - algebra on the
repo/scratch slots. Everything else is a *service* wiring those slots into actual
`.mcfunction`s (selectors, execute chains, summons, particles), and the *controller* is
the thin entry that calls a service.

## Runtime call flow

```
ATTACH  (player triggers, run as + at the player)
  grapple/start (controller) ─┬─ ray.fire → raycast/grapple/web  (raycast plugin;
                              │     recurse ^0.5 while air & steps remain)
                              │       └─ onHit = anchor.place: summon marker, read Pos
                              └─ if anchor placed → attach.latch:
                                    physics.fixRopeLength → rope_len_sq,
                                    tag @s grappling, stamp shared id, zero gravity

TICK    (grapple/tick is in the minecraft:tick function tag)
  grapple/tick (controller) ── swing.driveAll: as @a[grappling] at @s ─→ grapple/drive
       grapple/drive (swing.service):
         physics.senseSwingState  → pos, velocity, toAnchor, dist², dot (+ stash vel/prev)
         if DEBUG/LOG → debug.readout / debug.log
         launchInput ← 0  (slack-tick baseline; a zero impulse adds nothing)
         if taut (dist² ≥ rope²) → grapple/constrain = physics.solveConstraint
                  → assigns the rope correction into player_motion.launchInput
              → clamp → motion.applyGlobal (sustain; ADDS the impulse)
         rope.draw → grapple/rope  (particle line, hand → anchor)
         (slack tick: launchInput stays 0, engine gravity falls you untouched)

RELEASE
  grapple/stop (controller) ── release.release:
       physics.releaseKick (fling along look dir), untag grappling,
       restore gravity, kill this player's anchor (by shared id)
```

## Where the math connects

The physics is two helix primitives composed in `physics.ts`, nothing hand-rolled:

- **`ScoreVec3`** (helix) - three `Score`s as a vector. Positions, velocity,
  `toAnchor`, the anchor/prev state, and `player_motion`'s `launchInput` are all
  `ScoreVec3`s, so `toAnchor.assign(anchor).sub(pos)` is one line, not nine.
- **`Fixed`** (helix) - one `Score` as `value × scale`, the fixed-point **scalar**
  layer. `solveConstraint` expresses `coef`/`baum`/`frac` as `Fixed`; the
  precision-critical `frac.divide(dist²)` multiplies by the scale *before* the integer
  `/=` so it can't truncate to zero. See `tuning.ts` for why the scale is decimetres.

The solver's rope correction is written into `player_motion`'s `launchInput`; `drive`
clamps it, and `applyGlobal` **adds** it to the player's velocity for the tick - that
single handle is the **only** coupling to `player_motion`. Engine gravity is left on and
does the falling (no simulated gravity, no gravity-attribute poke - see `tuning.ts` for
why that was tried and dropped), so a slack tick's zero impulse is a clean no-op. Vector
steps stay on `ScoreVec3`; fixed-point
*vectors* were deliberately not built (the math mixes scale-10 positions with scale-100
squared lengths - a uniform-scale vector type would misfit).

## State (scoreboard objectives)

| objective | holds |
| --- | --- |
| `grapple.work` | all per-tick scratch (`#pos_*`, `#vel_*`, `#to_anchor_*`, `#dist_sq`, `#dot`, `#coef`, `#frac`, the rope step counter…). The **ray** step counter lives on `raycast.work` (the raycast plugin's) |
| `grapple.const` | seeded-once constants (`#neg_one`, `#frac_scale`, `#baum_div`, `#sustain_div`, `#radial_damp_div`, `#impulse_*`, `#next_id`) |
| `grapple.anchor_{x,y,z}` · `grapple.prev_{x,y,z}` | per-player anchor position and last-tick position (decimetres) |
| `grapple.rope_len_sq` | per-player fixed swing radius² (the constraint gates on it) |
| `grapple.id` | a shared id stamped on a player **and** their anchor, so `stop`/the rope can name exactly that anchor by scoreboard compare (no macros, multiplayer-safe) |

## Adding to it

It's a multi-file plugin, so everything lives in this folder (see
[../../../CLAUDE.md](../../../CLAUDE.md) for the spool plugin contract). Build only on
helix's public API and `player_motion`'s public handle. If you need a new math
primitive, add it to **helix** first (that's where `ScoreVec3`/`Fixed` live), then
compose it here.
