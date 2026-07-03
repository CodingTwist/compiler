// Post-processes TypeDoc's generated Markdown so VitePress (Vue's template
// compiler) can render it. TypeDoc faithfully reproduces TSDoc prose, including
// inline-code spans that the source comment hard-wrapped across a newline, e.g.
//
//     `execute (if|unless) items entity <target>
//     <slot> <item_predicate> run <command>`
//
// A single-line inline span with angle brackets renders fine, but when the span
// straddles a newline VitePress emits the `<...>` fragments as raw HTML and Vue
// then reports "Element is missing end tag" and fails the production build.
//
// The fix: outside fenced code blocks, collapse any newline that falls *inside*
// an inline-code span into a single space. This is a no-op on well-formed files
// and touches nothing but the offending spans.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "api");

let files;
try {
  files = execSync(`find ${JSON.stringify(apiDir)} -name '*.md'`)
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean);
} catch {
  files = [];
}

let fixed = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  const out = [];
  let inFence = false;
  let backtickOpen = false; // an inline span is open across a line boundary

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }

    // If a span is open from the previous line, glue this line onto it with a
    // space instead of starting a fresh output line.
    if (backtickOpen) {
      out[out.length - 1] += " " + line;
    } else {
      out.push(line);
    }

    // Recount backtick parity across the (possibly glued) current output line to
    // know whether a span is still open at the newline.
    const current = out[out.length - 1];
    let ticks = 0;
    for (const ch of current) if (ch === "`") ticks++;
    backtickOpen = ticks % 2 === 1;
  }

  const result = out.join("\n");
  if (result !== src) {
    writeFileSync(file, result);
    fixed++;
  }
}

console.log(`fix-api-md: normalized ${fixed} file(s)`);
