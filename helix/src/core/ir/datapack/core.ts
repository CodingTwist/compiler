// Base of `Datapack`: identity, build options, finalizers and shipped structures.
// Split across files for size only; it's one class to authors.
import { Objective } from "../../frontend";
import { FunctionNode } from "../node";
import { VersionProfile } from "../../../versions/profile";
import type { ClearFill } from "../../codegen/structure";
import { ScoreboardTiming } from "../../timing/scoreboard-timing";
import { DEFAULT_TARGET, RuntimeTarget } from "../target";
import type { LineInfo } from "../line-info";
import {
  enableSourceTracking,
  type DebugOptions,
  type SourceLoc,
} from "../../debug/sources";
import {
  PLUGIN_ROOT,
  privateName,
  type FunctionLayout,
} from "../../private-fn";
import { groupView } from "./group";

export type FunctionTag = "load" | "tick";

/** Output optimization passes. Each is on unless set to `false`. */
export interface OptimizeOptions {
  /** Fold one-command private functions into their callers. */
  inline?: boolean;
  /** Move runs of lines with the same `execute` prefix into one function call. */
  group?: boolean;
}

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
  /** Which output optimization passes run; all on by default. */
  readonly optimize: OptimizeOptions;
  /** Where private functions go in the output. Default `split`. */
  readonly layout: FunctionLayout;
  /** This view's group path; empty on the pack itself. See {@link group}. */
  readonly path: string = "";
  private readonly groups = new Map<string, this>();
  /** Functions created with `public`, so the inliner keeps public plugin functions. */
  readonly publicNames = new Set<string>();
  /**
   * With `debug.sources`: the author line behind each rendered line (`undefined` for
   * comment lines).
   */
  readonly sourceMap = new Map<string, (SourceLoc | undefined)[]>();
  /** What each line of each function file is, indexed like the file. For output passes. */
  readonly lineInfo = new Map<string, LineInfo[]>();

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
    opts: {
      debug?: DebugOptions;
      optimize?: OptimizeOptions;
      layout?: FunctionLayout;
    } = {},
  ) {
    this.name = name.toLowerCase();
    this.version = version;
    this.target = target;
    this.debug = opts.debug ?? {};
    this.optimize = opts.optimize ?? {};
    this.layout = opts.layout ?? "split";
    // Capture has to be on before authoring starts - nodes are attributed as they're pushed.
    if (this.debug.sources || this.debug.comments) enableSourceTracking();
  }

  /** The pack itself, from any group view. */
  get root(): this {
    return this;
  }

  /**
   * A view of this pack whose functions are created under `name`: `dp.group("door").group("lobby")`
   * creates `door/lobby/<fn>`.
   *
   * Pass it wherever a `Datapack` goes, so plugins called with it nest their output there too.
   * The same path always returns the same view.
   */
  group(name: string): this {
    const path = this.path ? `${this.path}/${name}` : name;
    const root = this.root;
    let view = root.groups.get(path);
    if (!view) {
      view = groupView(root, path);
      root.groups.set(path, view);
    }
    return view;
  }

  /**
   * The shared home of plugin `name`: its functions go in `zzzplugin/<name>/`, public or not.
   *
   * Keeps plugin code out of the pack's own `zzzprivate/` tree.
   */
  plugin(name: string): this {
    return this.root.group(`${PLUGIN_ROOT}/${name}`);
  }

  /**
   * The output name of function `name` in this group. Private unless `public`.
   *
   * `load` and `tick` at the top are always public, since their tags name them.
   */
  functionName(name: string, opts: { public?: boolean } = {}): string {
    const full = this.path ? `${this.path}/${name}` : name;
    if (opts.public || full === "load" || full === "tick") return full;
    return privateName(full, this.layout);
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
  protected registerDef<T>(
    map: Map<string, T>,
    kind: string,
    name: string,
    def: T,
  ): void {
    const existing = map.get(name);
    if (existing && existing !== def) {
      throw new Error(
        `${kind} "${name}" already registered with a different definition`,
      );
    }
    map.set(name, def);
  }
}
