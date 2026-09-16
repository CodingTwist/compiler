// Compiles the Java agent against the server jar.
//
// The 26.3 server jar ships unobfuscated, so this is a plain `javac -cp <server>` with no mod
// loader, mappings or build tool involved.
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

/** Java release the server targets. Compiling newer would not load. */
const RELEASE = "21";

/** Compiles every `.java` under `sources` into `out`, skipping the work when nothing changed. */
export function compile(classpath: string, sources: string[], out: string): void {
  const files = sources.flatMap(javaFiles);
  if (!files.length) throw new Error(`no .java files under ${sources.join(", ")}`);

  const stamp = path.join(out, ".compiled");
  const newest = Math.max(...files.map((f) => fs.statSync(f).mtimeMs));
  if (fs.existsSync(stamp) && fs.statSync(stamp).mtimeMs >= newest) return;

  fs.mkdirSync(out, { recursive: true });
  try {
    execFileSync("javac", ["--release", RELEASE, "-nowarn", "-cp", classpath, "-d", out, ...files], {
      stdio: ["ignore", "inherit", "inherit"],
    });
  } catch {
    // javac already printed the errors; repeating its command line would bury them.
    throw new Error(`javac failed for ${sources.join(", ")}`);
  }
  fs.writeFileSync(stamp, "");
}

function javaFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".java"))
    .map((f) => path.join(dir, f));
}
