import { Datapack, FunctionContext, ItemValue, Selector } from "helix";
import { isDev } from "../core/env";

/**
 * Dev-only give commands for named items.
 *
 * Plain {@link ItemValue} items have no give function, so testing means retyping their data.
 * {@link registerItem} names one, and {@link registerItemGiveCommands} emits
 * `/function <ns>:debug/give/<name>` for each.
 */

// ponytail: process-global, so two packs built in one run would share it. Key it by Datapack if
// that happens.
const REGISTRY: { name: string; item: ItemValue }[] = [];

/** Registers `item` under `name` for the give commands, and returns it unchanged. */
export function registerItem<T extends ItemValue>(name: string, item: T): T {
  REGISTRY.push({ name, item });
  return item;
}

/**
 * Emits a `<path>/<name>` give function per {@link registerItem}ed item. No-op in prod.
 *
 * Call from a module's `register`, after the item modules are imported.
 */
export function registerItemGiveCommands(
  dp: Datapack,
  path = "debug/give",
): void {
  if (!isDev()) return;
  for (const { name, item } of REGISTRY) {
    dp.root.public(`${path}/${name}`).build((ctx: FunctionContext) =>
      ctx.playerGive(Selector.self(), item),
    );
  }
}
