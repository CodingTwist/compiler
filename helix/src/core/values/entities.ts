import type { NbtValue } from "./nbt";
import { EntityNbtValue } from "./entity-nbt";
import { ENTITY_FACTORY_NAMES } from "./entities.generated";

/** The raw-NBT warning. The schemas are generated into `entities.generated.ts`. */

// --- the raw-NBT warning ------------------------------------------------------------

/** One warning per call site - the point is to teach the API, not to spam a build log. */
const warnedSites = new Set<string>();

/** The frame that called the command - i.e. the author's own line, not helix's. */
function callSite(): string {
  const frames = new Error().stack?.split("\n").slice(1) ?? [];
  const frame = frames.find(
    (f) => !/[\\/](entities|summon|data)\.[jt]s:/.test(f) && /:\d+:\d+/.test(f),
  );
  return frame?.trim().replace(/^at\s+/, "") ?? "<unknown>";
}

/**
 * Warns that a command got a raw entity NBT compound.
 *
 * Raw keys only work on one version; the entity's factory handles spelling and version
 * changes.
 * Not an error. Pass `entity` so the message can name the factory.
 */
export function warnRawEntityNbt(nbt: NbtValue, entity?: string): void {
  if (nbt instanceof EntityNbtValue) return;
  const site = callSite();
  if (warnedSites.has(site)) return;
  warnedSites.add(site);
  const factory =
    entity !== undefined ? ENTITY_FACTORY_NAMES[entity] : undefined;
  console.warn(
    `helix: raw Nbt${entity !== undefined ? ` for ${entity}` : ""} at ${site} - its keys ` +
      `are frozen to one version. ` +
      (factory
        ? `Use ${factory}({ … }) instead: it owns the key spelling per version. A field it ` +
          `is missing is a gap in scripts/gen-entity-nbt.mjs - fix it there.`
        : `If it needs to survive a version bump, use the entity's own factory (Tnt, ` +
          `Villager, Zombie, … - one per entity in entities.generated.ts), a base ` +
          `(Entity/Living/Mob), or defineEntityNbt() your own.`),
  );
}
