# Positions & blocks

Two of the most-used value types. A [`Pos`](/api/helix/type-aliases/Pos) is a coordinate
tuple; a [`Block`](/api/helix/type-aliases/Block) is a block id plus optional state and
data. Both render themselves at codegen, so you build the object and hand it to any command
that takes a position or a block - `setblock`, `fill`, `summon`, every `execute positioned`
/ `if block` clause.

## Positions

One coordinate *mode* applies to the whole vector - you never mix `~` and absolute within
one `Pos`:

| Factory | Renders | Meaning |
| --- | --- | --- |
| `Pos(10, 4, 5)` | `10 4 5` | absolute |
| `Pos.rel(0, 1, 0)` | `~ ~1 ~` | relative to the executor (`~`) |
| `Pos.local(0, 0, 2)` | `^ ^ ^2` | local to facing (`^`) |
| `Pos.here()` | `~ ~ ~` | the executor's own position |

`.offset(dx, dy, dz)` returns a shifted copy in the same mode, and `.center()` adds `0.5`
on each axis (the block-cell center - what you want when summoning a display entity so it
sits centered in its cell):

```ts compile
import { Datapack, v26_2, Pos, Block } from "helix";

const dp = new Datapack("world", v26_2);

const fn = dp.createFunction("place");
fn.build((ctx) => {
  ctx.setblock(Pos(0, 64, 0), Block.STONE);          // absolute
  ctx.setblock(Pos.rel(0, 1, 0), Block.GLOWSTONE);   // one above the executor
  ctx.setblock(Pos(0, 64, 0).offset(0, 2, 0), Block.DIAMOND_BLOCK);
});
```

## Blocks

`Block(id)` or a typed member (`Block.STONE`, `Block.GRASS_BLOCK`) - the members are
generated from the newest supported version, so they autocomplete and catch typos. Chain
to add detail:

| Method | Adds | Example render |
| --- | --- | --- |
| `.state({ … })` | block-state properties | `minecraft:furnace[facing=north]` |
| `.data(nbt)` | block-entity NBT | `minecraft:chest{Lock:"key"}` |
| `Block.tag(BLOCK_TAGS.LOGS)` | a `#tag` for predicate positions | `#minecraft:logs` |

State also works positionally - `Block("furnace", { facing: "north" })` - and a leading
`#` (or `Block.tag(...)`) makes a block *tag* for `if block` / `fill … replace` predicate
slots. Prefer the typed [`BLOCK_TAGS`](/api/helix/variables/BLOCK_TAGS) constants over
hand-written `"#minecraft:…"` strings.

```ts compile
import { Datapack, v26_2, Pos, Block, BLOCK_TAGS } from "helix";

const dp = new Datapack("world", v26_2);

const fn = dp.createFunction("build_room");
fn.build((ctx) => {
  // A hollow shell of stone bricks. The mode methods take their own corners +
  // block, so a plain solid fill is `ctx.fill(from, to, block)` and a mode is
  // `ctx.fill().<mode>(from, to, block)`.
  ctx.fill().hollow(Pos(0, 64, 0), Pos(6, 68, 6), Block.STONE_BRICKS);

  // A furnace facing north, with block-entity data.
  ctx.setblock(
    Pos(3, 65, 0),
    Block.FURNACE.state({ facing: "north" }).data('{CustomName:\'"Forge"\'}'),
  );

  // Fill torches only where there's currently air (a block tag as the filter).
  ctx.fill().replace(Pos(1, 65, 1), Pos(5, 67, 5), Block.TORCH, Block.tag(BLOCK_TAGS.AIR));
});
```

## Going further

Positions and blocks flow straight into [Execute chains](/guide/concepts/execute)
(`.positioned`, `.ifBlock`) and into data resources - a `Block` also exposes
`.toBlockState()` for the `{Name, Properties}` compound that `block_display` and
`block_state` fields expect. See [Items & NBT](/guide/concepts/items-and-nbt) for the value
type on the item side.
