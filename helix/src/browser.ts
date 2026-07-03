// Browser entry point (`helix/browser`). The full authoring surface WITHOUT
// anything that touches Node built-ins: no eager disk-backed version constants
// (`v1_21_4`, …) and no `validateDatapack` (Spyglass + `fs`). Build a version
// profile at runtime from fetched mcmeta JSON with `profileFromRaw` (re-exported
// from ./public-api):
//
//   import { Datapack, buildDatapack, profileFromRaw } from "helix/browser";
//   const raw = await (await fetch("/versions/1_21_4.json")).json();
//   const dp = new Datapack("demo", profileFromRaw(raw));
//   const files = buildDatapack(dp); // Map<path, contents>, no disk I/O
//
// This module's entire import graph is free of `fs`/`path`/`zlib`; the disk
// writers (`dp.writeDatapack`/`writeResourcePack`) are dynamic-imported by the
// Datapack methods, so they never enter a browser bundle unless actually called.
export * from "./public-api";
// Re-exported explicitly (as well as via the star above) so bundlers' CJS
// named-export detection sees it directly - the playground imports it by name to
// build a VersionProfile from fetched JSON.
export { profileFromRaw, type RawProfile } from "./versions/raw-profile";
