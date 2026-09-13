import { VersionProfile } from "./profile";

/** Ensure an id has an explicit namespace (defaults to `minecraft:`). */
export function normalizeId(id: string): string {
  return id.includes(":") ? id : `minecraft:${id}`;
}

/**
 * Checks an id against a version's registry. Returns the normalized id, or throws naming
 * the version.
 */
export function validateRegistryId(
  version: VersionProfile,
  registry: ReadonlySet<string>,
  registryName: string,
  id: string,
): string {
  const normalized = normalizeId(id);
  if (!registry.has(normalized)) {
    throw new Error(
      `Unknown ${registryName} "${normalized}" for Minecraft ${version.id}`,
    );
  }
  return normalized;
}
