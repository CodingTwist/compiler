// Browser entry point (`helix/browser`): the authoring API without Node built-ins.
//
// No disk-loaded version constants or `validateDatapack`. Build a profile from fetched
// JSON:
//
//   import { Datapack, buildDatapack, profileFromRaw } from "helix/browser";
//   const raw = await (await fetch("/versions/1_21_4.json")).json();
//   const dp = new Datapack("demo", profileFromRaw(raw));
//   const files = buildDatapack(dp); // Map<path, contents>, no disk I/O
//
// Disk writers are dynamic-imported, so they stay out of browser bundles unless called.
export * from "./public-api";
// Also exported by name so bundlers' CJS named-export detection finds it.
export { profileFromRaw, type RawProfile } from "./versions/raw-profile";
