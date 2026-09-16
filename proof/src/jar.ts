// Finds and caches the vanilla dedicated-server jar for a version id.
//
//   const jar = await serverJar("26.3-rc-2");   // ~/.cache/proof/server/26.3-rc-2/server.jar
//
// `PROOF_SERVER_JAR` overrides the lookup entirely, for offline or non-Mojang builds.
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const MANIFEST = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

/** Where a version's jar is cached. Ids match Mojang's manifest verbatim. */
export function jarPath(versionId: string): string {
  const base = process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
  return path.join(base, "proof", "server", versionId, "server.jar");
}

/** The jar for `versionId`, downloading and sha1-verifying it on a cache miss. */
export async function serverJar(versionId: string): Promise<string> {
  const override = process.env.PROOF_SERVER_JAR;
  if (override) return override;

  const out = jarPath(versionId);
  if (fs.existsSync(out)) return out;

  const manifest = (await getJson(MANIFEST)) as { versions: { id: string; url: string }[] };
  const entry = manifest.versions.find((v) => v.id === versionId);
  if (!entry) throw new Error(`no Minecraft version "${versionId}" in the Mojang manifest`);

  const meta = (await getJson(entry.url)) as { downloads?: { server?: { url: string; sha1: string } } };
  const server = meta.downloads?.server;
  if (!server) throw new Error(`Minecraft ${versionId} ships no dedicated server jar`);

  const body = Buffer.from(await (await fetch(server.url)).arrayBuffer());
  const sha1 = crypto.createHash("sha1").update(body).digest("hex");
  if (sha1 !== server.sha1) throw new Error(`server jar for ${versionId} failed its sha1 check`);

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, body);
  return out;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url}: ${res.status}`);
  return res.json();
}
