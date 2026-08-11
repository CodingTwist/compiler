/**
 * The `probe` plugin: **in-game** tests.
 *
 * The unit tests in this repo assert on emitted command text; a probe suite
 * asserts on the running world - run `/function <ns>:probe/run` in a world and
 * read PASS/FAIL out of chat. See {@link Suite} for the shape.
 *
 * It builds entirely on helix's public API (`Detect`, `execute store success`,
 * `schedule`, `tellraw`) and adds no new primitives.
 */

import { Datapack } from "helix";
import type { KitPlugin } from "../../plugin";
import { Suite, type ProbeOptions } from "./suite";

export { Suite } from "./suite";
export type { ProbeCase, ProbeOptions } from "./suite";

declare module "helix" {
  interface Datapack {
    /**
     * Start a {@link Suite} of in-game tests. Pass `{ enabled: <dev flag> }` and
     * a prod build emits nothing at all - no functions, no objective.
     */
    probe(opts?: ProbeOptions): Suite;
  }
}

export const probe: KitPlugin = {
  name: "probe",
  install() {
    Datapack.prototype.probe = function (this: Datapack, opts?: ProbeOptions): Suite {
      return new Suite(this, opts);
    };
  },
};
