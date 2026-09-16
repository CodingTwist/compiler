# CLAUDE.md - proof

Runs a helix pack inside a **real headless Minecraft server**, so game behaviour (and its drift
across versions) fails a test instead of going unnoticed. Dev-only: nothing here ships.

## Two modes

| Mode         | The test is…                        | Use it for                                         |
| ------------ | ----------------------------------- | -------------------------------------------------- |
| **live**     | TypeScript (`tests/live/*.test.ts`) | Everything. Assertions are plain vitest.           |
| **gametest** | compiled into the pack (`defineTest`) | Cases that must run exactly the way a pack ships. |

Live mode needs no Java mod: `data get`, `scoreboard players get`, `execute if entity` and
`tick step` already report to the server console, and `src/live/mc.ts` parses that back into
values. Prefer it.

```ts
const mc = await useServer(dp);          // boots once per process, ~5s
await mc.cmd(`execute positioned ${ORIGIN} run function proof:${mob.summon.getName()}`);
await mc.tick(20);                       // exactly 20 ticks
expect(await mc.count("@e[tag=golem]")).toBe(1);
expect(await mc.data("entity @e[tag=golem,limit=1]", "Health")).toBeGreaterThan(0);
```

- `npm test` runs the live suite; `npm run test:mc` runs the gametest one.
- `tests/live/pack.ts` is the pack under test - put the helix/spool code you want to exercise
  there, not in the test files.
- After changing helix or spool, **build them** (proof consumes their `dist/`).

## Things that bite

- The server is **frozen** between `mc.tick()` calls, so reads are stable. `tick sprint N`
  secretly runs N+1 ticks, which is why `tick()` uses `tick step` and confirms against
  `time query gametime`.
- The world in `.build/live` is **reused**, so boot kills leftover entities; tests should
  `beforeEach(() => mc.reset())` too.
- One server is shared by every test file, so `vitest.config.mts` pins them to one process
  (`isolate: false`, no file parallelism). Don't undo that.
- `boot()` kills the server on process exit: a leaked one holds the world lock and the next
  run can't start.
