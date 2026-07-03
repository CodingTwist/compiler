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
import { Pos, Block, Nbt, NbtPath, Id, Path, Display, Item, ScoreTarget, Color } from "../../core/values";
import path from "path";

// Static structure (.nbt) assets shipped with the pack live alongside this file
// in ./structures - drop `.nbt` files there (see structures/README.md).
const structuresDir = path.join(__dirname, "structures");

// Build the whole example pack against Minecraft 26.2, so the written
// .mcfunction files use its command grammar, folders and pack format.
const dp = new Datapack("example", v26_2);

const test2 = dp.createFunction("test2");

test2.build((ctx) => {
  ctx.say("This is test2 fgfdgjfdklgjfkdgjkfdgjkdffunction");
});

const main = dp.createFunction("main");

main.build((ctx) => {
  const test = 1;

  ctx.setblock(Pos(10, 4, 5), Block.STONE);
  ctx
    .setblock(Pos.rel(0, 1, 0), Block.OAK_SIGN.state({ rotation: 4 }))
    .keep();

  // A block_display built from an array, so blocks/offsets can be edited or
  // generated in a loop. The root + each child render as block_state compounds.
  const display = Display(Block.POLISHED_BASALT.state({ axis: "x" }), {
    translation: [-0.5, -0.5, -0.5],
  })
    .add(Block.WAXED_WEATHERED_COPPER, {
      translation: [-0.5, -0.5, -2.5],
    })
    .add(
      Block.WAXED_WEATHERED_LIGHTNING_ROD.state({
        facing: "south",
        powered: "false",
        waterlogged: "false",
      }),
      { translation: [-0.5, -0.5, -1.5] },
    )
    .add(
      Block.WAXED_WEATHERED_COPPER_TRAPDOOR.state({
        facing: "north",
        half: "bottom",
        open: "true",
        powered: "false",
        waterlogged: "false",
      }),
      { translation: [-0.5, -0.5, -3.5] },
    )
    .add(
      Block.WAXED_WEATHERED_CUT_COPPER_STAIRS.state({
        facing: "south",
        half: "bottom",
        shape: "straight",
        waterlogged: "false",
      }),
      { translation: [-0.5, -1.5, -2.5] },
    )
    .add(
      Block.WAXED_WEATHERED_CUT_COPPER_STAIRS.state({
        facing: "north",
        half: "bottom",
        shape: "straight",
        waterlogged: "false",
      }),
      { translation: [-0.5, -1.5, -1.5] },
    )
    .add(
      Block.WAXED_WEATHERED_CUT_COPPER_STAIRS.state({
        facing: "north",
        half: "top",
        shape: "straight",
        waterlogged: "false",
      }),
      { translation: [-0.5, -2.5, -1.5] },
    )
    .add(
      Block.WAXED_WEATHERED_CUT_COPPER_STAIRS.state({
        facing: "north",
        half: "bottom",
        shape: "straight",
        waterlogged: "false",
      }),
      { translation: [-0.5, 1.5, -1.5] },
    )
    .add(
      Block.WAXED_WEATHERED_CUT_COPPER_STAIRS.state({
        facing: "north",
        half: "top",
        shape: "straight",
        waterlogged: "false",
      }),
      { translation: [-0.5, 0.5, -1.5] },
    )
    .add(
      Block.WAXED_WEATHERED_CUT_COPPER_STAIRS.state({
        facing: "south",
        half: "top",
        shape: "straight",
        waterlogged: "false",
      }),
      { translation: [-0.5, 0.5, -2.5] },
    )
    .add(
      Block.WAXED_WEATHERED_COPPER_TRAPDOOR.state({
        facing: "east",
        half: "top",
        open: "false",
        powered: "false",
        waterlogged: "false",
      }),
      { translation: [-0.5, -3.5, -0.5] },
    )
    .add(Block.WAXED_WEATHERED_COPPER, {
      translation: [-0.5, -2.5, -0.5],
    })
    .add(
      Block.WAXED_WEATHERED_CUT_COPPER_STAIRS.state({
        facing: "south",
        half: "top",
        shape: "straight",
        waterlogged: "false",
      }),
      { translation: [-0.5, -2.5, 0.5] },
    )
    .add(
      Block.WAXED_WEATHERED_LIGHTNING_ROD.state({
        facing: "up",
        powered: "false",
        waterlogged: "false",
      }),
      { translation: [-0.5, -1.5, -0.5] },
    )
    .add(
      Block.WAXED_WEATHERED_CUT_COPPER_STAIRS.state({
        facing: "south",
        half: "bottom",
        shape: "straight",
        waterlogged: "false",
      }),
      { translation: [-0.5, -1.5, 0.5] },
    )
    .add(
      Block.WAXED_WEATHERED_CUT_COPPER_STAIRS.state({
        facing: "north",
        half: "bottom",
        shape: "straight",
        waterlogged: "false",
      }),
      { translation: [-0.5, -1.5, 1.5] },
    )
    .add(
      Block.WAXED_WEATHERED_LIGHTNING_ROD.state({
        facing: "north",
        powered: "false",
        waterlogged: "false",
      }),
      { translation: [-0.5, -0.5, 0.5] },
    )
    .add(Block.WAXED_WEATHERED_COPPER, {
      translation: [-0.5, -0.5, 1.5],
    })
    .add(
      Block.WAXED_WEATHERED_COPPER_TRAPDOOR.state({
        facing: "south",
        half: "bottom",
        open: "true",
        powered: "false",
        waterlogged: "false",
      }),
      { translation: [-0.5, -0.5, 2.5] },
    )
    .add(
      Block.WAXED_WEATHERED_CUT_COPPER_STAIRS.state({
        facing: "south",
        half: "top",
        shape: "straight",
        waterlogged: "false",
      }),
      { translation: [-0.5, 0.5, 0.5] },
    )
    .add(Block.WAXED_WEATHERED_COPPER, {
      translation: [-0.5, 1.5, -0.5],
    })
    .add(
      Block.WAXED_WEATHERED_CUT_COPPER_STAIRS.state({
        facing: "south",
        half: "bottom",
        shape: "straight",
        waterlogged: "false",
      }),
      { translation: [-0.5, 1.5, 0.5] },
    )
    .add(
      Block.WAXED_WEATHERED_CUT_COPPER_STAIRS.state({
        facing: "north",
        half: "top",
        shape: "straight",
        waterlogged: "false",
      }),
      { translation: [-0.5, 0.5, 1.5] },
    )
    .add(
      Block.WAXED_WEATHERED_LIGHTNING_ROD.state({
        facing: "down",
        powered: "false",
        waterlogged: "false",
      }),
      { translation: [-0.5, 0.5, -0.5] },
    )
    .add(
      Block.WAXED_WEATHERED_COPPER_TRAPDOOR.state({
        facing: "north",
        half: "bottom",
        open: "false",
        powered: "false",
        waterlogged: "false",
      }),
      { translation: [-0.5, 2.5, -0.5] },
    )
    // Pin full brightness so the display matches the real blocks instead of
    // dimming/flickering with dynamic per-entity lighting. Lower to taste.
    .brightness(15)
    .named("cog");

  // A reusable, one-shot spin clip: define the animation ONCE (frames are
  // location-independent), then play it at any door's position. Each play is
  // ephemeral - summon → spin 20 ticks → despawn - and only one runs at a time.
  const cogSpin = dp
    .clip(display)
    .spinX(5)
    .forTicks(196)
    .snap(90) // always come to rest on 0/90/180/270, never mid-tooth
    // Swap the real cog blocks (example:door-cog-1, a 1x7x7 structure) for the
    // spinning display: clear the footprint on play, /place template it back on
    // despawn. Offsets are blocks relative to the summon pos; tune in-game.
    .swaps("example:door-cog-1", [0, -3, -3], [0, 3, 3])
    // Fill the cog's cells with invisible barriers while it's the spinning display.
    .clearWith(Block.BARRIER);

  // Presence-driven: when a player comes within 6 blocks, the real cog blocks
  // quietly convert to (idle) display entities - so the swap/lighting pop happens
  // on approach, not at the dramatic moment. The entities sit idle until you fire
  // the spin yourself (below). When the player leaves and the spin is idle, they
  // convert back to blocks; a spin in progress finishes first.
  // Detection point = the cog's CENTER block: within 30 blocks the real cog
  // converts to (idle) display entities; walk away and it converts back. The fill
  // + summon anchor here too (the display centers on it, cleared region is
  // center + [0,-3,-3] .. center + [0,3,3]). Set this to your real cog's center.
  cogSpin.materializeWhenNear(Pos(-72, 68, -1), 30);

  // Your "door opens" trigger: run /function example:open_cog while standing near
  // the cog to spin it. In a real door this is wherever the open logic lives.
  dp.createFunction("open_cog").build((open) => {
    cogSpin.animate(open);
  });

  ctx.say("Hello World");
  ctx.say("test is " + test);

  ctx.fill(Pos(0, 0, 0), Pos(10, 10, 10), Block.STONE);

  const state = ctx.storage(Id("example:state"));
  state.get(NbtPath("players"));
  state.set(NbtPath("wins"), Nbt("0"));
  state.merge(
    NbtPath("players"),
    ctx.entity(Selector.self()).at(Path.Player.SelectedItem),
  );
  const health = ctx.entity(Selector.self()).at(Path.Entity.UUID);
  ctx.tellraw(Selector.self(), ["Your health: ", health.color(Color.RED)]);
  ctx.block(Pos.here()).remove(NbtPath("Items[0]"));

  const points = dp.objective("var1", "trigger");
  const score = points.score(ScoreTarget("GamingTwist")).set(42, ctx);

  points.score(ScoreTarget("GamingTwist")).add(10, ctx);

  points.enable(ctx, Selector.allPlayers());

  const message = new TellrawText([
    text("Hello123 ").bold(false),
    score.bold(),
    text("! Congrats!")
      .color(Color.BLUE)
      .onClick(click.command(new SayNode("Hi")))
      .onHover(hover.text(text("hello"))),
  ]);

  const sel = Selector.allPlayers()
    .score(points, new Range(1, undefined))
    .limit(1)
    .tag("xyz")
    .sort("nearest");
  const sel2 = Selector.allPlayers();

  ctx.tellraw(sel, message);

  sel.run((ctx) => {
    ctx.say("test command");
  })(ctx);

  ctx.trigger(points);

  ctx.tellraw(sel2, message);

  const trivia = dp.objective("trivia", "dummy");
  const rng = trivia.score(ScoreTarget("rng"));
  rng.storeResult(ctx, ctx.random(1, 18));

  rng.copy(ctx, score);

  const score2 = trivia.score(ScoreTarget("temp1"));
  score2.set(42, ctx);

  ctx.call(test2);

  for (let i = 0; i < 5; i++) {
    ctx.say("Loop " + i);
  }

  const player = ctx.player("GamingTwist");

  ctx
    .if(score.greaterThan(20), () => {
      ctx.if(score.equal(30), (ctx) => {
        newFunction_1(ctx);
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

// A scoreboard-backed periodic clock: this body runs every 5 seconds. The
// compiler installs the shared `__clock` tick driver; `everySeconds(5)` just
// hands back an appendable hook function. Common rates are 2/5/10s.
// dp.everySeconds(5).build((ctx) => {
//   ctx.say("5s clock tick");
// });

// Ship any .nbt files dropped in ./structures (e.g. example:cog for clip.swaps).
dp.addStructures(structuresDir);

dp.writeDatapack("./out/cogs");
// writeDatapack(dp, "./out/example_datapack");


function newFunction_1(ctx: FunctionContext) {
  newFunction();

  function newFunction() {
    ctx.say("Very High");
  }
}
