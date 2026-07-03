import { Nbt } from "helix";
import type { Block, Nbt as NbtType } from "helix";
import { MAX_STEPS, ANCHOR_TYPE } from "./tuning";

/**
 * Author-facing knobs for {@link Datapack.grapple}. All optional - the bare
 * `dp.grapple()` reproduces the original behaviour (anchor on any solid block,
 * 50-block reach). The handle is cached per `Datapack`, so the options passed to
 * the **first** `dp.grapple(...)` call win; later calls return that same handle.
 */
export interface GrappleOptions {
  /**
   * Restrict which blocks a web can anchor to (a block id, or a tag via
   * `Block.tag("logs")`). The raycast still stops at the first solid block;
   * if that block doesn't match, the grapple simply fizzles (no anchor, no tag)
   * instead of latching. Default: anchor on anything the ray hits.
   */
  anchorOn?: Block;
  /** Maximum web reach in blocks (the raycast length). Default 50. */
  maxReach?: number;
}

/**
 * The resolved, immutable **config** for one grapple install - the `GrappleOptions`
 * turned into the concrete values the rest of the plugin reads (the raycast reach in
 * steps, the anchor block filter, the marker's entity type + NBT). One small
 * value-bag so no service re-derives `maxReach * 2` or re-hand-writes the marker tags.
 */
export function createConfig(opts: GrappleOptions = {}) {
  // maxReach is in blocks; the marcher steps 0.5 blocks, so 2 steps per block.
  const maxSteps =
    opts.maxReach !== undefined ? Math.max(1, Math.round(opts.maxReach * 2)) : MAX_STEPS;

  return {
    /** The anchor block filter (or `undefined` = anchor on anything). */
    anchorOn: opts.anchorOn,
    /** Raycast reach in 0.5-block steps. */
    maxSteps,
    /** The invisible marker entity the anchor is (a position holder; no leash is drawable). */
    anchorType: ANCHOR_TYPE,
    /**
     * NBT for the marker anchor - just the tags that find it later (structured, not a
     * hand-built SNBT string, so it renders through helix's serializer).
     */
    anchorNbt(): NbtType {
      return Nbt({ Tags: ["grapple.anchor", "grapple._new"] });
    },
  };
}

/** The resolved grapple config - whatever {@link createConfig} returns. */
export type GrappleConfig = ReturnType<typeof createConfig>;
