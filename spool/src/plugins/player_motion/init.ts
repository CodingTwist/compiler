import { Marker, Pos } from "helix";
import type { PlayerMotionInternals } from "./context";

/**
 * `internal/init` (load): creates objectives, forceloads chunk `0 0`, and
 * summons the dummy marker.
 */
export function defineInit(I: PlayerMotionInternals): void {
  const {
    fInit,
    marker,
    api,
    dummy,
    math,
    gm,
    store,
    prevVecK,
    prevIn,
    prevOut,
    prevMethod,
  } = I;

  fInit.build((ctx) => {
    for (const o of [
      api,
      dummy,
      math,
      gm,
      prevVecK,
      ...prevIn,
      ...prevOut,
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
