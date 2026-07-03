// A markdown-it plugin that makes a fenced code block the *single source of
// truth* for both the shown source and the compiled datapack output.
//
// Write a block tagged `ts compile`:
//
//     ```ts compile
//     const dp = new Datapack("demo", v1_20_4);
//     // ...author against helix's public API...
//     ```
//
// At build time this plugin runs that exact code through the helix compiler
// (`buildDatapack`, in-memory) and rewrites the block into the original source
// followed by a `::: code-group` of every emitted file. The output is therefore
// always the real compiler output for the code on the page - there's no second
// copy of the source in a script to drift out of sync.
//
// The block must leave a `Datapack` in a top-level `const dp`. It's compiled in
// a throwaway ES module under this folder, so `import ... from "helix"` (and
// "spool"/"twine", once added as deps) resolves via docs/node_modules.
import { execFileSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));

function compile(source) {
  const runner =
    `import { buildDatapack as __buildDatapack } from "helix";\n` +
    source +
    `\nif (typeof dp === "undefined")` +
    ` throw new Error("a \`ts compile\` block must define a top-level \`dp\`");\n` +
    `process.stdout.write(JSON.stringify([...__buildDatapack(dp)]));\n`;

  const tmp = join(here, `.compile-${randomBytes(6).toString("hex")}.mjs`);
  writeFileSync(tmp, runner);
  try {
    const out = execFileSync(process.execPath, [tmp], { encoding: "utf8" });
    return JSON.parse(out);
  } catch (err) {
    const detail = err.stderr?.toString() || err.message;
    throw new Error(`helix compile block failed:\n${detail}`);
  } finally {
    rmSync(tmp, { force: true });
  }
}

// mcfunction has no bundled Shiki grammar; render it as plain text so the build
// stays warning-free. JSON resources get proper highlighting.
const langFor = (path) => (path.endsWith(".json") ? "json" : "txt");

// Pack the block's source into a URL-hash payload the playground decodes on load
// (see playground/share.ts for the matching decoder). base64url of the UTF-8
// bytes keeps it hash-safe without percent-escaping; the two implementations
// only need to agree on the standard base64url spec, not share code.
function encodeShare(code) {
  return Buffer.from(code, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function expand(src) {
  return src.replace(
    /^```ts compile[^\n]*\n([\s\S]*?)\n```/gm,
    (_match, code) => {
      const files = compile(code);
      const panels = files
        .map(
          ([path, content]) =>
            "```" +
            langFor(path) +
            " [" +
            path +
            "]\n" +
            content.replace(/\n+$/, "") +
            "\n```",
        )
        .join("\n\n");

      const tryLink =
        `<a class="try-it" href="/playground.html#code=${encodeShare(code)}">` +
        `▶ Open in playground</a>`;

      return (
        "```ts\n" +
        code +
        "\n```\n\n" +
        tryLink +
        "\n\n" +
        "**Compiled output** - the real files helix emits for the code above:\n\n" +
        "::: code-group\n\n" +
        panels +
        "\n\n:::"
      );
    },
  );
}

export function compileHelix(md) {
  md.core.ruler.before("normalize", "helix-compile", (state) => {
    if (state.src.includes("```ts compile")) {
      state.src = expand(state.src);
    }
  });
}
