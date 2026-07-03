import fs from "fs";
import path from "path";
import { VersionProfile } from "./profile";
import { profileFromRaw, RawProfile } from "./raw-profile";

/**
 * Build a VersionProfile from its persisted `data/<file>` JSON. The raw mcmeta
 * data lives in real `.json` files (read and parsed here) rather than baked into
 * TypeScript source, so the profile modules stay tiny and the data is just data.
 * Node-only (reads from disk); the browser builds profiles via `profileFromRaw`
 * (in ./raw-profile) from JSON it fetched at runtime.
 */
export function loadProfile(file: string): VersionProfile {
  const full = path.join(__dirname, "data", file);
  return profileFromRaw(JSON.parse(fs.readFileSync(full, "utf-8")) as RawProfile);
}
