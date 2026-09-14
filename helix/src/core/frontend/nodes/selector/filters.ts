// The filter setters of `Selector` (`tag=`, `distance=`, `type=`…); each returns the selector.
import { Range } from "../../../ir/node";
import { SelectorBase } from "../../../commands/selector";
import { Nbt } from "../../../values/nbt";
import { PredicateRef } from "../../../values/predicate";
import { Id } from "../../../values/id";
import { Gamemode, Sort } from "../../../values/enums";
import type { EntityType } from "../../../values/resource.generated";
import { Objective } from "../objective";
import type { SelectorVolume } from "./types";

/** Selector filters. Builders mutate in place, so don't share one across clauses. */
export class SelectorFilters {
  protected scores = new Map<Objective, Range>();
  protected tags: string[] = [];
  protected limitValue?: number;
  protected sortValue?: Sort;
  protected teamValue?: string;
  protected nameValue?: string;
  protected volumeBox?: SelectorVolume;
  protected distanceRange?: Range;
  protected originValue?: readonly [number, number, number];
  protected nbtValue?: Nbt;
  protected predicateIds: string[] = [];
  protected xRotationRange?: Range;
  protected yRotationRange?: Range;
  protected gamemodeValue?: string;
  protected readonly notGamemodes: string[] = [];
  protected entityTypeValue?: string;
  protected yBandValue?: { y: number; dy: number };

  constructor(protected base: SelectorBase) {}

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

  /**
   * Matches entities within `range` of a fixed point (`x=,y=,z=,distance=`).
   * Unlike a bare `distance`, it doesn't depend on where the command runs, and the engine
   * only searches nearby chunks.
   */
  near(pos: readonly [number, number, number], range: Range): this {
    this.originValue = pos;
    this.distanceRange = range;
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

  /** Matches one entity type, or a tag via `EntityType("#ns:tag")` / `dp.entityTypeTag`. */
  type(entityType: EntityType): this {
    this.entityTypeValue = entityType.render();
    return this;
  }

  /** Matches the same entity type as `other`, if it has one. */
  typeOf(other: SelectorFilters): this {
    this.entityTypeValue = other.entityTypeValue;
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
}
