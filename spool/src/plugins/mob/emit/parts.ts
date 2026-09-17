import {
  EntityType,
  Selector,
} from "helix";
import type {
  Datapack,
  FunctionContext,
  FunctionRef,
  Objective,
  Quat,
  Score,
} from "helix";
import type { Rig } from "../../rig";
import type { MobStates } from "../types";
import { memberPose, type ResolvedGesture } from "../gesture";
import type { MobDef, MobFn } from "./types";

/** The state one mob's codegen shares: its definition, objectives, names and generated functions. */
export class MobParts<S extends string> {
  dp!: Datapack;
  /** Creates a function callable from outside the tick tree, e.g. wrapped in a dimension. */
  fn!: MobFn;
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
  /** The model riding each mob. */
  rig!: Rig;

  constructor(readonly def: MobDef<S>) {}

  fnRef(short: string): FunctionRef {
    const ref = this.fns.get(short);
    if (!ref) {
      throw new Error(
        `Mob "${this.def.name}" has no "${short}" function yet - read it after the mob registers (in a twine module: from onLoad/onTick, not a constructor).`,
      );
    }
    return ref;
  }

  get name(): string {
    return this.def.name;
  }
  get mobs(): Selector {
    return Selector.allEntities()
      .type(EntityType(this.def.nbt.entity))
      .tag(this.name);
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
    const fn = this.dp.createFunction(short);
    fn.build(body);
    return fn;
  }

  /** Poses a gesture's members at `q`, or at rest when `q` is `undefined`. Run as the mob, or pass `self`. */
  poseMembers(
    ctx: FunctionContext,
    self: Selector | undefined,
    g: ResolvedGesture<S>,
    q: Quat | undefined,
    duration: number,
  ): void {
    this.rig.pose(ctx, self, g.members, (i) => memberPose(this.def.model, g, i, q), duration);
  }
}
