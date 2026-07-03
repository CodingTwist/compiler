import { Datapack } from "../../core/ir/datapack";
import { FunctionContext } from "../../core/frontend";
import { Range } from "../../core/ir/node";
import { SayNode } from "../../core/commands/saycommand";
import { text } from "../../core/frontend";
import { TellrawText } from "../../core/frontend/nodes/tellraw_text";
import { click } from "../../core/frontend/nodes/click";
import { hover } from "../../core/frontend/nodes/hover";
import { Selector } from "../../core/frontend/nodes/selector";
import { v26_2 } from "../../versions/26_2";
import { Pos, Block, Nbt, NbtPath, Id, Path, Item, ScoreTarget, Color } from "../../core/values";

// Build the whole example pack against Minecraft 26.2, so the written
// .mcfunction files use its command grammar, folders and pack format.
const dp = new Datapack("example", v26_2);

const announce = dp.createFunction("announce");

announce.build((ctx) => {
  ctx.say("Announcement function, callable from anywhere in the pack.");
});

const main = dp.createFunction("main");

main.build((ctx) => {
  // Blocks and storage.
  ctx.setblock(Pos(10, 4, 5), Block.STONE);
  ctx.fill(Pos(0, 0, 0), Pos(10, 10, 10), Block.STONE);

  const state = ctx.storage(Id("example:state"));
  state.set(NbtPath("wins"), Nbt("0"));
  state.merge(
    NbtPath("players"),
    ctx.entity(Selector.self()).at(Path.Player.SelectedItem),
  );

  // Scoreboard: create an objective, set/add scores, enable a trigger.
  const points = dp.objective("points", "trigger");
  const score = points.score(ScoreTarget("GamingTwist")).set(42, ctx);
  points.score(ScoreTarget("GamingTwist")).add(10, ctx);
  points.enable(ctx, Selector.allPlayers());
  ctx.trigger(points);

  // Tellraw built from typed text parts: colors, a clickable run-command,
  // a hover tooltip, and a live scoreboard value spliced into the message.
  const message = new TellrawText([
    text("Score: "),
    score.bold(),
    text("! Congrats!")
      .color(Color.BLUE)
      .onClick(click.command(new SayNode("Hi")))
      .onHover(hover.text(text("hello"))),
  ]);

  const highScorers = Selector.allPlayers()
    .score(points, new Range(1, undefined))
    .limit(1)
    .sort("nearest");

  ctx.tellraw(highScorers, message);

  // Random rolls, calling another function, and a simple loop.
  const rng = dp.objective("trivia", "dummy").score(ScoreTarget("rng"));
  rng.storeResult(ctx, ctx.random(1, 18));

  ctx.call(announce);

  for (let i = 0; i < 3; i++) {
    ctx.say("Loop " + i);
  }

  // Branching: if / elif / else, including a nested if.
  const player = ctx.player("GamingTwist");

  ctx
    .if(score.greaterThan(20), () => {
      ctx.if(score.equal(30), (ctx) => {
        announceHighScore(ctx);
      });
      ctx.say("High");
    })
    .elif(score.equal(4), (ctx) => {
      ctx.say("Medium");
      ctx.playerGive(player, Item.DIAMOND, 3);
    })
    .else((ctx) => {
      ctx.say("Low");
    });

  ctx.say("End of main function");
});

dp.writeDatapack("./out/example");

function announceHighScore(ctx: FunctionContext) {
  ctx.say("Very High score!");
}
