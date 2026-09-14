// `Datapack` layer: objectives, functions and the load/tick function tags.
import { Objective, ObjectiveKind } from "../../frontend";
import { FunctionNode } from "../node";
import { CallableFn, FunctionRef } from "../../function_ref";
import type { FunctionContext, Score } from "../../frontend";
import { supportsCommand } from "../../../versions/capabilities";
import { FunctionId } from "../../values/resource.generated";
import { DatapackCore, type FunctionTag } from "./core";
import { ScoreTarget } from "../../values/score_target";
import { currentContext } from "../../frontend/context/ambient";
import { privateChild, privateName } from "../../private-fn";

/** The objective every `dp.variable` lives on; separate from locals so names can't collide. */
export const VARIABLES_OBJECTIVE = "helix.global";

export class DatapackFunctions extends DatapackCore {
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

  /**
   * A pack-wide score named `name`, on an objective the pack owns.
   *
   * The same name returns the same score, so two callers asking for one name share it.
   */
  variable(name: string): Score {
    return this.objective(VARIABLES_OBJECTIVE).score(ScoreTarget(`#${name}`));
  }

  /** Declared objectives, for the load-time init injection. */
  protected get objectiveDefs(): ReadonlyMap<string, Objective> {
    return this.objectives;
  }

  /**
   * Creates a function; with no `name` it gets a private generated one.
   *
   * Only name a function whose id is used outside the code (`/function`, a tag in another pack).
   */
  createFunction(name: string = this.autoName(), ...tags: FunctionTag[]): FunctionRef {
    const fn = new FunctionNode(name);
    this.functions.set(name, fn);
    this.tagFunction(name, tags);
    return new FunctionRef(fn, this.version);
  }

  /**
   * A function whose params are scores and whose result is the score `body` returns.
   *
   * Params are counted from `body.length`, so they can't have defaults or be a rest param.
   * They are locals, so a recursive call overwrites them.
   */
  fn<P extends Score[]>(body: (ctx: FunctionContext, ...params: P) => Score | void): CallableFn<P>;
  fn<P extends Score[]>(name: string, body: (ctx: FunctionContext, ...params: P) => Score | void): CallableFn<P>;
  fn<P extends Score[]>(
    nameOrBody: string | ((ctx: FunctionContext, ...params: P) => Score | void),
    maybeBody?: (ctx: FunctionContext, ...params: P) => Score | void,
  ): CallableFn<P> {
    const ref = this.createFunction(typeof nameOrBody === "string" ? nameOrBody : undefined);
    const body = typeof nameOrBody === "string" ? maybeBody! : nameOrBody;
    const name = ref.getName();
    let params = [] as unknown as P;
    let returns = false;
    ref.build((ctx) => {
      params = Array.from({ length: body.length - 1 }, () => ctx.let()) as P;
      const result = body(ctx, ...params);
      if (!result) return;
      if (!supportsCommand(this.version, ["return", "run"])) {
        throw new Error(`dp.fn("${name}") returns a score, which needs \`return run\` (${this.version.id} lacks it)`);
      }
      returns = true;
      ctx.returnRun(() => void result.get());
    });
    return new CallableFn(ref.node, this.version, params, returns);
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

  private readonly groups: string[] = [];

  /**
   * Runs `body` with nameless functions created outside a build placed under `name/zzz/`.
   *
   * Groups nest (`a` then `b` → `a/zzz/b/fn_0`), so the output folder shows which feature made a helper.
   */
  group<T>(name: string, body: () => T): T {
    this.groups.push(name);
    try {
      return body();
    } finally {
      this.groups.pop();
    }
  }

  /** A ref to an already-created function, or `undefined` if none exists. */
  functionRef(name: string): FunctionRef | undefined {
    const fn = this.functions.get(name);
    return fn ? new FunctionRef(fn, this.version) : undefined;
  }

  /**
   * A free private name: under the function being built (`a/b` → `a/zzz/b/fn_0`), else under
   * the current {@link group}, else `zzz/fn_0`.
   *
   * Checked against every function so far, since two contexts can build into the same parent.
   */
  private autoName(): string {
    const parent = (currentContext() as { fn?: FunctionNode } | undefined)?.fn?.name;
    const group = this.groups.join("/");
    for (let n = 0; ; n++) {
      const name = parent
        ? privateChild(parent, `fn_${n}`)
        : privateName(group ? `${group}/fn_${n}` : `fn_${n}`);
      if (!this.functions.has(name)) return name;
    }
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

  /** The typed id (`<ns>:<name>`) of a function in this pack. */
  idOf(ref: FunctionRef): FunctionId {
    return FunctionId(`${this.name}:${ref.getName()}`);
  }
}
