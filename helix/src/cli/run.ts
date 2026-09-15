// `helix <command>`: build, dev, report, profile or validate the pack in the working
// directory.
import fs from "fs";
import { parseArgs } from "util";
import { RUNTIME_TARGETS, type RuntimeTarget } from "../core/ir/target";
import type { ProfileDump } from "../core/report/profile";
import { latestProfile, PROFILE_DIR } from "../core/report/profile-file";
import { loadPack, worldDir, type LoadResult } from "./load";
import * as profiles from "../versions/profiles";
import type { VersionProfile } from "../versions/profile";

/** Looks up a known {@link VersionProfile} by its human id, e.g. "1.21.4". */
function versionById(id: string): VersionProfile {
  const found = knownVersions().find((p) => p.id === id);
  if (!found) {
    throw new Error(
      `helix: unknown --version "${id}" - known versions: ${knownVersions()
        .map((p) => p.id)
        .join(", ")}`,
    );
  }
  return found;
}

function knownVersions(): VersionProfile[] {
  return Object.values(profiles);
}

const USAGE = `usage: helix <command> [options]

  build [--prod]          write the datapack (and resource pack, if configured)
  dev                     build, then rebuild when files change
  report [--strict]       per-tick cost report; --strict exits 1 on warnings/lints
                          --json prints findings with their TS source lines (for editors)
  profile [dump.json]     measured profile from the newest /helixprof dump (or the given one)
  validate                check emitted JSON against the vanilla schema
  data [--force]          download the Minecraft version data (not shipped; needs network)
  versions                list known Minecraft versions (for --version)

  --target <t>            build only this runtime target
  --prod                  prod mode (debug off, twine prunes dev modules)
  --version <id>          force a Minecraft version, e.g. "1.21.4" (overrides the config)
  --no-inline             disable the single-command inlining pass
  --no-group              disable the execute-prefix grouping pass
  --comments              write "# <file>:<line>" source comments above commands
  --no-comments           strip them, even if helix.config.ts turns them on`;

/** Runs a CLI invocation; resolves to the process exit code. */
export async function runCli(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      prod: { type: "boolean" },
      strict: { type: "boolean" },
      json: { type: "boolean" },
      target: { type: "string" },
      version: { type: "string" },
      "no-inline": { type: "boolean" },
      "no-group": { type: "boolean" },
      comments: { type: "boolean" },
      "no-comments": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [command, arg] = positionals;
  if (values.help || !command) {
    console.log(USAGE);
    return command || values.help ? 0 : 1;
  }
  const mode = values.prod ? "prod" : "dev";
  if (
    values.target &&
    !RUNTIME_TARGETS.includes(values.target as RuntimeTarget)
  ) {
    console.error(
      `helix: unknown --target "${values.target}" - expected one of ${RUNTIME_TARGETS.join(", ")} (for a Minecraft version, use --version)`,
    );
    return 1;
  }
  const target = values.target as RuntimeTarget | undefined;
  const version = values.version ? versionById(values.version) : undefined;
  const optimize = {
    ...(values["no-inline"] ? { inline: false } : {}),
    ...(values["no-group"] ? { group: false } : {}),
  };
  const debug = values.comments
    ? { comments: true }
    : values["no-comments"]
      ? { sources: false, comments: false }
      : undefined;
  const load = () => loadPack({ mode, target, version, optimize, debug });
  // Source tracking is forced on so every finding carries its TS line.
  const reportJson = async (strict?: boolean) => {
    // Pack code that logs must not corrupt the JSON on stdout.
    const out = console.log;
    console.log = console.error;
    let warned = false;
    let result;
    try {
      const { root, packs } = await loadPack({
        mode,
        target,
        version,
        optimize,
        debug: { sources: true },
      });
      result = {
        root,
        packs: packs.map(({ target, dp }) => {
          const { lints, warnings, staleAllows } = dp.report();
          warned =
            warnings.length + lints.length + staleAllows.length > 0 || warned;
          return { target, lints, warnings, staleAllows };
        }),
      };
    } finally {
      console.log = out;
    }
    console.log(JSON.stringify(result));
    return strict && warned ? 1 : 0;
  };

  switch (command) {
    case "versions":
      for (const p of knownVersions()) console.log(p.id);
      return 0;
    case "build":
    case "dev":
      return build(await load());
    case "report": {
      if (values.json) return reportJson(values.strict);
      let warned = false;
      for (const { dp } of (await load()).packs) {
        const r = dp.printReport();
        warned =
          r.warnings.length + r.lints.length + r.staleAllows.length > 0 ||
          warned;
      }
      return values.strict && warned ? 1 : 0;
    }
    case "profile":
      return profile(await load(), arg);
    case "validate":
      return validate(await load());
    default:
      console.error(`helix: unknown command "${command}"\n\n${USAGE}`);
      return 1;
  }
}

async function build({ config, packs }: LoadResult): Promise<number> {
  for (const { target, dp, out } of packs) {
    await dp.writeDatapack(out.datapack, {
      zip: out.datapack.endsWith(".zip"),
    });
    if (out.resourcePack) await dp.writeResourcePack(out.resourcePack);
    const rp = out.resourcePack
      ? `  (+ resource pack -> ${out.resourcePack})`
      : "";
    console.log(`[${config.name}:${target}] datapack -> ${out.datapack}${rp}`);
  }
  return 0;
}

function profile(loaded: LoadResult, dumpFile?: string): number {
  const found = dumpFile
    ? {
        file: dumpFile,
        dump: JSON.parse(fs.readFileSync(dumpFile, "utf8")) as ProfileDump,
      }
    : latestProfile(worldDir(loaded));
  if (!found) {
    console.error(
      `helix: no profile dump in ${worldDir(loaded)}/${PROFILE_DIR} - run /helixprof start, then /helixprof stop`,
    );
    return 1;
  }
  console.log(found.file);
  for (const { dp } of loaded.packs) dp.printProfileReport(found.dump);
  return 0;
}

async function validate({ packs }: LoadResult): Promise<number> {
  const { validateDatapack, formatMcdocDiagnostics } =
    await import("../validate/index.js");
  let errors = false;
  for (const { dp } of packs) {
    const problems = await validateDatapack(dp);
    console.log(formatMcdocDiagnostics(problems));
    errors = problems.some((p) => p.severity === "error") || errors;
  }
  return errors ? 1 : 0;
}
