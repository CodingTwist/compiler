// Starts the agent's JVM: unpack the server, compile the Java, run vanilla's game-test server.
//
// Both modes go through here — a game-test run selects `proof:*`, a live session selects the
// bridge — so there is one place that knows how the server is started.
import { spawn, type ChildProcess } from "child_process";
import path from "path";
import { classpath } from "./classpath";
import { compile } from "./compile";

/** The proof package itself, so a run works from any directory - vitest starts in the repo root. */
const HERE = path.resolve(__dirname, "..");

/** Everything proof builds, under one directory so a clean is one `rm -rf`. */
export const build = {
  root: path.join(HERE, ".build"),
  server: path.join(HERE, ".build/server"),
  agent: path.join(HERE, ".build/agent"),
  tests: path.join(HERE, ".build/tests"),
  packs: path.join(HERE, ".build/packs"),
  universe: path.join(HERE, ".build/universe"),
  report: path.join(HERE, ".build/report.xml"),
} as const;

/** Where the agent's own sources and the Java tests live. */
const AGENT_SRC = path.join(HERE, "agent/src");
const TEST_SRC = path.join(HERE, "agent/tests");

export interface LaunchOptions {
  /** Minecraft version, matching the pack under test. */
  version: string;
  /** Directory of pack folders, copied into the fresh world by `--packs`. */
  packs: string;
  /** The pack's `data` directory, where the agent declares its tests. */
  data: string;
  /** Test selector, e.g. `proof:*`. */
  tests: string;
  /** Where to write the JUnit report, when one is wanted. */
  report?: string;
  /** Echo the server log. */
  verbose?: boolean;
}

/** Spawns the agent. The caller owns the process and must stop it. */
export async function launch(opts: LaunchOptions): Promise<ChildProcess> {
  const cp = await classpath(opts.version, build.server);
  compile(cp.value, [AGENT_SRC], build.agent);
  compile([cp.value, build.agent].join(path.delimiter), [TEST_SRC], build.tests);

  const args = [
    "-Xmx2G",
    `-Dproof.classes=${path.resolve(build.tests)}`,
    `-Dproof.instances=${path.resolve(opts.data)}`,
    "-cp",
    [cp.value, path.resolve(build.agent), path.resolve(build.tests)].join(path.delimiter),
    "proof.Agent",
    "--universe",
    path.resolve(build.universe),
    "--packs",
    path.resolve(opts.packs),
    "--tests",
    opts.tests,
    ...(opts.report ? ["--report", path.resolve(opts.report)] : []),
  ];

  const proc = spawn("java", args, { stdio: ["ignore", "pipe", "pipe"] });
  // Node children outlive their parent, and a stray server keeps holding the world it was given.
  const die = () => void (proc.exitCode === null && proc.kill("SIGKILL"));
  process.once("exit", die);
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
    process.once(sig, () => {
      die();
      process.exit(128);
    });
  return proc;
}
