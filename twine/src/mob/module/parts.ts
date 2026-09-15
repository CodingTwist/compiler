import {
  EntityType,
  Relation,
  Selector,
  displayPose,
  privateName,
} from "helix";
import type {
  Datapack,
  FunctionContext,
  FunctionRef,
  Objective,
  Quat,
  Score,
} from "helix";
import type { MobStates } from "../types";
import { memberPose, type ResolvedGesture } from "../gesture";
import type { MobDef } from "./types";

/** The state one mob's codegen shares: its definition, objectives, names and generated functions. */
export class MobParts<S extends string> {
  dp!: Datapack;
  /** Each generated function by short name (`summon`, a gesture), once registered. */
  readonly fns = new Map<string, FunctionRef>();
  /** One cooldown per gesture, so one gesture's cooldown doesn't block the others. */
  readonly cooldowns = new Map<string, Objective>();
  /** `#awake`: how many mobs the last wake found. */
  awakeObj!: Objective;
  /** `<mob>.state`: the 1-based index of the state a mob is in, 0 for none. */
  stateObj!: Objective;
  /** `<mob>.state_t`: polls left in a timed state. */
  stateClockObj?: Objective;
  handle!: MobStates<S>;
  /** Numbers the functions each {@link MobStates.byDifficulty} call emits. */
  byDifficultyCalls = 0;
  /** `rotate` (1.21.2+) turns the rig without reading NBT. */
  faceByRotate = false;

  constructor(readonly def: MobDef<S>) {}

  fnRef(short: string): FunctionRef {
    const ref = this.fns.get(short);
    if (!ref) {
      throw new Error(
        `Mob "${this.def.name}" has no "${short}" function yet - it registers after the module importing it, so read this from onLoad/onTick, not a constructor.`,
      );
    }
    return ref;
  }

  get name(): string {
    return this.def.name;
  }
  /** The rig's group name - every member is tagged with it (see `Display.named`). */
  get rig(): string {
    return `${this.name}_rig`;
  }
  get mobs(): Selector {
    return Selector.allEntities()
      .type(EntityType(this.def.nbt.entity))
      .tag(this.name);
  }
  /** Member 0 is the group root: the entity that actually rides the mob. */
  get rigRoots(): Selector {
    return this.def.model.rootSelector();
  }
  get awakeTag(): string {
    return `${this.name}.awake`;
  }
  /** Awake only to finish a gesture: no player near, so nothing new may fire. */
  get finishingTag(): string {
    return `${this.name}.finishing`;
  }
  /** Worn while a gesture is raised - cleared next tick, which starts the fall. */
  gestureTag(g: ResolvedGesture<S>): string {
    return `${this.name}.${g.name}`;
  }
  cooldown(g: ResolvedGesture<S>): Score {
    return this.cooldowns.get(g.name)!.score(Selector.self());
  }

  /** Records `fn` under `short` for {@link fnRef}. */
  add(short: string, fn: FunctionRef): FunctionRef {
    this.fns.set(short, fn);
    return fn;
  }

  /** A function only this mob's own tick tree calls: no dimension wrap, since it inherits the caller's. */
  internal(short: string, body: (ctx: FunctionContext) => void): FunctionRef {
    const fn = this.dp.createFunction(privateName(`${this.name}/${short}`));
    fn.build(body);
    return fn;
  }

  /**
   * Merges a pose onto each moving member. Run as the mob.
   *
   * Walks `passengers` so only this mob's rig is touched. Member 0 is the root (one hop);
   * others ride the root (two hops).
   */
  poseMembers(
    ctx: FunctionContext,
    /** Who to pose, or `undefined` for `@s` itself - no `as` hop. */
    self: Selector | undefined,
    g: ResolvedGesture<S>,
    /** The rotation to hold, or `undefined` for the model's own rest pose. */
    q: Quat | undefined,
    duration: number,
  ): void {
    for (const i of g.members) {
      const chain = ctx.execute();
      if (self) chain.as(self);
      chain.on(Relation.PASSENGERS);
      if (i !== 0) chain.on(Relation.PASSENGERS);
      chain.run((b) =>
        b
          .data()
          .merge()
          .entity(
            Selector.self().tag(`${this.rig}_${i}`),
            displayPose(memberPose(this.def.model, g, i, q), duration),
          ),
      );
    }
  }
}
