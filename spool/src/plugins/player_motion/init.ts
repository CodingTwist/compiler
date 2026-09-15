import { Marker, Pos } from "helix";
import type { PlayerMotionInternals } from "./context";

/**
 * `internal/init` (load): creates objectives, seeds constants, forceloads chunk `0 0`, and
 * summons the dummy marker.
 */
export function defineInit(I: PlayerMotionInternals): void {
  const {
    fInit,
    constant,
    marker,
    api,
    dummy,
    math,
    konst,
    gm,
    store,
    prevVecK,
    prevXin,
    prevYin,
    prevZin,
    prevX,
    prevY,
    prevZ,
    prevMethod,
  } = I;

  fInit.build((ctx) => {
    for (const o of [api, dummy, math, konst]) o.init();
    // Seed the constant fake-players the math divides/multiplies by.
    const constants = [-1, 2, 10, 12, 100, 1000, 2000, 8000, 100000, 1000000];
    for (const n of constants) constant(`#constant.${n}`).set(n);
    for (const o of [
      gm,
      prevVecK,
      prevXin,
      prevYin,
      prevZin,
      prevX,
      prevY,
      prevZ,
      prevMethod,
      store,
    ])
      o.init();

    ctx.forceload().remove(Pos(0, 0));
    ctx.forceload().add(Pos(0, 0));

    ctx.kill(marker());
    ctx.summon(
      Marker({
        uuid: [-725781337, 1317161479, -2007965756, -660627921],
        tags: ["smithed.strict", "smithed.entity"],
      }),
      Pos.exact(0, 0, 0),
    );
  });
}
