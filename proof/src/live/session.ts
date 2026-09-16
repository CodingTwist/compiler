// Boots the agent for live mode and hands back the handle.
//
//   const mc = await useServer(dp);
//
// One server per process: the live tests share it, so vitest must keep them in one process.
import fs from "fs";
import path from "path";
import readline from "readline";
import type { Datapack } from "helix";
import { build, launch } from "../launch";
import { connect } from "./client";
import { mc, type Mc } from "./mc";

export interface ServerOptions {
  /** Echo the whole server log. */
  verbose?: boolean;
}

/** Builds `dp`, starts the agent and waits for the bridge to accept a connection. */
export async function server(dp: Datapack, opts: ServerOptions = {}): Promise<Mc> {
  const pack = path.join(build.packs, dp.name);
  fs.rmSync(build.packs, { recursive: true, force: true });
  dp.writeDatapack(pack);

  const proc = await launch({
    version: dp.version.id,
    packs: build.packs,
    data: path.join(pack, "data"),
    tests: `${LIVE}:session`,
    verbose: opts.verbose,
  });

  const log: string[] = [];
  const port = await new Promise<number>((resolve, reject) => {
    for (const stream of [proc.stdout, proc.stderr])
      readline.createInterface({ input: stream! }).on("line", (line) => {
        log.push(line);
        if (opts.verbose) console.log(line);
        const found = line.match(/PROOF_PORT (\d+)/);
        if (found) resolve(Number(found[1]));
      });
    proc.once("exit", () =>
      reject(new Error(`the proof agent exited before the bridge opened:\n${log.slice(-20).join("\n")}`)),
    );
  });

  return mc(await connect(port));
}

/** The namespace the bridge lives in, kept out of the `proof:*` game-test selector. */
const LIVE = "proof_live";

let booted: Promise<Mc> | undefined;

/** The process's shared server. `dp` and `opts` are used by the first caller only. */
export function useServer(dp: Datapack, opts?: ServerOptions): Promise<Mc> {
  // `launch` already kills the agent when this process goes away.
  if (!booted) booted = server(dp, opts);
  return booted;
}
