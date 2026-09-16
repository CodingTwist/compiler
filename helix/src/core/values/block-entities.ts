import type { NbtValue } from "./nbt";
import { BlockEntityNbtValue } from "./block-entity-nbt";
import { BLOCK_ENTITY_FACTORY_NAMES, BLOCK_ID_TO_BLOCK_ENTITY_TYPE } from "./block-entities.generated";

/** The raw-NBT warning for block entities. Schemas are generated into `block-entities.generated.ts`. */

// --- the raw-NBT warning ------------------------------------------------------------

/** One warning per call site - the point is to teach the API, not to spam a build log. */
const warnedSites = new Set<string>();

/** The frame that called `.data(...)` - i.e. the author's own line, not helix's. */
function callSite(): string {
  const frames = new Error().stack?.split("\n").slice(1) ?? [];
  const frame = frames.find(
    (f) => !/[\\/](block-entities|block)\.[jt]s:/.test(f) && /:\d+:\d+/.test(f),
  );
  return frame?.trim().replace(/^at\s+/, "") ?? "<unknown>";
}

/**
 * Warns that `.data()` got a raw NBT compound for a block whose id isn't known statically
 * (a dynamic block id widens to `string`, so the compile-time check in `BlockValue.data()`
 * can't reach it) but does resolve to a known block_entity_type at render time.
 *
 * Raw keys only work on one version; the block entity's factory handles spelling and
 * version changes. Not an error.
 */
export function warnRawBlockEntityNbt(nbt: string | NbtValue, blockId?: string): void {
  if (nbt instanceof BlockEntityNbtValue) return;
  const type = blockId !== undefined ? BLOCK_ID_TO_BLOCK_ENTITY_TYPE[blockId] : undefined;
  if (blockId !== undefined && type === undefined) return; // no typed factory exists for this block
  const site = callSite();
  if (warnedSites.has(site)) return;
  warnedSites.add(site);
  const factory = type !== undefined ? BLOCK_ENTITY_FACTORY_NAMES[type] : undefined;
  console.warn(
    `helix: raw Nbt${blockId !== undefined ? ` for ${blockId}` : ""} at ${site} - its keys ` +
      `are frozen to one version. ` +
      (factory
        ? `Use ${factory}({ … }) instead: it owns the key spelling per version. A field it ` +
          `is missing is a gap in scripts/gen-block-entity-nbt.mjs - fix it there.`
        : `If it needs to survive a version bump, use the block's own factory (Chest, ` +
          `Sign, Jukebox, … - one per block entity type in block-entities.generated.ts), ` +
          `or defineBlockEntityNbt() your own.`),
  );
}
