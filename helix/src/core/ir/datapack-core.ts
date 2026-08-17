// The bottom third of `Datapack`: the pack's identity, its function/objective
// tables, and the bookkeeping (finalizers, structure sources) everything else
// builds on. `DatapackResources` extends this with the resource registries and
// `Datapack` extends that with the codegen/entry-point surface. Split only for
// file size - it is one class to authors.
import { Objective, ObjectiveKind } from "../frontend";
import { FunctionNode } from "./node";
import { FunctionRef } from "../function_ref";
import { VersionProfile } from "../../versions/profile";
import type { ClearFill } from "../codegen/structure";
import { ScoreboardTiming } from "../timing/scoreboard-timing";
import { DEFAULT_TARGET, RuntimeTarget } from "./target";

export type FunctionTag = "load" | "tick";

export class DatapackCore {
  name: string;
  readonly version: VersionProfile;
  /**
   * The runtime this build targets (see {@link RuntimeTarget}). Read at codegen
   * via `ctx.target`; only `ctx.native(...)` ops branch on it. Set per build so
   * the same source compiles to a portable `"vanilla"` pack and a `"paper"`
   * server pack. Swap via {@link useTarget}.
   */
  target: RuntimeTarget;
  functions: Map<string, FunctionNode> = new Map();
  protected objectives = new Map<string, Objective>();
  public files = new Map<string, string>();
  public tags = new Map<FunctionTag, Set<string>>();

  /** How run-for-a-duration / periodic timing compiles. */
  readonly timing = new ScoreboardTiming();
  private finalizers: (() => void)[] = [];
  private finalizersRun = false;
  private structureDirs: string[] = [];
  // `_clear` structure variants a clip explicitly requested (see `Clip.clearWith`),
  // keyed by the source structure's path within this namespace (no `<ns>:` prefix,
  // no `.nbt`) - codegen derives only these, each filled with the chosen block.
  private clearVariants = new Map<string, ClearFill>();

  constructor(
    name: string,
    version: VersionProfile,
    target: RuntimeTarget = DEFAULT_TARGET,
  ) {
    this.name = name.toLowerCase();
    this.version = version;
    this.target = target;
  }

  /**
   * Ship every `.nbt` under `dir` (recursively) into this pack's structure
   * folder - `data/<ns>/<structure|structures>/<relative path>.nbt`, picking the
   * folder name from the target version. A file `cog.nbt` becomes the template
   * id `<ns>:cog`, loadable with `/place template` (see {@link Clip.swaps}).
   * Copied verbatim at {@link Datapack.writeDatapack} time (binary, not generated).
   */
  addStructures(dir: string): this {
    this.structureDirs.push(dir);
    return this;
  }

  /** Source directories registered via {@link addStructures}, for codegen. */
  get structureSources(): readonly string[] {
    return this.structureDirs;
  }

  /**
   * Register a derived `_clear` variant of a shipped structure (see
   * {@link Clip.clearWith}): `structureId` is the structure's `/place template`
   * id (`<ns>:path` or bare `path`); `fill` is the block its solid cells become.
   * codegen emits `<path>_clear.nbt` with that single-block palette and the air
   * cells dropped. Requesting the same structure with a conflicting fill throws.
   */
  requestClearVariant(structureId: string, fill: ClearFill): void {
    const key = structureId.includes(":")
      ? structureId.slice(structureId.indexOf(":") + 1)
      : structureId;
    const existing = this.clearVariants.get(key);
    if (existing && existing.Name !== fill.Name) {
      throw new Error(
        `Structure "${key}" already has a _clear fill of ${existing.Name}; ` +
          `cannot also clear it with ${fill.Name}.`,
      );
    }
    this.clearVariants.set(key, fill);
  }

  /** Requested `_clear` variants (path → fill block), for codegen. */
  get clearStructureVariants(): ReadonlyMap<string, ClearFill> {
    return this.clearVariants;
  }

  /** Set the runtime this build targets (default: `"vanilla"`). See {@link RuntimeTarget}. */
  useTarget(target: RuntimeTarget): this {
    this.target = target;
    return this;
  }

  /**
   * Register work to run once at datapack finalisation (before codegen), after
   * all authoring is done - used by deferred emitters like {@link AnimatedDisplay}
   * so chained config (e.g. `.forSeconds(...)`) is settled before they emit.
   */
  onFinalize(fn: () => void) {
    this.finalizers.push(fn);
  }

  /** Run all registered finalizers exactly once (idempotent). */
  runFinalizers() {
    if (this.finalizersRun) return;
    this.finalizersRun = true;
    for (const fn of this.finalizers) fn();
  }

  /**
   * Register a definition under `name`, deduplicating by reference so the same
   * module imported by several parents declares once without ordering hazards;
   * re-registering `name` with a *different* object throws. Shared by the
   * predicate / advancement / loot-table / item-modifier / recipe registries.
   */
  protected registerDef<T>(map: Map<string, T>, kind: string, name: string, def: T): void {
    const existing = map.get(name);
    if (existing && existing !== def) {
      throw new Error(`${kind} "${name}" already registered with a different definition`);
    }
    map.set(name, def);
  }

  objective(name: string, kind: ObjectiveKind = "dummy") {
    const existing = this.objectives.get(name);

    if (existing) {
      if (existing.kind !== kind) {
        throw new Error(
          `Objective "${name}" already declared as ${existing.kind}`,
        );
      }
      return existing;
    }

    const obj = new Objective(name, kind);
    this.objectives.set(name, obj);
    return obj;
  }

  /** Declared objectives, for the load-time init injection. */
  protected get objectiveDefs(): ReadonlyMap<string, Objective> {
    return this.objectives;
  }

  createFunction(name: string, ...tags: FunctionTag[]): FunctionRef {
    const fn = new FunctionNode(name);
    this.functions.set(name, fn);
    this.tagFunction(name, tags);
    return new FunctionRef(fn, this.version);
  }

  /**
   * Like {@link createFunction}, but reuses an existing function node when one
   * already exists under `name` (so multiple authors can append to it - e.g.
   * several animated displays adding their setup to the shared `load`).
   */
  getOrCreateFunction(name: string, ...tags: FunctionTag[]): FunctionRef {
    let fn = this.functions.get(name);
    if (!fn) {
      fn = new FunctionNode(name);
      this.functions.set(name, fn);
    }
    this.tagFunction(name, tags);
    return new FunctionRef(fn, this.version);
  }

  /** A ref to an already-created function, or `undefined` if none exists. */
  functionRef(name: string): FunctionRef | undefined {
    const fn = this.functions.get(name);
    return fn ? new FunctionRef(fn, this.version) : undefined;
  }

  /**
   * Remove `name` from a function tag (`load`/`tick`) without deleting the
   * function itself. Mechanism only: lets a higher layer reparent a self-tagged
   * function (e.g. route every `tick` member through one owned dispatcher) - it
   * states no policy about whether you should.
   */
  untag(name: string, tag: FunctionTag): void {
    this.tags.get(tag)?.delete(name);
  }

  private tagFunction(name: string, tags: FunctionTag[]) {
    const autoTags = new Set<FunctionTag>([...tags]);
    if (name === "tick") autoTags.add("tick");
    if (name === "load") autoTags.add("load");

    for (const tag of autoTags) {
      if (!this.tags.has(tag)) {
        this.tags.set(tag, new Set());
      }
      this.tags.get(tag)!.add(name);
    }
  }
}
