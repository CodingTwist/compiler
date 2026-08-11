import { Marker, Pos } from "helix";
import type { PlayerMotionInternals } from "./context";

/**
 * `internal/init` (load-tagged): create every objective, seed the constant
 * fake-players, forceload chunk `0 0` (where the reference-vector math happens),
 * and summon the fixed dummy marker the global path teleports around.
 */
export function defineInit(I: PlayerMotionInternals): void {
  const {
    fInit, constant, marker,
    api, dummy, math, konst, gm, store,
    prevVecK, prevXin, prevYin, prevZin, prevX, prevY, prevZ, prevMethod,
  } = I;

  fInit.build((ctx) => {
    for (const o of [api, dummy, math, konst]) ctx.scoreInit(o);
    // Seed the constant fake-players the math divides/multiplies by.
    const constants = [-1, 2, 10, 12, 100, 1000, 2000, 8000, 100000, 1000000];
    for (const n of constants) ctx.scoreSet(constant(`#constant.${n}`).set(n));
    for (const o of [gm, prevVecK, prevXin, prevYin, prevZin, prevX, prevY, prevZ, prevMethod, store])
      ctx.scoreInit(o);

    ctx.forceload().remove(Pos(0, 0));
    ctx.forceload().add(Pos(0, 0));

    ctx.kill(marker());
    ctx.summon(
      Marker({
        uuid: [-725781337, 1317161479, -2007965756, -660627921],
        tags: ["smithed.strict", "smithed.entity"],
      }),
      Pos.raw("0.0 0.0 0.0"),
    );
  });
}
