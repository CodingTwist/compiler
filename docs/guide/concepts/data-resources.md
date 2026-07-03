# Data resources

Not everything a pack needs is a command. Predicates, loot tables, advancements, recipes,
and item modifiers are **JSON files** the game reads. Helix builds them from typed value
trees and registers them on the [`Datapack`](/api/helix/classes/Datapack), handing back a
*reference* you pass around - you never write the file path or the id string twice.

Every registrar follows the same shape: `dp.<kind>(name, def)` writes the file and returns
a typed handle.

| Registrar | Builds | Returns |
| --- | --- | --- |
| `dp.predicate(name, def)` | a [`Predicate`](/api/helix/classes/Predicate) tree | `PredicateRef` |
| `dp.lootTable(name, def)` | a loot table | `LootTableRef` |
| `dp.advancement(name, def)` | an advancement | `Advancement` |
| `dp.recipe(name, def)` | a recipe | `RecipeRef` |
| `dp.itemModifier(name, def)` | an item modifier | `ItemModifierRef` |

## Predicates: the "over NBT" workhorse

A [`Predicate`](/api/helix/classes/Predicate) is a composable condition tree. Its reason to
exist: express an entity-state check - *including NBT* - **once**, as a typed,
engine-evaluated, referenceable file, instead of inlining `nbt={…}` into every selector.

Leaf conditions are static factories (`Predicate.entity`, `.scores`, `.blockState`,
`.location`, `.matchTool`, `.holding`, `.weather`, `.randomChance`, `.reference`), and they
compose with `.and()` / `.or()` / `.not()` (or `Predicate.all/any/not`):

```ts compile
import { Datapack, v26_2, Selector, Predicate, Nbt, Short } from "helix";

const dp = new Datapack("checks", v26_2);

// Register once…
const focused = dp.predicate(
  "focused",
  Predicate.entity({ flags: { is_sneaking: true }, nbt: Nbt({ SleepTimer: Short(0) }) })
    .and(Predicate.scores({ combo: { min: 3 } })),
);

const fn = dp.createFunction("reward");
fn.build((ctx) => {
  // …reference by handle anywhere a predicate is accepted.
  ctx.tellraw(Selector.allPlayers().predicate(focused), "focused bonus!");
});
```

The `PredicateRef` (`focused`) flows into two places, both by handle rather than id string:

- **`Selector.predicate(ref)`** - `@a[predicate=checks:focused]`, checked engine-side.
- **`predicateCheck(ref)`** for `ctx.if(...)` - `execute if predicate checks:focused run …`.

## Items are their own predicate

Because an [`Item`](/guide/concepts/items-and-nbt) lowers itself to both a give-stack and an
`item_predicate`, a check built from an item matches the item you granted by construction:

```ts compile
import { Datapack, v26_2, Selector, Item, Enchantment, Predicate } from "helix";

const dp = new Datapack("checks", v26_2);

const wand = Item.STICK.named("Wand").enchant(Enchantment.KNOCKBACK, 1);

const holdingWand = dp.predicate("holding_wand", Predicate.holding(wand));

const fn = dp.createFunction("cast");
fn.build((ctx) => {
  ctx.tellraw(Selector.allPlayers().predicate(holdingWand), "you feel a spark");
});
```

`Predicate.matchTool(item)` is the loot/mining-context sibling; `Predicate.holding(item,
slot)` matches an equipment slot on an entity.

## Going further

The loot/recipe/advancement builders follow the same "build a typed `*Def`, register, get a
ref" pattern - see them under **Data resources** in the [API reference](/api/). For raw JSON
the typed builders don't model yet, `dp.registryFile(...)` is the one sanctioned escape
hatch, and [`validateDatapack`](/api/helix/functions/validateDatapack) checks emitted JSON
against the vanilla schema for your target version.
