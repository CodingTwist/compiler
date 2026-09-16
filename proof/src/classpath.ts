// Turns a Mojang bundler jar into a plain `-cp` string.
//
//   const cp = await classpath("26.3-rc-2", ".build/server");
//
// The bundler's own launcher builds a class loader we can't add the agent to, so the jars are
// unpacked once and launched directly instead.
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { serverJar } from "./jar";

/** Where the unpacked jars live, and the classpath that uses them. */
export interface Classpath {
  /** Every jar, joined with the platform separator. */
  value: string;
  /** The directory the jars were unpacked into. */
  dir: string;
}

/** Unpacks `versionId`'s bundler jar into `dir` (once) and returns the classpath it forms. */
export async function classpath(versionId: string, dir: string): Promise<Classpath> {
  const jar = await serverJar(versionId);
  const root = path.resolve(dir);
  const stamp = path.join(root, ".unpacked");

  if (!fs.existsSync(stamp) || fs.readFileSync(stamp, "utf8") !== jar) unpack(jar, root, stamp);

  // classpath-joined already ends with the server jar itself, so it is the whole classpath.
  const jars = read(root, "classpath-joined")
    .split(";")
    .map((p) => path.join(root, p));
  return { value: jars.join(path.delimiter), dir: root };
}

const read = (root: string, name: string) =>
  fs.readFileSync(path.join(root, "META-INF", name), "utf8");

/** Extracts the jars with the JDK's own `jar`, which proof already needs on PATH. */
function unpack(jar: string, root: string, stamp: string): void {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  execFileSync("jar", ["xf", jar, "META-INF"], { cwd: root });
  // classpath-joined names the jars from the jar's root, but they are stored under META-INF/.
  for (const name of ["libraries", "versions"])
    fs.renameSync(path.join(root, "META-INF", name), path.join(root, name));
  fs.writeFileSync(stamp, jar);
}
