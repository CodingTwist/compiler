import { Datapack, FunctionContext, ItemValue, Selector } from "helix";
import { isDev } from "./env";

/**
 * Dev-only give commands for a pack's named items.
 *
 * An item declared as a plain {@link ItemValue} (rather than as a behavioural
 * {@link defineItem}) has no function to grant it, so testing anything that
 * requires holding one means retyping its full component data. Wrapping the
 * declaration in {@link registerItem} names it once, and
 * {@link registerItemGiveCommands} turns every name registered anywhere in the
 * pack into `/function <ns>:debug/give/<name>`.
 *
 * Dev-only on purpose: a prod pack ships no admin commands, and that's decided
 * by the build's one resolved env (see ./env.ts), not re-derived here.
 */

// ponytail: process-global and import-order dependent - one array for the whole
// process, filled as declaration modules are imported. Fine for the normal one
// pack per `node dist/main.js`; if two packs are ever built in one run they'd
// share it. Upgrade path: key the registry by Datapack.
const REGISTRY: { name: string; item: ItemValue }[] = [];

/** Registers `item` under `name` for the give commands, and returns it unchanged. */
export function registerItem<T extends ItemValue>(name: string, item: T): T {
  REGISTRY.push({ name, item });
  return item;
}

/**
 * Emit one `<path>/<name>` function per {@link registerItem}ed item, each granting
 * that item to `@s`. Call once, after the declaration modules have been imported
 * (i.e. from a module's `register`). No-op in a prod build.
 */
export function registerItemGiveCommands(dp: Datapack, path = "debug/give"): void {
  if (!isDev()) return;
  for (const { name, item } of REGISTRY) {
    dp.createFunction(`${path}/${name}`).build((ctx: FunctionContext) =>
      ctx.playerGive(Selector.self(), item),
    );
  }
}
