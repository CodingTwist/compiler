import { Color, Datapack, FunctionContext, Objective, Range, ScoreTarget, Selector, text } from "helix";

export type LogLevel = "debug" | "info" | "warn";

/** Severity rank: lower shows more. A player's stored score is their *minimum* rank to see. */
const SEVERITY: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2 };
/** One rank above `warn` - what `debug/log/off` resets a player's score to. */
const OFF_RANK = 3;

const LEVEL_STYLE: Record<LogLevel, { label: string; color: Color }> = {
  debug: { label: "DEBUG", color: Color.GRAY },
  info: { label: "INFO", color: Color.AQUA },
  warn: { label: "WARN", color: Color.YELLOW },
};

/** Per-namespace handle handed back by {@link Logger.for} - the only thing call sites hold. */
export interface NamespaceLogger {
  debug(ctx: FunctionContext, message: string): void;
  info(ctx: FunctionContext, message: string): void;
  warn(ctx: FunctionContext, message: string): void;
}

/**
 * A per-player, severity-threshold logger: each player has their own score on
 * one objective (unset = logging off for them), set via the generated
 * `debug/log/{debug,info,warn,off}` functions. A message at level `L` reaches
 * exactly the players whose score is `<= SEVERITY[L]` - so a player who sets
 * themselves to `debug` sees everything, `warn` sees only warnings, and a
 * player who never runs any of these commands sees nothing.
 *
 * Unlike a per-namespace on/off flag, the namespace passed to {@link for} is
 * only a label in the message - it does not gate anything - so it needs no
 * name to be reserved ahead of time and costs no extra scoreboard entry.
 *
 * `TWINE_LOG=off` is a build-time kill switch: it makes every emitted message
 * a true no-op (no commands at all), rather than one gated by a check that
 * always fails.
 */
export class Logger {
  private static readonly buildEnabled = process.env.TWINE_LOG !== "off";
  /** The instance {@link Logger.for} defers to - set once via {@link Logger.attach}. */
  private static current?: Logger;

  private readonly objective?: Objective;

  constructor(dp: Datapack, objectiveName = "LogLevel") {
    if (Logger.buildEnabled) this.objective = dp.objective(objectiveName);
  }

  /**
   * Makes `instance` the target of the static {@link Logger.for}. Call once,
   * before constructing anything whose functions might log - a module-level
   * `const log = Logger.for("Name")` elsewhere is safe to import at any time
   * (even before this runs) because its handles resolve {@link Logger.current}
   * lazily, at the point they're actually called with a `ctx`, not at import
   * time.
   */
  static attach(instance: Logger) {
    Logger.current = instance;
  }

  /**
   * A namespaced handle callable at module scope, with no instance to thread
   * through constructors - each method looks up {@link Logger.attach}'s
   * instance when actually called, not when `for` itself is called.
   */
  static for(namespace: string): NamespaceLogger {
    return {
      debug: (ctx, message) => Logger.current?.emit(ctx, "debug", namespace, message),
      info: (ctx, message) => Logger.current?.emit(ctx, "info", namespace, message),
      warn: (ctx, message) => Logger.current?.emit(ctx, "warn", namespace, message),
    };
  }

  /** Instance form of {@link Logger.for}, for callers already holding a `Logger`. */
  for(namespace: string): NamespaceLogger {
    return {
      debug: (ctx, message) => this.emit(ctx, "debug", namespace, message),
      info: (ctx, message) => this.emit(ctx, "info", namespace, message),
      warn: (ctx, message) => this.emit(ctx, "warn", namespace, message),
    };
  }

  /**
   * Builds `debug/log/{debug,info,warn,off}` - the commands a player runs to
   * set (or clear) their own severity threshold. Call once, before anything
   * that might call {@link for}'s handles actually builds - order doesn't
   * matter beyond that, since there is one objective, not one per namespace.
   */
  registerCommands(dp: Datapack, path = "debug/log") {
    if (!this.objective) return;
    const set = (level: LogLevel) =>
      dp.createFunction(`${path}/${level}`).build((ctx) => this.setLevel(ctx, level));
    set("debug");
    set("info");
    set("warn");
    dp.createFunction(`${path}/off`).build((ctx) => this.setLevel(ctx, "off"));
  }

  private setLevel(ctx: FunctionContext, level: LogLevel | "off") {
    const rank = level === "off" ? OFF_RANK : SEVERITY[level];
    this.objective!.score(ScoreTarget(Selector.self())).set(rank, ctx);
    ctx.tellraw(
      Selector.self(),
      text(level === "off" ? "Logging disabled" : `Log level set to ${level.toUpperCase()}`).color(Color.GRAY),
    );
  }

  private emit(ctx: FunctionContext, level: LogLevel, namespace: string, message: string) {
    if (!this.objective) return;
    const { label, color } = LEVEL_STYLE[level];
    ctx.execute()
      .as(Selector.allPlayers().score(this.objective, new Range(0, SEVERITY[level])))
      .run((c) =>
        c.tellraw(Selector.self(), [
          text(`[${label}] `).color(color),
          text(`[${namespace}] `).color(Color.GRAY),
          text(message),
        ]),
      );
  }
}
