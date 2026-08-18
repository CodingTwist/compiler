import { Objective } from "./objective";
import { FunctionNode, Range } from "../../ir/node";
import { ExecuteAsNode } from "../../commands/execute_as";
import { SelectorNode, renderSelector } from "../../commands/selector";
import { FunctionContext } from "../context";
import { runInContext } from "../context/ambient";
import { Nbt } from "../../values/nbt";
import { PredicateRef } from "../../values/predicate";
import { Id } from "../../values/id";
import { Gamemode, Sort } from "../../values/enums";
import { VersionProfile } from "../../../versions/profile";
import type { EntityType } from "../../values/resource.generated";

export type SelectorBase = "@a" | "@e" | "@p" | "@r" | "@s" | string;

export class SelectorScore {
  constructor(
    public readonly objective: Objective,
    public readonly range: Range,
  ) {}

  toString(): string {
    return `${this.objective.objective}=${this.range}`;
  }
}

/** An axis-aligned volume in selector terms: `x/y/z` lower corner + `dx/dy/dz` span. */
export interface SelectorVolume {
  x: number;
  y: number;
  z: number;
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

  constructor(private base: SelectorBase | string) {}

  static allPlayers(): Selector {
    return new Selector("@a");
  }
  static allEntities(): Selector {
    return new Selector("@e");
  }
  static nearest(): Selector {
    return new Selector("@p");
  }
  static random(): Selector {
    return new Selector("@r");
  }
  static self(): Selector {
    return new Selector("@s");
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
  /** Order multi-match results (`sort=`). Prefer the typed `Sort.NEAREST` over a bare string. */
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

  /**
   * Restrict to entities whose hitbox overlaps the axis-aligned box between two
   * corners (`x=…,y=…,z=…,dx=…,dy=…,dz=…`). Corner order doesn't matter - the
   * lower corner and absolute spans are derived. Replaces hand-built volume
   * selector strings.
   */
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
   * Restrict to entities within a distance range of the execution position
   * (`distance=<range>`). Pass a `Range` so e.g. `..6` (within 6 blocks) or
   * `2..` is modelled as a value, not a hand-built `distance=..6` string.
   */
  distance(range: Range): this {
    this.distanceRange = range;
    return this;
  }

  /**
   * A raw vertical position band (`y=<y>,dy=<dy>`) - the partial form of
   * {@link volume} with no x/z restriction. `dy` is a signed offset from `y`
   * (negative extends downward), matching vanilla's own field, not a min/max
   * pair - use this only when you genuinely mean "however far above/below one
   * point", not a min/max span (for that, prefer a location predicate).
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

  /** Restrict to a game mode (`gamemode=survival|creative|adventure|spectator`). Prefer the typed `Gamemode.SURVIVAL` over a bare string. */
  gamemode(mode: Gamemode): this {
    this.gamemodeValue = mode;
    return this;
  }

  /**
   * Exclude a game mode (`gamemode=!creative`). Repeatable - vanilla ANDs the
   * negations, which is the only way to say "anyone I can actually interact
   * with" (creative players ignore damage; spectators aren't there at all).
   */
  notGamemode(mode: Gamemode): this {
    this.notGamemodes.push(mode);
    return this;
  }

  /**
   * Restrict to one entity type (`type=<id>`). Accepts a typed `EntityType`
   * (`EntityType.ENDERMAN`) or a raw id string - a leading `#` is a registry
   * tag reference (`type=#tunnel:removable`), passed through as-is rather than
   * routed through `EntityType(...)`'s id validation (which expects a bare
   * `minecraft:entity_type` id, not a tag).
   */
  type(entityType: EntityType | string): this {
    this.entityTypeValue = typeof entityType === "string" ? entityType : entityType.render();
    return this;
  }

  /**
   * Restrict to entities matching `nbt` (`nbt={…}`). Pass an `Nbt` value rather
   * than a hand-built SNBT string so it renders version-aware at codegen.
   */
  nbt(nbt: Nbt): this {
    this.nbtValue = nbt;
    return this;
  }

  /**
   * Restrict to entities passing a registered predicate (`predicate=<id>`).
   * Accepts a {@link PredicateRef} (from `dp.predicate(...)`), an {@link Id}, or
   * a raw id string. This is the cheap, engine-evaluated stand-in for inlining
   * an `nbt={…}` match into the selector - register the check once as a
   * `Predicate`, reference it everywhere. Repeatable to AND several predicates.
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

  /**
   * The selector's command-string form, so a `Selector` can be passed directly
   * as an argument to any command method (which stringify their args).
   */
  toString(): string {
    return renderSelector(this.build());
  }

  /**
   * `CommandValue` form. Most selector args are version-neutral, but an `nbt={…}`
   * arm renders its `Nbt` version-aware, so the codegen version is threaded
   * through here. Lets a `Selector` be passed to any concept-typed entity
   * argument (`entity`, `score_holder`, ...).
   */
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
