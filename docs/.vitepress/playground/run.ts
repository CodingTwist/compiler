// The in-browser compile core - the client-side twin of the build-time
// `compile-helix.mjs` plugin. It transpiles the user's TypeScript with
// esbuild-wasm, then runs it against `helix/browser` (the disk-free entry) and
// returns the emitted datapack files. Same "inject helix's exports as function
// arguments + require a top-level `dp`" contract the server plugin uses, so code
// that works on a docs page works here unchanged.
import * as esbuild from "esbuild-wasm";
// Vite resolves this to the shipped wasm binary's URL.
import wasmURL from "esbuild-wasm/esbuild.wasm?url";
import * as helix from "helix/browser";
import type { RawProfile, VersionProfile } from "helix/browser";

const BASE = import.meta.env.BASE_URL; // honours a deployed sub-path base

let esbuildReady: Promise<void> | null = null;
function initEsbuild(): Promise<void> {
  if (!esbuildReady) esbuildReady = esbuild.initialize({ wasmURL, worker: true });
  return esbuildReady;
}

// Version identifier (as written in code) -> the static data file we fetch.
export const VERSION_FILES: Record<string, string> = {
  v1_20_1: "1_20_1.json",
  v1_20_4: "1_20_4.json",
  v1_21_4: "1_21_4.json",
  v26_2: "26_2.json",
};

const profileCache = new Map<string, VersionProfile>();
async function loadProfile(name: string): Promise<VersionProfile> {
  const cached = profileCache.get(name);
  if (cached) return cached;
  const res = await fetch(`${BASE}versions/${VERSION_FILES[name]}`);
  if (!res.ok) throw new Error(`could not load version data for ${name}`);
  // Bracket access (not `helix.profileFromRaw`): helix's dist is CommonJS, and a
  // dotted read on a namespace import of a CJS module trips a Rollup
  // "not exported" false-positive. The runtime namespace has every export
  // (that's also what the injection below relies on via Object.keys).
  const profileFromRaw = (helix as Record<string, unknown>)["profileFromRaw"] as (
    raw: RawProfile,
  ) => VersionProfile;
  const profile = profileFromRaw((await res.json()) as RawProfile);
  profileCache.set(name, profile);
  return profile;
}

// Strip every `import ... from "..."` / bare `import "..."` line: the browser
// can't resolve module specifiers, and helix's exports are injected instead.
const IMPORT_RE = /^[ \t]*import\b[^\n]*?(?:from[ \t]*["'][^"']*["']|["'][^"']*["'])[ \t]*;?[ \t]*$/gm;

export interface CompileOk {
  ok: true;
  files: [string, string][];
}
export interface CompileErr {
  ok: false;
  error: string;
}
export type CompileResult = CompileOk | CompileErr;

/**
 * Transpile + run `source`, returning the emitted `[path, contents]` files (as
 * `buildDatapack` produces them) or a readable error. `source` must leave a
 * top-level `const dp` (a built `Datapack`), exactly like a `ts compile` block.
 */
export async function compile(source: string): Promise<CompileResult> {
  try {
    await initEsbuild();
    const stripped = source.replace(IMPORT_RE, "");
    const { code } = await esbuild.transform(stripped, {
      loader: "ts",
      target: "es2020",
    });

    // Fetch only the version profiles the code actually names.
    const needed = Object.keys(VERSION_FILES).filter((v) =>
      new RegExp(`\\b${v}\\b`).test(source),
    );
    const profiles = await Promise.all(needed.map(loadProfile));

    // Inject every helix export as a function argument (so authoring code can
    // reference `Datapack`, `Selector`, `buildDatapack`, … directly). Filter to
    // legal, non-reserved identifiers: CJS interop adds `default`/`__esModule` to
    // the namespace, and `default` is a reserved word - an invalid parameter name.
    const helixKeys = Object.keys(helix).filter(
      (k) => /^[A-Za-z_$][\w$]*$/.test(k) && k !== "default" && k !== "__esModule",
    );
    const helixVals = helixKeys.map((k) => (helix as Record<string, unknown>)[k]);

    const body =
      code +
      '\n;if (typeof dp === "undefined") throw new Error(' +
      '"Your code must leave a top-level `const dp` (a built Datapack).");' +
      "\nreturn [...buildDatapack(dp)];";

    const runner = new Function(...helixKeys, ...needed, body) as (
      ...args: unknown[]
    ) => [string, string][];
    const files = runner(...helixVals, ...profiles);
    return { ok: true, files };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
