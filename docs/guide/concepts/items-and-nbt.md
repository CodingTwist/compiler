# Items & NBT

An [`Item`](/api/helix/type-aliases/Item) is the single source of truth for an item across
your whole pack, and [`Nbt`](/api/helix/type-aliases/Nbt) is the typed SNBT builder that
turns a JS object into correct data. Both hide a version split you'd otherwise have to
carry in your head: items lower to **data components** on 1.20.5+ and to **NBT** before it,
and typed numbers get the right SNBT suffix automatically.

## Items define once, render everywhere

Build the item once and hand the same object to every consumer. It lowers itself per target
version _and_ per context - an item-stack string for `give`, an `item_predicate` JSON body
for a `match_tool` check - so a granted item matches its own predicate by construction. You
never re-encode it.

| Method                    | Sets                                               |
| ------------------------- | -------------------------------------------------- |
| `.named(name)`            | `custom_name` (string or a styled component)       |
| `.lore(...lines)`         | `lore` lines                                       |
| `.enchant(id, level)`     | one enchantment (repeatable)                       |
| `.count(n)`               | stack size                                         |
| `.model(ref)`             | the `item_model` component (from `dp.model(...)`)  |
| `.modelData(n)`           | raw `custom_model_data` escape hatch               |
| `.component(name, value)` | a raw component the typed builders don't model yet |
| `.data(raw)`              | verbatim `[components]` / `{nbt}` escape hatch     |

```ts compile
import { Datapack, v26_2, Selector, Item, Enchantment } from "helix";

const dp = new Datapack("loot", v26_2);

const fn = dp.createFunction("grant");
fn.build((ctx) => {
  const excalibur = Item.DIAMOND_SWORD.named({
    text: "Excalibur",
    color: "aqua",
    italic: false,
  })
    .enchant(Enchantment.SHARPNESS, 5)
    .enchant(Enchantment.UNBREAKING, 3)
    .lore("Pulled from the stone");

  ctx.playerGive(Selector.nearest(), excalibur);
});
```

Bare ids and `#tags` work too (`Item("diamond")`, `Item("#planks")`), and a typed member
(`Item.DIAMOND_SWORD`) autocompletes the vanilla ids.

## NBT and typed numbers

`Nbt(obj)` serialises a JS value to SNBT at codegen. JS has one number type but SNBT has
several, so wrap fractional/tagged numbers with the helpers or they round-trip wrong:

| Helper                 | SNBT        | Use                                         |
| ---------------------- | ----------- | ------------------------------------------- |
| `Float(n)`             | `1.0f`      | 32-bit float (motion, rotations)            |
| `Double(n)`            | `1.0d`      | 64-bit double (positions)                   |
| `Byte(n)`              | `1b`        | byte - and how booleans are usually written |
| `Short(n)` / `Long(n)` | `1s` / `1l` | short / long                                |

A plain JS number stays an int, strings are quoted, and any value object (a `Block`, say)
embedded in the tree renders itself version-aware. That's why you build the tree instead of
writing the string: `{Pos:[Double(0.5), …]}` gets the `d` suffixes for free.

```ts compile
import { Datapack, v26_2, Pos, Nbt, Byte, Float, EntityType } from "helix";

const dp = new Datapack("mobs", v26_2);

const fn = dp.createFunction("spawn_guard");
fn.build((ctx) => {
  ctx.summon(
    EntityType.ARMOR_STAND,
    Pos.here(),
    Nbt({
      NoGravity: Byte(1),
      Invisible: Byte(1),
      Rotation: [Float(90), Float(0)],
      CustomName: '"Guard"',
    }),
  );
});
```

## Entity NBT is typed per entity

The block above is the escape hatch, not the normal way. Every vanilla entity has a
**factory of its own** - `Tnt`, `Villager`, `Zombie`, `ArmorStand`, … one per entity type,
generated from the vanilla schemas - so you name fields in camelCase and the compiler owns
the vanilla key, the SNBT suffix, and the version history:

```ts compile
import { Datapack, v26_2, Pos, Block, Tnt } from "helix";

const dp = new Datapack("mobs", v26_2);

const fn = dp.createFunction("airburst");
fn.build((ctx) => {
  ctx.summon(
    Tnt({
      fuse: 40,
      blockState: Block.SAND,
      motion: [0, 1, 0],
    }),
    Pos.local(0, 0, 2),
  );
});
```

Note there is no `EntityType` argument: a curated schema _names its entity_, so
`ctx.summon(nbt, pos)` states the type once. (The three-argument
`ctx.summon(EntityType.X, pos, nbt)` form still exists for raw NBT and for a type chosen at
runtime.)

The keys are the concepts, not the spellings. `fuse` is `Fuse` before 1.20.3 and `fuse`
after; `fallDistance` is a float then a double; `blockState` takes a real `Block`. Fields
the target version doesn't have are **dropped**, not emitted wrong:

```ts
const tnt = Tnt({ fuse: 40, blockState: Block.SAND });
tnt.render(v1_21_4); // {fuse:40s,block_state:{Name:"minecraft:sand"}}
tnt.render(v1_20_1); // {Fuse:40s}          - no block_state before 1.20.3
```

Value objects go in whole, the same ones you'd hand to `give` - an equipment slot takes an
`Item`, not a re-encoded stack:

```ts compile
import { Datapack, v26_2, Pos, Pillager, Item, Enchantment } from "helix";

const dp = new Datapack("mobs", v26_2);

const fn = dp.createFunction("battery");
fn.build((ctx) => {
  ctx.summon(
    Pillager({
      persistenceRequired: true,
      tags: ["artillery"],
      equipment: {
        mainhand: Item.CROSSBOW.enchant(Enchantment.QUICK_CHARGE, 3),
        head: Item.IRON_HELMET,
      },
    }),
    Pos.rel(0, 0, 12),
  );
});
```

Nested compounds stay typed one level down (`Villager({ villagerData: { level: 2,
profession: "farmer" } })`). There is no raw-key escape hatch: a field a factory is
missing is a gap in the generator (`helix/scripts/gen-entity-nbt.mjs`), and fixing it
there types it for every consumer rather than freezing one call site to one version.

Curating an entity the compiler doesn't model is
[`defineEntityNbt`](/api/helix/functions/defineEntityNbt) - the same mechanism the
generated factories are built from.

## Going further

An `Item` also flows into predicates and loot - `Item.toPredicate(...)` and
`componentsJson(...)` are the same definition rendered for a `match_tool` condition or a
`set_components` loot function; see [Data resources](/guide/concepts/data-resources).
`Nbt` values slot into [`Selector.nbt(...)`](/guide/concepts/selectors) and any command that
takes a data tag.
