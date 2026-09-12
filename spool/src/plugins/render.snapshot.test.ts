import { expect, it } from "vitest";
import { Datapack, v26_2, v26_3_rc_2 } from "helix";
import { installKit } from "../kit";
import { playerMotion } from "./player_motion";
import { raycast } from "./raycast";
import { grapple } from "./grapple";
import { ballistics } from "./ballistics";

installKit([playerMotion, raycast, grapple, ballistics]);

/**
 * The **rendered-output golden** for the math-heavy plugins: every command the grapple
 * stack and a runtime ballistic shot emit, on both backends - the pre-26.3 `scoreboard
 * players operation` chain and 26.3's `/compute`. Its job is refactor safety: rewriting a
 * mutation chain as a `math` formula should change *how* the arithmetic is spelled, never
 * which functions exist or what they compute, and a `math`-shaped change shows up here as a
 * readable diff instead of a silently different pack.
 *
 * Update with `npx vitest run -u` and **read the diff** - an unexpected slot or a vanished
 * line is the bug this file exists to catch.
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
