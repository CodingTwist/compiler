# CLAUDE.md - proof

Runs a helix pack inside a **real headless Minecraft server**, so game behaviour (and its drift
across versions) fails a test instead of going unnoticed. Dev-only: nothing here ships.

Nothing asserted here goes through a command. A small Java agent in `agent/` is compiled
straight against the vanilla server jar and reads live objects - `Entity.getDeltaMovement()`,
`LivingEntity.getHealth()`, `Entity.getPassengers()`. Both modes below run under vanilla's own
`GameTestServer`, which creates the world, loads the pack and isolates each test.

## Two modes

| Mode         | The test is…                          | Run it with           |
| ------------ | ------------------------------------- | --------------------- |
| **live**     | TypeScript (`tests/live/*.test.ts`)   | `npm test`            |
| **gametest** | Java (`agent/tests/proof/*.java`)     | `npm run test:mc`     |

Same JVM, same code path. The agent registers every `@Test` method as a test function, plus one
extra (`proof_live:session`) that opens a socket and serves the TypeScript API from inside a
running test.

### Live

```ts
const mc = await useServer(dp);              // boots once per process, ~5s
await mc.fn(`proof:${golem.summon.getName()}`, [2, 2, 2]);
await mc.tick(20);                           // exactly 20 ticks
const g = await mc.entity({ tag: "golem" });
expect(g.health).toBeGreaterThan(0);
expect(g.passengers).toHaveLength(1);
```

`mc` gives `tick/cmd/fn/entities/entity/block/score/reset/stop`. Positions are relative to the
test area. A request that goes unanswered for 60s reports instead of hanging.

### Gametest

```java
@Test(maxTicks = 60)
static void golemSummonsWithItsRig(GameTestHelper h) { … }
```

Java is the single source of truth for the test list: `Discovery` scans the compiled classes and
writes one `minecraft:test_instance` JSON per method. Nothing about tests lives in TypeScript,
and helix emits no test JSON.

- `tests/pack.ts` is the pack under test, shared by both modes - put the helix/spool code you
  want to exercise there, not in the test files.
- To play with the same pack by hand: `proof install <world-folder>` writes it to the world's
  `datapacks/`, then `/reload` and call the functions. The test run itself can't be watched -
  `GameTestServer` opens no port, so nothing can connect to it.
- After changing helix or spool, **build them** (proof consumes their `dist/`).

## Things that bite

- **The server thread is parked between `mc.tick()` calls.** The session test blocks inside a
  `runAtTickTime` callback, so every read sees a settled world and one released permit is
  exactly one tick. Don't reach for `tick freeze` / `tick step`.
- `GameTestHelper.onEachTick` eagerly schedules a runnable for *every* tick up to the timeout,
  so it OOMs on a large `max_ticks`. Self-reschedule with `runAtTickTime(getTick() + 1, …)`.
- `succeedOnTickWhen(n, …)` **fails** a condition that was already true before tick `n`. To
  assert state at a tick, use `runAtTickTime(n, …)` then `succeed()` (the `at` helper in
  `MobTests`).
- **A test area is also the only region that keeps ticking.** Tests run side by side in one
  world, so anything placed or summoned outside the area lands in a neighbour's - where
  entities silently freeze (no gravity, no AI) instead of failing. That is why `@Test`
  defaults to `proof:area` (16x8x16, written by `Area.java`) rather than `minecraft:empty`,
  which is one block across. Keep a test inside its area, and scan for entities within
  `h.getBounds()` - `getAllEntities()` is level-wide and will hand you another test's mob.
- `findEntities` clips to the structure bounds and takes a **relative** position, so a search
  from an absolute one quietly finds nothing. Reaching through the entity you already have
  (`getPassengers`) is both simpler and a sharper claim.
- An **optional** test (`required = false`) that fails is reported as `<skipped>` by the
  runner, which the CLI prints as `XFAIL`.
- Request arguments must never be named `id`: it would shadow the wire envelope's own id and
  the reply would match no waiter.
- One server is shared by every live test file, so `vitest.config.mts` pins them to one process
  (`isolate: false`, no file parallelism). Don't undo that.
- `launch()` kills the JVM on process exit: a leaked one holds the world lock.

## Version coupling

Everything in `agent/` is written against **26.3**, whose server jar is shipped deobfuscated -
that is what lets `javac --release 21 -cp <server jar>` work with no Fabric, no mappings, no
Mixin and no Gradle. `TestFunctionLoader`, `GameTestMainUtil` and friends are not a stable API;
a version bump may need the Java touched. That is the accepted cost of reading real state.
