// Finds the profile dump the helix-profiler mod wrote. Node-only.
import fs from "fs";
import path from "path";
import type { ProfileDump } from "./profile";

/** Folder, under the world root, the mod's `/helixprof stop` writes into. */
export const PROFILE_DIR = "helix-profile";

/** The newest `profile-<ms>.json` for `worldDir`, or `undefined` if none. */
export function latestProfile(worldDir: string): { file: string; dump: ProfileDump } | undefined {
  const dir = path.join(worldDir, PROFILE_DIR);
  if (!fs.existsSync(dir)) return undefined;
  const stamp = (f: string) => Number(/^profile-(\d+)\.json$/.exec(f)?.[1] ?? -1);
  const newest = fs.readdirSync(dir).filter((f) => stamp(f) >= 0).sort((a, b) => stamp(b) - stamp(a))[0];
  if (!newest) return undefined;
  const file = path.join(dir, newest);
  return { file, dump: JSON.parse(fs.readFileSync(file, "utf8")) as ProfileDump };
}
