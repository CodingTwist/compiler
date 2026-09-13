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
  /** Undoes `setup`. Always runs after the check. */
  teardown?(ctx: FunctionContext): void;
}

export interface ProbeOptions {
  /** When `false`, emits nothing at all. Pass the build's dev flag. */
  enabled?: boolean;
  /** Function-path prefix. Defaults to `probe`, i.e. `/function <ns>:probe/run`. */
  name?: string;
}

const slug = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/**
 * In-game tests, run with `/function <ns>:probe/run`.
 *
 * Each case runs `setup`, waits `after` ticks, checks `expect`, then `teardown`. Cases run
 * one
 * after another so they never share the world. Results go to chat. Nothing runs on load or
 * tick.
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
   * Emits the suite and returns `<root>/run`, or `undefined` if disabled or empty. Call
   * once, after every `case`.
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
        // `store success` with no `run` gives both pass and fail from one detector, so no
        // negation is needed.
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
      passed.set(0);
      ctx.call(fns[0].setup);
    });
    return entry;
  }

  private result(ctx: FunctionContext, ok: Score, passed: Score, name: string): void {
    detect(ctx, Detect.score(ok, Range.exactly(1)), (c) => {
      c.tellraw(Selector.allPlayers(), [text("[PASS] ").color(Color.GREEN), text(name)]);
      passed.add(1);
    });
    detect(ctx, Detect.score(ok, Range.exactly(0)), (c) => {
      c.tellraw(Selector.allPlayers(), [text("[FAIL] ").color(Color.RED), text(name)]);
    });
  }
}
