// `Datapack` layer: the `load`/`tick`/`after` entry points, and the load setup codegen injects.
import { FunctionNode } from "../node";
import { scoreInitNode } from "../../commands/scoreboard";
import { LOCALS_OBJECTIVE } from "../../commands/local";
import { FunctionRef } from "../../function_ref";
import type { FunctionContext } from "../../frontend/context";
import { privateName } from "../../private-fn";
import { Time } from "../../values/time";
import { DatapackAssets } from "./assets";

export class DatapackEntry extends DatapackAssets {
  /** Append to the `load` function (runs on pack load / `/reload`). */
  load(builder: (ctx: FunctionContext) => void): FunctionRef {
    const ref = this.getOrCreateFunction("load", "load");
    ref.build(builder);
    return ref;
  }

  /**
   * Runs `build` once after `time`:
   *
   *   dp.after(ctx, Time.seconds(3), (c) => c.say("done"));
   *
   * The body goes in an auto-named child function, so you don't invent a name. `append`
   * queues
   * instead of replacing a pending run. Not a coroutine: the body runs later at the world
   * origin
   * as the server, so it must set its own `as`/`at`.
   */
  after(
    ctx: FunctionContext,
    time: Time,
    build: (ctx: FunctionContext) => void,
    append = false,
  ): FunctionRef {
    const ref = this.getOrCreateFunction(ctx.createChildFunction("after").name);
    ref.build(build);
    const id = this.idOf(ref);
    const schedule = ctx.schedule();
    if (append) schedule.functionAppend(id, time);
    else schedule.function_(id, time);
    return ref;
  }

  /** Append to the `tick` function (runs every game tick). */
  tick(builder: (ctx: FunctionContext) => void): FunctionRef {
    const ref = this.getOrCreateFunction("tick", "tick");
    ref.build(builder);
    return ref;
  }

  /** Runs finalizers and injects load setup before codegen. Idempotent. */
  protected prepareForCodegen() {
    this.runFinalizers();
    this.ensureLoadInitializers();
  }

  private ensureLoadInitializers() {
    // Ensure load function exists
    let loadFn = this.functions.get("load");

    if (!loadFn) {
      loadFn = new FunctionNode("load");
      this.functions.set("load", loadFn);

      // tag it properly
      if (!this.tags.has("load")) {
        this.tags.set("load", new Set());
      }
      this.tags.get("load")!.add("load");
    }

    // Ensure objective init function exists
    const initName = privateName("init_objectives");

    let initFn = this.functions.get(initName);
    if (!initFn) {
      initFn = new FunctionNode(initName);
      this.functions.set(initName, initFn);
    }

    if ([...this.functions.values()].some((fn) => fn.locals > 0))
      this.objective(LOCALS_OBJECTIVE);

    // Rebuild from the current objectives each time, since more may be added between
    // codegen calls.
    initFn.nodes.length = 0;
    for (const obj of this.objectiveDefs.values()) {
      initFn.nodes.push(scoreInitNode(obj));
    }

    // Inject call at start of load function
    const alreadyInjected = loadFn.nodes.some(
      (n) => n instanceof FunctionNode && n.name === initName,
    );

    if (!alreadyInjected) {
      loadFn.nodes.unshift(new FunctionNode(initName));
    }
  }
}
