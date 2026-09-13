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
 * A per-player logger with severity levels.
 *
 * Players pick a level with `debug/log/{debug,info,warn,off}` and see messages at or above
 * it.
 * Players who never set one see nothing. The namespace is just a label, not a filter.
 * `TWINE_LOG=off` removes all log commands at build time.
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
   * Sets the instance {@link Logger.for} handles use. Call once, before anything logs.
   *
   * Handles look it up when called, so `Logger.for` at module scope is safe before this
   * runs.
   */
  static attach(instance: Logger) {
    Logger.current = instance;
  }

  /** A namespaced log handle usable at module scope. */
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

  /** Builds the `debug/log/{debug,info,warn,off}` commands. Call once. */
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
    this.objective!.score(ScoreTarget(Selector.self())).set(rank);
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
