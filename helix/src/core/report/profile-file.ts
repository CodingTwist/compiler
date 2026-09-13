// Disk side of the measured profile: finds the dump the helix-profiler mod wrote.
// Node-only (profile-report.ts stays browser-safe and takes parsed JSON).
import fs from "fs";
import path from "path";
import type { ProfileDump } from "./profile-report";

/** Folder, under the world root, the mod's `/helixprof stop` writes into. */
export const PROFILE_DIR = "helix-profile";

/**
 * The newest `profile-<ms>.json` the mod wrote for `worldDir` (the save folder, the
 * parent of `datapacks/`), or `undefined` if none has been captured yet.
 */
export function latestProfile(worldDir: string): { file: string; dump: ProfileDump } | undefined {
  const dir = path.join(worldDir, PROFILE_DIR);
  if (!fs.existsSync(dir)) return undefined;
  const stamp = (f: string) => Number(/^profile-(\d+)\.json$/.exec(f)?.[1] ?? -1);
  const newest = fs.readdirSync(dir).filter((f) => stamp(f) >= 0).sort((a, b) => stamp(b) - stamp(a))[0];
  if (!newest) return undefined;
  const file = path.join(dir, newest);
  return { file, dump: JSON.parse(fs.readFileSync(file, "utf8")) as ProfileDump };
}
