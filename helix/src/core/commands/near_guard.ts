// HAND-WRITTEN. Runs a command only when a player is near a position, optionally only while
// a guard entity is absent:
//   execute positioned <pos> if entity @a[distance=..<radius>] [unless entity <guard>] run <command>
// Registered via EXTRA_HANDLERS in scripts/gen-commands.mjs, never regenerated.
import { generateSingleNodeLine, runClause } from "../ir/generate";
import { chainLine, pureClause } from "../ir/line-info";
import { ASTNode, FunctionNode, Range } from "../ir/node";
import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { arg, buildTokens, lit, raw } from "../ir/command-builder";
import { toCommandValue } from "../values/value";
import { FunctionContext } from "../frontend/context";
import { Selector } from "../frontend/nodes/selector";
import { renderExistence } from "./selector";
import { runInContext } from "../frontend/context/ambient";
import { Pos } from "../values";
import { VersionProfile } from "../../versions/profile";

export class NearGuardNode extends ASTNode {
  type = "near_guard" as const;
  constructor(
    /** Position to measure distance from. */
    public readonly pos: Pos,
    /** Trigger when a player is within this many blocks (`distance=..radius`). */
    public readonly radius: number,
    /** Optional re-arm guard: only run while no entity matches this selector. */
    public readonly unlessSelector: Selector | undefined,
    public readonly command: ASTNode,
    /**
     * When true, runs the body as each nearby player (`@s` is the player). Default false:
     * runs once.
     */
    public readonly perPlayer = false,
  ) {
    super();
  }
}

export class NearGuardHandler extends CommandHandler<NearGuardNode> {
  readonly type: NearGuardNode["type"] = "near_guard";

  generate(node: NearGuardNode, ctx: CodegenContext): void {
    const { cmd: command, info } = generateSingleNodeLine(
      node.command,
      ctx.datapack,
      ctx.dispatcher,
    );
    // A real `@a[distance=..radius]` selector, not a hand-built string.
    const near = Selector.allPlayers().distance(new Range(undefined, node.radius));
    const nearStr = node.perPlayer
      ? toCommandValue(near).render(ctx.version)
      : renderExistence(near, ctx.version);
    const guard = node.unlessSelector
      ? ` unless entity ${renderExistence(node.unlessSelector, ctx.version)}`
      : "";
    // `if entity` runs once; `as` runs once per matching player.
    const match = node.perPlayer
      ? `as ${nearStr}${guard}`
      : `if entity ${nearStr}${guard}`;
    // `positioned <pos>` is validated; the rest is raw since the validator can't follow
    // execute's redirect.
    const pos = toCommandValue(node.pos).render(ctx.version);
    ctx.emit(
      buildTokens(ctx.version, [
        lit("execute"),
        lit("positioned"),
        arg(pos),
        raw(`${match} ${runClause(command)}`),
      ]),
      // The player test re-runs on every line, so only `positioned` can be shared.
      chainLine([pureClause(`positioned ${pos}`), undefined], info),
    );
  }
}

declare module "../frontend/context" {
  interface FunctionContext {
    /**
     * Runs each command from `build` only when a player is within `radius` of `pos`.
     * `unlessSelector` also requires that entity to be absent, so a held trigger doesn't
     * refire.
     *
     * Runs once regardless of player count. Give `build` a second parameter to run once per
     * nearby
     * player with that player as `@s`; only do this when the body needs the player.
     */
    whenPlayerNear(
      pos: Pos,
      radius: number,
      build: (ctx: FunctionContext, player: Selector) => void,
      unlessSelector?: Selector,
    ): void;
  }
}

FunctionContext.prototype.whenPlayerNear = function (
  this: FunctionContext,
  pos: Pos,
  radius: number,
  build: (ctx: FunctionContext, player: Selector) => void,
  unlessSelector?: Selector,
): void {
  // A two-parameter `build` opts into the per-player form.
  const perPlayer = build.length >= 2;
  // Capture the commands into a throwaway function, then re-emit each with the guard.
  const tmp = new FunctionNode(this.fn.name);
  const child = new (this.constructor as new (
    fn: FunctionNode,
    v: VersionProfile,
  ) => FunctionContext)(tmp, this.version);
  runInContext(child, (c) => build(c, Selector.self()));
  for (const inner of tmp.nodes) {
    this.emit(new NearGuardNode(pos, radius, unlessSelector, inner, perPlayer));
  }
};
