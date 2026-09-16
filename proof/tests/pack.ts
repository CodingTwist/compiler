// The pack both modes run against: helix/spool code under test, nothing test-specific.
//
// Tests call these functions by name and read the result off the running game.
import {
  Block,
  ContextInt as i,
  Datapack,
  Display,
  Husk,
  ScoreTarget,
  math,
  quat,
  v26_3_rc_2,
} from "helix";
import { defineMob } from "spool/plugins/mob";

export const dp = new Datapack("proof", v26_3_rc_2);

export const objective = "proof.sb";
const obj = dp.objective(objective);
const s = (name: string) => obj.score(ScoreTarget(name));

/** A minimal spool mob, so tests can summon one and watch it behave. */
export const golem = defineMob(Husk({}), Display(Block.STONE))
  .gesture("nod", { members: [0], pivot: [0, 0, 0], rotate: quat("x", 20) })
  .build("golem");
golem.register(dp);

dp.createFunction("tick", "tick").build((ctx) => golem.tick(ctx));
dp.createFunction("wake").build((ctx) => ctx.call(golem.wake));

dp.createFunction("compute_float32").build(() => {
  math`${s("#a")} * 1.5`.into(s("#out"));
});

dp.createFunction("compute_overflow").build((ctx) => {
  ctx
    .execute()
    .storeResultScore(s("#out"))
    .run((c) => c.compute().defaultInteger(i.mul(i.score(s("#big")), i.score(s("#big")))));
});
