/**
 * The `probe` plugin: tests that run in a real world.
 *
 * Run `/function <ns>:probe/run` and read PASS/FAIL in chat. See {@link Suite}.
 */

import { Datapack } from "helix";
import type { KitPlugin } from "../../plugin";
import { Suite, type ProbeOptions } from "./suite";

export { Suite } from "./suite";
export type { ProbeCase, ProbeOptions } from "./suite";

declare module "helix" {
  interface Datapack {
    /** Starts a {@link Suite} of in-game tests. `{ enabled: false }` emits nothing. */
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
