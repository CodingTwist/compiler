# Twine module: the door

`lab`'s door module (`lab/src/modules/door/door.module.ts`) is the reference example for
a full twine feature: a block-display door slab, flanked by spinning cogs, driven by
`register`/`onLoad`/`tick` lifecycle hooks and the `spool` clip engine underneath. It
also composes across all three layers - helix typed values, a spool plugin
(`installKit([clip])`), and twine's `defineModule`/`DatapackModule` contract.

## Defining a configurable feature

Rather than a single fixed module, the door is a **factory**: `Door(config)` returns a
`ConfiguredModule`, so the same feature can be dropped into `imports` many times with
different settings:

```ts
import { defineModule, type ConfiguredModule, type DatapackModule } from "twine";

export interface DoorConfig {
  id: string;
  base: PosValue;
  slideSeconds?: number;
  onOpen?: (ctx: FunctionContext) => void;
}

class DoorFeature implements DatapackModule {
  constructor(private readonly cfg: DoorConfig) {}

  register(dp: Datapack): void {
    // build-time setup: objectives, functions, structures
  }

  onLoad(ctx: FunctionContext): void {
    // runs unconditionally on pack load
  }
}

export function Door(config: DoorConfig): ConfiguredModule {
  return defineModule({ name: `door_${config.id}` }, new DoorFeature(config));
}
```

## `register`: building on a spool plugin

`register` is where the door builds its clips - using spool's `clip` plugin, installed
once at module load:

```ts
import { installKit } from "spool";
import { clip } from "spool/plugins/clip";

installKit([clip]); // installs dp.clip() / dp.cutscene()

// inside register(dp):
const door = doorModel().named(`${id}_door`).brightness(15);
const doorSlide = dp.clip(door).move([0, -slideDown, 0]).forSeconds(seconds);

dp.createFunction(`door/${id}/open`).build((ctx) => {
  doorSlide.play(ctx);
  ctx.schedule().function_(FunctionId(`${ns}:door/${id}/open_finish`), Time(clearAt));
});

dp.createFunction(`door/${id}/close`).build((ctx) => {
  doorSlide.reverse(ctx);
});
```

## Wiring it into a pack

Each call to `Door(...)` is its own module - drop the result straight into an
`@Module`'s `imports`:

```ts
@Module({
  imports: [
    Door({ id: "vault", base: Pos(-35, 100, -26) }),
    Door({
      id: "lobby",
      base: Pos(10, 64, 40),
      slideDown: 10,
      onOpen: (ctx) => ctx.tellraw(Selector.allPlayers(), "The lobby opens!"),
    }),
  ],
})
export class AppModule {}
```

Comment out a `Door(...)` line and it's gone at compile time - nothing is emitted for a
module not reachable through `imports`.

See the full module at `lab/src/modules/door/door.module.ts` for the real per-tick
proximity logic (materializing the display only near a player) and the cog geometry;
the [twine guide](/guide/twine) covers the lifecycle contract this example implements.
