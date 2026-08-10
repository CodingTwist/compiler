import type { NbtValue } from "./nbt";
import { EntityNbtValue } from "./entity-nbt";
import { ENTITY_FACTORY_NAMES } from "./entities.generated";

/**
 * The raw-NBT warning. The curated schemas themselves live in `entities.generated.ts`
 * (generated from vanilla-mcdoc by `scripts/gen-entity-nbt.mjs`); this file is just the
 * nudge from a raw compound towards them.
 */

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
 * Warn that a command was handed a **raw** entity NBT compound. Raw keys are frozen to
 * one Minecraft version - an author who writes `{Fuse:40s}` gets a key 1.20.3+ silently
 * ignores - whereas the entity's factory owns the spelling, the SNBT suffix and the version
 * history, and takes a second argument for anything it doesn't curate. Not an error: an
 * uncurated entity is a legitimate reason to pass raw.
 *
 * Called by every command that takes entity NBT (`summon`, `data merge entity`); pass
 * `entity` when the command knows which one, so the message can name the factory.
 */
export function warnRawEntityNbt(nbt: NbtValue, entity?: string): void {
  if (nbt instanceof EntityNbtValue) return;
  const site = callSite();
  if (warnedSites.has(site)) return;
  warnedSites.add(site);
  const factory = entity !== undefined ? ENTITY_FACTORY_NAMES[entity] : undefined;
  console.warn(
    `helix: raw Nbt${entity !== undefined ? ` for ${entity}` : ""} at ${site} - its keys ` +
      `are frozen to one version. ` +
      (factory
        ? `Use ${factory}({ … }) instead: it owns the key spelling per version, and takes ` +
          `uncurated keys as its second argument.`
        : `If it needs to survive a version bump, use the entity's own factory (Tnt, ` +
          `Villager, Zombie, … - one per entity in entities.generated.ts), a base ` +
          `(Entity/Living/Mob), or defineEntityNbt() your own.`),
  );
}
