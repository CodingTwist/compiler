// HAND-WRITTEN. Run a command only when a player is within range of a position
// (and, optionally, only while a re-arm guard entity is absent):
//   execute positioned <pos> if entity @a[distance=..<radius>] [unless entity <guard>] run <command>
// Used for proximity triggers - e.g. start a door's cog spin when a player walks
// up, gated on the cog not already existing so it doesn't restart every tick.
// Registered via EXTRA_HANDLERS in scripts/gen-commands.mjs, never regenerated.
import { generateSingleNode } from "../ir/generate";
import { ASTNode, FunctionNode, Range } from "../ir/node";
import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { arg, buildTokens, lit, raw } from "../ir/command-builder";
import { toCommandValue } from "../values/value";
import { FunctionContext } from "../frontend/context";
import { Selector } from "../frontend/nodes/selector";
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
     * When true, run the body `as` each matching player (so `@s` is that
     * player) - fires once per nearby player. When false (default), a single
     * `if entity` presence check that fires the body once regardless of how
     * many players are in range. Opt into the per-player form only when the
     * body actually needs the player handle.
     */
    public readonly perPlayer = false,
  ) {
    super();
  }
}

export class NearGuardHandler extends CommandHandler<NearGuardNode> {
  readonly type: NearGuardNode["type"] = "near_guard";

  generate(node: NearGuardNode, ctx: CodegenContext): void {
    const command = generateSingleNode(
      node.command,
      ctx.datapack,
      ctx.dispatcher,
    );
    // The proximity test is a real selector - `@a` within `distance=..radius` -
    // rendered by the selector layer, not a hand-built string.
    const near = Selector.allPlayers().distance(new Range(undefined, node.radius));
    const nearStr = toCommandValue(near).render(ctx.version);
    const guard = node.unlessSelector
      ? ` unless entity ${toCommandValue(node.unlessSelector).render(ctx.version)}`
      : "";
    // Presence check (`if entity`) runs the body once; per-player (`as`) runs it
    // once for each matching player with `@s` bound to them.
    const match = node.perPlayer
      ? `as ${nearStr}${guard}`
      : `if entity ${nearStr}${guard}`;
    // `positioned <pos>` is validated; the execute grammar after it stays raw so
    // the validator doesn't have to follow the execute redirect (see at_entity.ts
    // for the same reason).
    ctx.emit(
      buildTokens(ctx.version, [
        lit("execute"),
        lit("positioned"),
        arg(toCommandValue(node.pos).render(ctx.version)),
        raw(`${match} run ${command}`),
      ]),
    );
  }
}

declare module "../frontend/context" {
  interface FunctionContext {
    /**
     * Run each command emitted in `build` only when a player is within `radius`
     * blocks of `pos`. Pass `unlessSelector` to additionally gate on that entity
     * being absent (a re-arm guard, so a held-down trigger doesn't refire).
     *
     * By default this is a single presence check - `execute positioned <pos> if
     * entity @a[distance=..radius] … run <command>` - so the body runs **once**
     * no matter how many players are in range.
     *
     * Opt into a per-player handle by declaring a second `build` parameter: the
     * body then runs `as @a[distance=..radius]`, once **per** nearby player,
     * with the passed `Selector` (`@s`) bound to that player. Use this only when
     * the body needs the player (e.g. `ctx.tellraw(player, …)`); the extra
     * `as`-fan-out is why it isn't the default.
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
  // A `build` that declares the second (player) param opts into the per-player
  // `as` form; a one-arg builder keeps the cheap single presence check.
  const perPlayer = build.length >= 2;
  // Capture the builder's commands into a throwaway function, then re-emit each
  // wrapped in the proximity guard (one line per command). Inside the per-player
  // form, `@s` is the matched player.
  const tmp = new FunctionNode(this.fn.name);
  const child = new (this.constructor as new (
    fn: FunctionNode,
    v: VersionProfile,
  ) => FunctionContext)(tmp, this.version);
  build(child, Selector.self());
  for (const inner of tmp.nodes) {
    this.emit(new NearGuardNode(pos, radius, unlessSelector, inner, perPlayer));
  }
};
