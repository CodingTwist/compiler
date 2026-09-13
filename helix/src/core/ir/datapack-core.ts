// Base of `Datapack`: identity, functions, objectives, finalizers and structures.
// Split across files for size only; it's one class to authors.
import { Objective, ObjectiveKind } from "../frontend";
import { FunctionNode } from "./node";
import { FunctionRef } from "../function_ref";
import { VersionProfile } from "../../versions/profile";
import type { ClearFill } from "../codegen/structure";
import { ScoreboardTiming } from "../timing/scoreboard-timing";
import { DEFAULT_TARGET, RuntimeTarget } from "./target";
import { enableSourceTracking, type DebugOptions, type SourceLoc } from "../debug/sources";

export type FunctionTag = "load" | "tick";

export class DatapackCore {
  name: string;
  readonly version: VersionProfile;
  /**
   * The runtime this build targets. Only `ctx.native(...)` depends on it. See {@link
   * useTarget}.
   */
  target: RuntimeTarget;
  functions: Map<string, FunctionNode> = new Map();
  protected objectives = new Map<string, Objective>();
  public files = new Map<string, string>();
  /** Private functions folded into their callers; must not be regenerated on a rebuild. */
  readonly inlined = new Set<string>();
  public tags = new Map<FunctionTag, Set<string>>();
  /** Debug-only build settings (source tracking); all off by default. */
  readonly debug: DebugOptions;
  /**
   * With `debug.sources`: the author line behind each rendered line (`undefined` for
   * comment lines).
   */
  readonly sourceMap = new Map<string, (SourceLoc | undefined)[]>();

  /** How run-for-a-duration / periodic timing compiles. */
  readonly timing = new ScoreboardTiming();
  private finalizers: (() => void)[] = [];
  private finalizersRun = false;
  private structureDirs: string[] = [];
  // `_clear` structure variants to derive, keyed by structure path, with their fill block.
  private clearVariants = new Map<string, ClearFill>();

  constructor(
    name: string,
    version: VersionProfile,
    target: RuntimeTarget = DEFAULT_TARGET,
    opts: { debug?: DebugOptions } = {},
  ) {
    this.name = name.toLowerCase();
    this.version = version;
    this.target = target;
    this.debug = opts.debug ?? {};
    // Capture has to be on before authoring starts - nodes are attributed as they're pushed.
    if (this.debug.sources || this.debug.comments) enableSourceTracking();
  }

  /**
   * Ships every `.nbt` under `dir` into the pack's structure folder. `cog.nbt` becomes
   * `<ns>:cog`.
   * Copied when the datapack is written.
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
   * Requests a `_clear` variant of a shipped structure, with `fill` replacing its solid
   * cells.
   * A conflicting fill for the same structure throws.
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

  /** Sets the runtime target (default `"vanilla"`). */
  useTarget(target: RuntimeTarget): this {
    this.target = target;
    return this;
  }

  /**
   * Registers work to run once before codegen, after authoring, so chained settings are
   * final.
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

  /** Registers `def` under `name`. The same object twice is fine; a different one throws. */
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
   * Like {@link createFunction}, but reuses an existing function so several authors can
   * append to it.
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

  /** Removes `name` from a function tag without deleting the function. */
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
