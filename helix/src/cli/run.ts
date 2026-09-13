// `helix <command>`: build / dev / report / profile / validate a pack described by
// `helix.config.ts` in the working directory.
import fs from "fs";
import { parseArgs } from "util";
import type { RuntimeTarget } from "../core/ir/target";
import type { ProfileDump } from "../core/report/profile-report";
import { latestProfile, PROFILE_DIR } from "../core/report/profile-file";
import { loadPack, worldDir, type LoadResult } from "./load";

const USAGE = `usage: helix <command> [options]

  build [--prod]          write the datapack (and resource pack, if configured)
  dev                     build, then rebuild when files change
  report [--strict]       per-tick cost report; --strict exits 1 on warnings
  profile [dump.json]     measured profile from the newest /helixprof dump (or the given one)
  validate                check emitted JSON against the vanilla schema
  data [--force]          download the Minecraft version data (not shipped; needs network)

  --target <t>            build only this runtime target
  --prod                  prod mode (debug off, twine prunes dev modules)`;

/** Runs a CLI invocation; resolves to the process exit code. */
export async function runCli(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      prod: { type: "boolean" },
      strict: { type: "boolean" },
      target: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [command, arg] = positionals;
  if (values.help || !command) {
    console.log(USAGE);
    return command || values.help ? 0 : 1;
  }
  const load = () =>
    loadPack({ mode: values.prod ? "prod" : "dev", target: values.target as RuntimeTarget | undefined });

  switch (command) {
    case "build":
    case "dev":
      return build(await load());
    case "report": {
      let warned = false;
      for (const { dp } of (await load()).packs) warned = dp.printReport().warnings.length > 0 || warned;
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
    await dp.writeDatapack(out.datapack);
    if (out.resourcePack) await dp.writeResourcePack(out.resourcePack);
    const rp = out.resourcePack ? `  (+ resource pack -> ${out.resourcePack})` : "";
    console.log(`[${config.name}:${target}] datapack -> ${out.datapack}${rp}`);
  }
  return 0;
}

function profile(loaded: LoadResult, dumpFile?: string): number {
  const found = dumpFile
    ? { file: dumpFile, dump: JSON.parse(fs.readFileSync(dumpFile, "utf8")) as ProfileDump }
    : latestProfile(worldDir(loaded));
  if (!found) {
    console.error(`helix: no profile dump in ${worldDir(loaded)}/${PROFILE_DIR} - run /helixprof start, then /helixprof stop`);
    return 1;
  }
  console.log(found.file);
  for (const { dp } of loaded.packs) dp.printProfileReport(found.dump);
  return 0;
}

async function validate({ packs }: LoadResult): Promise<number> {
  const { validateDatapack, formatMcdocDiagnostics } = await import("../validate/mcdoc.js");
  let errors = false;
  for (const { dp } of packs) {
    const problems = await validateDatapack(dp);
    console.log(formatMcdocDiagnostics(problems));
    errors = problems.some((p) => p.severity === "error") || errors;
  }
  return errors ? 1 : 0;
}
