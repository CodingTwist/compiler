import { Objective } from "./objective";
import { FunctionNode, Range } from "../../ir/node";
import { ExecuteAsNode } from "../../commands/execute_as";
import { SelectorBase, SelectorNode, renderSelector } from "../../commands/selector";
import { FunctionContext } from "../context";
import { runInContext } from "../context/ambient";
import { Nbt } from "../../values/nbt";
import { PredicateRef } from "../../values/predicate";
import { Id } from "../../values/id";
import { Gamemode, Sort } from "../../values/enums";
import { VersionProfile } from "../../../versions/profile";
import type { EntityType } from "../../values/resource.generated";

export { SelectorBase };

export class SelectorScore {
  constructor(
    public readonly objective: Objective,
    public readonly range: Range,
  ) {}

  toString(): string {
    return `${this.objective.objective}=${this.range}`;
  }
}

/**
 * An axis-aligned selector volume: lower corner `x/y/z` (default: execution position) plus
 * `dx/dy/dz`.
 */
export interface SelectorVolume {
  x?: number;
  y?: number;
  z?: number;
  dx: number;
  dy: number;
  dz: number;
}

export class Selector {
  private scores = new Map<Objective, Range>();
  private tags: string[] = [];
  private limitValue?: number;
  private sortValue?: Sort;
  private teamValue?: string;
  private nameValue?: string;
  private volumeBox?: SelectorVolume;
  private distanceRange?: Range;
  private nbtValue?: Nbt;
  private predicateIds: string[] = [];
  private xRotationRange?: Range;
  private yRotationRange?: Range;
  private gamemodeValue?: string;
  private readonly notGamemodes: string[] = [];
  private entityTypeValue?: string;
  private yBandValue?: { y: number; dy: number };

  constructor(private base: SelectorBase) {}

  static allPlayers(): Selector {
    return new Selector(SelectorBase.ALL_PLAYERS);
  }
  static allEntities(): Selector {
    return new Selector(SelectorBase.ALL_ENTITIES);
  }
  static nearest(): Selector {
    return new Selector(SelectorBase.NEAREST_PLAYER);
  }
  static random(): Selector {
    return new Selector(SelectorBase.RANDOM_PLAYER);
  }
  static self(): Selector {
    return new Selector(SelectorBase.SELF);
  }
  /** A selector that is a bare entity UUID or player name (its own base form). */
  static uuid(id: string): Selector {
    return new Selector(id);
  }

  score(objective: Objective, range: Range): this {
    this.scores.set(objective, range);
    return this;
  }

  tag(name: string): this {
    this.tags.push(name);
    return this;
  }

  limit(n: number): this {
    this.limitValue = n;
    return this;
  }
  /** Orders results (`sort=`). Prefer `Sort.NEAREST` over a string. */
  sort(order: Sort): this {
    this.sortValue = order;
    return this;
  }
  team(name: string): this {
    this.teamValue = name;
    return this;
  }
  name(name: string): this {
    this.nameValue = name;
    return this;
  }

  /** Matches entities whose hitbox overlaps the box between two corners, in any order. */
  volume(from: readonly [number, number, number], to: readonly [number, number, number]): this {
    this.volumeBox = {
      x: Math.min(from[0], to[0]),
      y: Math.min(from[1], to[1]),
      z: Math.min(from[2], to[2]),
      dx: Math.abs(to[0] - from[0]),
      dy: Math.abs(to[1] - from[1]),
      dz: Math.abs(to[2] - from[2]),
    };
    return this;
  }

  /**
   * Matches entities overlapping a `dx/dy/dz` box from the execution position.
   * Vanilla adds 1 to each span, so `span(0, 0, 0)` is a 1-block cube.
   */
  span(dx: number, dy: number, dz: number): this {
    this.volumeBox = { dx, dy, dz };
    return this;
  }

  /** Matches entities within `range` of the execution position (`distance=`). */
  distance(range: Range): this {
    this.distanceRange = range;
    return this;
  }

  /**
   * A vertical band (`y=<y>,dy=<dy>`). `dy` is a signed offset, as in vanilla, not a
   * min/max.
   */
  yBand(y: number, dy: number): this {
    this.yBandValue = { y, dy };
    return this;
  }

  /** Restrict by vertical look angle (`x_rotation=<range>`). */
  xRotation(range: Range): this {
    this.xRotationRange = range;
    return this;
  }

  /** Restrict by horizontal look angle (`y_rotation=<range>`). */
  yRotation(range: Range): this {
    this.yRotationRange = range;
    return this;
  }

  /** Matches a game mode. Prefer `Gamemode.SURVIVAL` over a string. */
  gamemode(mode: Gamemode): this {
    this.gamemodeValue = mode;
    return this;
  }

  /** Excludes a game mode (`gamemode=!creative`). Repeat to exclude several. */
  notGamemode(mode: Gamemode): this {
    this.notGamemodes.push(mode);
    return this;
  }

  /** Matches one entity type. A string starting with `#` is passed through as a tag. */
  type(entityType: EntityType | string): this {
    this.entityTypeValue = typeof entityType === "string" ? entityType : entityType.render();
    return this;
  }

  /** Matches entities with `nbt`. Renders for the target version. */
  nbt(nbt: Nbt): this {
    this.nbtValue = nbt;
    return this;
  }

  /**
   * Matches entities passing a predicate (`predicate=<id>`). Repeat to require several.
   * Cheaper than inline `nbt={…}`.
   */
  predicate(ref: PredicateRef | Id | string): this {
    const id =
      ref instanceof PredicateRef ? ref.id : typeof ref === "string" ? Id(ref).render() : ref.render();
    this.predicateIds.push(id);
    return this;
  }

  build(): SelectorNode {
    return new SelectorNode(
      this.base,
      this.scores,
      this.tags,
      this.limitValue,
      this.sortValue,
      this.teamValue,
      this.nameValue,
      this.volumeBox,
      this.distanceRange,
      this.nbtValue,
      this.predicateIds,
      this.xRotationRange,
      this.yRotationRange,
      this.gamemodeValue,
      this.entityTypeValue,
      this.yBandValue,
      this.notGamemodes,
    );
  }

  /** The selector as text, so it can be passed to any command method. */
  toString(): string {
    return renderSelector(this.build());
  }

  /** `self` for `@s`, whatever its filters, since it can only pick the executor. */
  reach(): "self" | "world" {
    return this.base === SelectorBase.SELF ? "self" : "world";
  }

  /** Renders for a version, since an `nbt={…}` filter is version-dependent. */
  render(version?: VersionProfile): string {
    return renderSelector(this.build(), version);
  }

  run(fn: (ctx: FunctionContext) => void): (ctx: FunctionContext) => void {
    return (ctx: FunctionContext) => {
      // build a scratch function to capture the inner commands
      const inner = new FunctionNode(`__execute_as`);
      const innerCtx = new FunctionContext(inner, ctx.version);
      runInContext(innerCtx, fn);

      // each inner node gets wrapped in execute as
      for (const node of inner.nodes) {
        ctx.emit(new ExecuteAsNode(this.build(), node));
      }
    };
  }
}
