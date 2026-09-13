import { expect, it } from "vitest";
import { Datapack, v26_2, v26_3_rc_2 } from "helix";
import { installKit } from "../kit";
import { playerMotion } from "./player_motion";
import { raycast } from "./raycast";
import { grapple } from "./grapple";
import { ballistics } from "./ballistics";

installKit([playerMotion, raycast, grapple, ballistics]);

/**
 * Snapshot of every command the grapple and a runtime ballistic shot emit, on both maths
 * backends.
 *
 * Catches refactors that change what gets computed. Update with `npx vitest run -u` and
 * read the diff.
 */
it.each([
  ["26.2", v26_2],
  ["26.3-rc-2", v26_3_rc_2],
])("renders the same pack on %s", async (id, version) => {
  const dp = new Datapack("test", version);
  dp.grapple();
  dp.ballisticRuntime("fire", { ticks: 40, lead: true });
  dp.report(); // populates dp.files
  const body = [...dp.files.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, text]) => `=== ${path}\n${text}`)
    .join("\n");
  await expect(body).toMatchFileSnapshot(`__snapshots__/pack.${id}.txt`);
});
