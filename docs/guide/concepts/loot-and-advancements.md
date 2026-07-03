# Loot tables & advancements

Two more [data resources](/guide/concepts/data-resources), both built from typed value trees
and registered with the `dp.<kind>(name, def) → ref` pattern. They pair up naturally:
advancements are the cheapest way to *detect* a player event, and loot tables are a clean way
to *hand out* items - and both reuse the same [`Item`](/guide/concepts/items-and-nbt) you'd
`give`, so a dropped or granted item is defined exactly once.

## Loot tables

A [`LootTableDef`](/api/helix/classes/LootTableDef) is a list of
[`LootPool`](/api/helix/classes/LootPool)s; each pool has a roll count and weighted entries.
An **item entry reuses an `Item`** - if that item carries a count or components, the matching
`set_count` / `set_components` functions are added for you, so the loot output matches the
give form by construction.

```ts compile
import { Datapack, v26_2, Item, LootTableDef, LootPool } from "helix";

const dp = new Datapack("loot", v26_2);

dp.lootTable(
  "chests/reward",
  new LootTableDef("chest")
    .pool(
      new LootPool()
        .rolls(1)
        .item(Item.DIAMOND.count(3), { weight: 1 })
        .item(Item.GOLDEN_APPLE.named("Prize"), { weight: 3 })
        .empty(2), // a chance to roll nothing
    ),
);
```

`dp.lootTable` returns a `LootTableRef` you reference from `/loot … loot <ref>`, a container's
`set_loot`, or a nested loot entry (`pool.lootTable(ref)`) - by handle, never by id string.
Pool entries also take pool-wide and per-entry `func(...)` loot functions.

## Advancements as event handlers

The common use of an [`AdvancementDef`](/api/helix/classes/AdvancementDef) here isn't a
player-facing achievement - it's a **hidden trigger**: no display, one criterion, a reward
function that runs your behaviour and then revokes the advancement to re-arm it. That gives
you an event handler firing once per occurrence, for events selectors can't catch (using an
item, hurting an entity, …).

[`Trigger`](/api/helix/classes/Trigger) builds the criterion from typed concepts -
`Trigger.usingItem(item)` and `Trigger.playerHurtEntity(item)` reuse the item's own predicate
form, so "fired while holding this" matches the exact item you granted:

```ts compile
import { Datapack, v26_2, Selector, Item, Enchantment, AdvancementDef, Trigger } from "helix";

const dp = new Datapack("wand", v26_2);

const wand = Item.STICK.named("Wand").enchant(Enchantment.KNOCKBACK, 1);

// Register the advancement; its reward points at the function id below.
const wandAdv = dp.advancement(
  "wand/on_use",
  new AdvancementDef()
    .criterion("used", Trigger.usingItem(wand))
    .reward("wand:wand/on_use"),
);

// The reward function: do the effect, then re-arm by revoking the advancement.
const onUse = dp.createFunction("wand/on_use");
onUse.build((ctx) => {
  ctx.tellraw(Selector.self(), "✦ zap ✦");
  ctx.advancement().revokeOnly(Selector.self(), wandAdv);
});
```

`dp.advancement` returns an `Advancement` handle (`wandAdv`), which is exactly what the reward
function revokes to re-arm - the id (`wand:wand/on_use`), the reward target, and the revoke
target are one value, not three strings you keep in sync.

## Going further

`Trigger.of(id, conditions)` is the escape hatch for any trigger the typed helpers don't
model. For the check-side counterparts - matching an item, an entity's state, a location -
see [`Predicate`](/guide/concepts/data-resources); for the item definitions both sides share,
[Items & NBT](/guide/concepts/items-and-nbt).
