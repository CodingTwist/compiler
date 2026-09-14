// Grapple options and the resolved per-install config.
import { Marker } from "helix";
import type { Block, Datapack, Nbt as NbtType } from "helix";
import { ANCHOR_TYPE, MAX_STEPS } from "../tuning";

/**
 * Options for {@link Datapack.grapple}. All optional.
 * The handle is cached per pack, so options from the first call win.
 */
export interface GrappleOptions {
  /**
   * Blocks a web can anchor to (a block id or `Block.tag(...)`). Default: any block.
   * The ray still stops at the first solid block; if it doesn't match, the grapple fizzles.
   */
  anchorOn?: Block;
  /** Maximum web reach in blocks (the raycast length). Default 50. */
  maxReach?: number;
}

/** Resolved config for one grapple install, so services don't re-derive values. */
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
    /** Marker NBT: just the tags used to find it. */
    anchorNbt(): NbtType {
      return Marker({ tags: ["grapple.anchor", "grapple._new"] });
    },
  };
}

/** The resolved grapple config - whatever {@link createConfig} returns. */
export type GrappleConfig = ReturnType<typeof createConfig>;
