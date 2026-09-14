import { ASTNode, Range } from "../ir/node";
import type { Objective } from "../frontend/nodes/objective";
import type { SelectorVolume } from "../frontend/nodes/selector";
import type { Nbt } from "../values/nbt";
import type { VersionProfile } from "../../versions/profile";
import { CodegenContext, CommandHandler } from "../ir/commandhandler";
import { Sort } from "../values/enums";

/** Selector target variables. A base may also be a player name or UUID. */
export const SelectorBase = {
  ALL_PLAYERS: "@a",
  ALL_ENTITIES: "@e",
  NEAREST_PLAYER: "@p",
  RANDOM_PLAYER: "@r",
  SELF: "@s",
} as const;
export type SelectorBase = (typeof SelectorBase)[keyof typeof SelectorBase] | string;

export class SelectorNode extends ASTNode {
  type = "selector" as const;
  constructor(
    public readonly base: SelectorBase,
    public readonly scores: Map<Objective, Range> = new Map(),
    public readonly tags: string[] = [],
    public readonly limit?: number,
    public readonly sort?: Sort,
    public readonly team?: string,
    public readonly playerName?: string,
    public readonly volume?: SelectorVolume,
    public readonly distance?: Range,
    public readonly nbt?: Nbt,
    public readonly predicates: string[] = [],
    public readonly xRotation?: Range,
    public readonly yRotation?: Range,
    public readonly gamemode?: string,
    public readonly entityType?: string,
    public readonly yBand?: { y: number; dy: number },
    public readonly notGamemodes: string[] = [],
  ) {
    super();
  }

  /** Whether it picks at most one entity. */
  picksOne(): boolean {
    if (this.limit !== undefined) return this.limit === 1;
    return this.base !== SelectorBase.ALL_PLAYERS && this.base !== SelectorBase.ALL_ENTITIES;
  }

  /** Whether it can pick a different entity each time it runs, all else equal. */
  picksRandomly(): boolean {
    return this.base === SelectorBase.RANDOM_PLAYER || this.sort === Sort.RANDOM;
  }

  /** Whether it tests scores, NBT or predicates. */
  readsState(): boolean {
    return this.scores.size > 0 || this.nbt !== undefined || this.predicates.length > 0;
  }

  /** Whether it is plain `@s` with no filters, so it always picks the executor. */
  isBareSelf(): boolean {
    return (
      this.base === SelectorBase.SELF &&
      this.scores.size === 0 &&
      this.tags.length === 0 &&
      this.limit === undefined &&
      this.sort === undefined &&
      this.team === undefined &&
      this.playerName === undefined &&
      this.volume === undefined &&
      this.distance === undefined &&
      this.nbt === undefined &&
      this.predicates.length === 0 &&
      this.xRotation === undefined &&
      this.yRotation === undefined &&
      this.gamemode === undefined &&
      this.entityType === undefined &&
      this.yBand === undefined &&
      this.notGamemodes.length === 0
    );
  }

  /** Whether resolving it searches entities, rather than naming the executor, a player or a UUID. */
  scans(): boolean {
    return Object.values(SelectorBase).some((b) => b === this.base) && this.base !== SelectorBase.SELF;
  }
}

/**
 * Renders a selector to text, e.g. `@e[scores={x=1..},tag=y]`. Shared by the handler and
 * `Selector.toString`.
 */
export function renderSelector(
  node: SelectorNode,
  version?: VersionProfile,
  opts: { existence?: boolean } = {},
): string {
  const args: string[] = [];

  if (node.scores.size > 0) {
    const scoreStr = Array.from(node.scores.entries())
      .map(([obj, range]) => `${obj.objective}=${range}`)
      .join(",");
    args.push(`scores={${scoreStr}}`);
  }

  if (node.volume) {
    const v = node.volume;
    if (v.x !== undefined) args.push(`x=${v.x}`, `y=${v.y}`, `z=${v.z}`);
    args.push(`dx=${v.dx}`, `dy=${v.dy}`, `dz=${v.dz}`);
  }

  if (node.distance) args.push(`distance=${node.distance}`);
  if (node.xRotation) args.push(`x_rotation=${node.xRotation}`);
  if (node.yRotation) args.push(`y_rotation=${node.yRotation}`);
  if (node.gamemode) args.push(`gamemode=${node.gamemode}`);
  for (const mode of node.notGamemodes) args.push(`gamemode=!${mode}`);
  if (node.entityType) args.push(`type=${node.entityType}`);
  if (node.yBand) args.push(`y=${node.yBand.y}`, `dy=${node.yBand.dy}`);

  for (const tag of node.tags) args.push(`tag=${tag}`);
  for (const predicate of node.predicates) args.push(`predicate=${predicate}`);
  if (node.team) args.push(`team=${node.team}`);
  if (node.playerName) args.push(`name=${node.playerName}`);
  // An existence test only needs one match, so `limit=1` lets the engine stop early.
  const limit =
    node.limit ?? (opts.existence && !node.picksOne() ? 1 : undefined);
  if (limit !== undefined) args.push(`limit=${limit}`);
  if (node.sort !== undefined) args.push(`sort=${node.sort}`);
  if (node.nbt) {
    // nbt selectors need a version. Only the version-less `toString()` path gets here.
    if (!version) throw new Error("Selector.nbt() requires a version to render; use it via a version-aware command (e.g. atEntity), not toString().");
    args.push(`nbt=${node.nbt.render(version)}`);
  }

  return args.length > 0 ? `${node.base}[${args.join(",")}]` : node.base;
}

/**
 * Renders a selector for `if`/`unless entity`, adding `limit=1` to unbounded `@e`/`@a`.
 *
 * Only safe when the count isn't read, i.e. the chain goes on to `run`. Raw strings pass
 * through.
 */
export function renderExistence(
  sel: { build(): SelectorNode } | string,
  version?: VersionProfile,
): string {
  return typeof sel === "string" ? sel : renderSelector(sel.build(), version, { existence: true });
}

export class SelectorCommand extends CommandHandler<SelectorNode> {
  readonly type: SelectorNode["type"] = "selector";

  generate(node: SelectorNode, ctx: CodegenContext): void {
    ctx.emit(renderSelector(node, ctx.version));
  }

  resolve(node: SelectorNode): string {
    return renderSelector(node);
  }
}
