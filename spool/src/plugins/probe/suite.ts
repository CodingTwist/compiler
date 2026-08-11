import {
  Color,
  Datapack,
  Detect,
  detect,
  FunctionContext,
  FunctionRef,
  Range,
  Score,
  ScoreTarget,
  Selector,
  Time,
  text,
} from "helix";
import type { Detector } from "helix";

/** One in-game test: do something, wait, then check the world says what it should. */
export interface ProbeCase {
  /** Put the world into the state under test. Omit for a case that only observes. */
  setup?(ctx: FunctionContext): void;
  /** Ticks between `setup` and the check - long enough for whatever is being tested to happen. */
  after?: number;
  /** The condition that must hold. Any {@link Detector}, so `Detect.all(...)` composes. */
  expect: Detector;
  /** Undo `setup` - kill spawned entities, restore blocks. Runs after the check either way. */
  teardown?(ctx: FunctionContext): void;
}

export interface ProbeOptions {
  /**
   * When `false`, every `case()` and `run()` is a **true** no-op: no functions,
   * no objective, nothing in the emitted pack. Pass the build's dev flag here
   * rather than wrapping call sites in `if`.
   */
  enabled?: boolean;
  /** Function-path prefix. Defaults to `probe`, i.e. `/function <ns>:probe/run`. */
  name?: string;
}

const slug = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/**
 * A suite of in-game tests, run by a human typing `/function <ns>:probe/run`.
 *
 * Unit tests assert on *emitted text*; this asserts on the *running world* -
 * that the shell actually lands, that the impulse actually decays. Each case is
 * `setup` → wait `after` ticks → evaluate `expect` → `teardown`, and cases run as
 * a **serial chain** (each check schedules the next setup a tick later) so two
 * tests can never share a world at the same moment. Results arrive as `tellraw`
 * PASS/FAIL lines plus a final tally.
 *
 * Nothing is tagged `load`/`tick`: an unrun suite costs zero commands per tick.
 * A disabled suite costs zero *files* - see {@link ProbeOptions.enabled}.
 */
export class Suite {
  private readonly enabled: boolean;
  private readonly root: string;
  private readonly cases: { name: string; spec: ProbeCase }[] = [];

  constructor(
    private readonly dp: Datapack,
    opts: ProbeOptions = {},
  ) {
    this.enabled = opts.enabled ?? true;
    this.root = opts.name ?? "probe";
  }

  /** Add a case. No-op (and nothing retained) when the suite is disabled. */
  case(name: string, spec: ProbeCase): this {
    if (this.enabled) this.cases.push({ name, spec });
    return this;
  }

  /**
   * Emit the suite. Returns the entry point (`<root>/run`), or `undefined` when
   * disabled or empty. Call once, after every `case`.
   */
  run(): FunctionRef | undefined {
    if (!this.cases.length) return undefined;

    const obj = this.dp.objective("Probe");
    const ok = obj.score(ScoreTarget("#ok"));
    const passed = obj.score(ScoreTarget("#passed"));
    const total = this.cases.length;

    const report = this.dp.createFunction(`${this.root}/report`);
    report.build((ctx) => {
      ctx.tellraw(Selector.allPlayers(), [
        text("[probe] ").color(Color.GRAY),
        passed,
        text(`/${total} passed`),
      ]);
    });

    // Refs first, bodies second: each check schedules the *next* case's setup.
    const fns = this.cases.map(({ name, spec }) => {
      const path = `${this.root}/${slug(name)}`;
      return {
        name,
        spec,
        setup: this.dp.createFunction(`${path}/setup`),
        check: this.dp.createFunction(`${path}/check`),
      };
    });

    fns.forEach((f, i) => {
      f.setup.build((ctx) => {
        f.spec.setup?.(ctx);
        ctx.schedule().function_(this.dp.idOf(f.check), Time(f.spec.after ?? 1));
      });

      f.check.build((ctx) => {
        // `store success` with no `run`: the conditions themselves are the
        // command, so one emission of the detector yields both branches - no
        // negated detector needed (there is no `Detect.any`/`not`).
        const chain = ctx.execute().storeSuccessScore(ok);
        f.spec.expect(chain);
        chain.done();

        this.result(ctx, ok, passed, f.name);
        f.spec.teardown?.(ctx);

        const next = fns[i + 1]?.setup ?? report;
        ctx.schedule().function_(this.dp.idOf(next), Time(1));
      });
    });

    const entry = this.dp.createFunction(`${this.root}/run`);
    entry.build((ctx) => {
      passed.set(0, ctx);
      ctx.call(fns[0].setup);
    });
    return entry;
  }

  private result(ctx: FunctionContext, ok: Score, passed: Score, name: string): void {
    detect(ctx, Detect.score(ok, Range.exactly(1)), (c) => {
      c.tellraw(Selector.allPlayers(), [text("[PASS] ").color(Color.GREEN), text(name)]);
      passed.add(1, c);
    });
    detect(ctx, Detect.score(ok, Range.exactly(0)), (c) => {
      c.tellraw(Selector.allPlayers(), [text("[FAIL] ").color(Color.RED), text(name)]);
    });
  }
}
