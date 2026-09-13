import fs from "fs";
import path from "path";
import { VersionProfile } from "./profile";
import { profileFromRaw, RawProfile } from "./raw-profile";

/**
 * Loads a VersionProfile from `data/<file>` JSON. Node-only; browsers use `profileFromRaw`.
 */
export function loadProfile(file: string): VersionProfile {
  const full = path.join(__dirname, "data", file);
  if (!fs.existsSync(full)) {
    throw new Error(`helix: Minecraft version data missing (${full}). Run \`npx helix data\` to download it.`);
  }
  return profileFromRaw(JSON.parse(fs.readFileSync(full, "utf-8")) as RawProfile);
}
