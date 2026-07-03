# Resource-pack models

Custom item and block appearances live in a **resource pack**, not the datapack. Helix builds
that pack too: [`Model`](/api/helix/classes/Model) definitions, registered on the datapack,
emit the `assets/` tree - and, crucially, wire themselves into the datapack side with **no
magic numbers**. You attach a model to an [`Item`](/guide/concepts/items-and-nbt) and it
lowers to the typed `item_model` component (1.21.4+), not a `custom_model_data` integer you
have to track.

## A model, and the handle it hands back

`Model.item(texture)` is the flat sprite case; `Model.cubeAll` / `Model.cubeColumn` cover the
common block shapes, with `.parent`/`.texture` for anything else and a `.raw(json)` escape
hatch. `dp.model(name, def)` registers it and returns a
[`ModelRef`](/api/helix/classes/ModelRef) - the handle you attach with `Item.X.model(ref)`:

```ts compile
import { Datapack, v26_2, Selector, Item, Model } from "helix";

const dp = new Datapack("gear", v26_2);

// Register a model → get a handle. (The model JSON lands in the resource pack,
// written separately by dp.writeResourcePack - see below.)
const shooterModel = dp.model("web_shooter", Model.item("gear:item/web_shooter"));

const give = dp.createFunction("give_shooter");
give.build((ctx) => {
  // Attach the handle - it lowers to the item_model component, no magic number.
  const shooter = Item.CARROT_ON_A_STICK.named("Web Shooter").model(shooterModel);
  ctx.playerGive(Selector.nearest(), shooter);
});
```

## Two output packs, two writers

`buildDatapack` / `dp.writeDatapack(path)` emit the **datapack** (functions, tags, and the
JSON data resources). The resource pack is a *separate* tree with its own `pack.mcmeta`
format, written by **`dp.writeResourcePack(path)`** - so the `assets/` files (the model JSON,
the `items/` item definitions) don't appear in a datapack build. The compiled panels on this
page are datapack output; the model wiring you can see there is the `item_model` component on
the give command.

| Registrar | Emits (in the resource pack) | Handle |
| --- | --- | --- |
| `dp.model(name, def)` | `models/item/<name>` + `items/<name>` definition | `ModelRef` |
| `dp.blockModel(name, def)` | `models/block/<name>` | `ModelRef` |
| `dp.blockState(block, def)` | `blockstates/<block>` (overrides a vanilla block's look) | - |
| `dp.itemDefinition(name, model)` | the full typed `items/<name>` union (conditions, selects…) | `ModelRef` |
| `dp.addAssets(dir)` | copies a directory of textures/sounds verbatim | - |

## Version-aware, like everything else

The `item_model` component and `assets/<ns>/items/` definitions arrived in 1.21.4. On older
versions there's no such component, so a `ModelRef` falls back to a legacy `custom_model_data`
number - which you must supply (`dp.model(name, def, legacyModelData)`) or rendering throws.
That's the same "one definition, correct per target version" stance as items and NBT: you
describe the model once, and helix picks the right lowering for `dp.version`.

## Blocks

There is no vanilla "new block", so `dp.blockState` *overrides an existing block's* appearance
(the custom-block *technique* is [spool](/guide/spool) policy, not core). `dp.blockModel`
registers the model a blockstate variant points at. A [`Block`](/guide/concepts/positions-and-blocks)
also exposes `.toBlockState()` for the `{Name, Properties}` compound that `block_display` and
`block_state` fields want.

## Going further

The full item-model union - `condition`, `select`, `range_dispatch`, `composite`, `special`,
tints - is `dp.itemDefinition(name, ItemModel…)`; `dp.model` is its flat single-model case.
See **Data resources** in the [API reference](/api/) for the `ItemModel` builders.
