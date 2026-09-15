/**
 * A command interpreter for testing built packs without the game: scores, storage, entities,
 * blocks, `execute` and `/compute` with 26.3's float and overflow rules.
 *
 *   const sim = new Sim(buildDatapack(dp), { block: (x, y) => (y < 64 ? "minecraft:stone" : "minecraft:air") });
 *   sim.load();
 *   sim.tick();
 *   expect(sim.errors).toEqual([]);
 */
export { Sim, type SimOptions } from "./sim";
export type { SimEntity, SimSource } from "./types";
