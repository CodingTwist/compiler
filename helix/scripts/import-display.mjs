#!/usr/bin/env node
// Convert a vanilla `/summon block_display {...}` (or the bare `{...}` data tag)
// into the TS authoring form using Display(...) + Block(...).
//
//   node scripts/import-display.mjs path/to/command.txt
//   pbpaste | node scripts/import-display.mjs        # read from stdin
//
// Prints a ready-to-paste snippet:
//
//   const display = Display(Block.POLISHED_BASALT.state({ axis: "x" }))
//     .add(Block.WAXED_COPPER_BLOCK, { translation: [-0.5, -3.5, -0.5] });
//
// It only understands the block_display shape (root block_state + Passengers of
// block_display); anything else is passed through untouched so you can inspect it.

import { readFileSync } from "node:fs";
import { memberKey } from "./concept-registries.mjs";

// --- tolerant SNBT parser ---------------------------------------------------
// Handles {compounds}, [lists], "quoted" / bare strings, and numbers with the
// b/s/l/f/d type suffix (suffix dropped - we re-emit types from structure).

function parseSnbt(src) {
  let i = 0;

  const ws = () => {
    while (i < src.length && /\s/.test(src[i])) i++;
  };
  const expect = (ch) => {
    if (src[i] !== ch) throw new Error(`expected '${ch}' at ${i}: ...${src.slice(i, i + 20)}`);
    i++;
  };

  function value() {
    ws();
    const ch = src[i];
    if (ch === "{") return compound();
    if (ch === "[") return list();
    if (ch === '"' || ch === "'") return quoted(ch);
    return scalar();
  }

  function compound() {
    expect("{");
    const obj = {};
    ws();
    while (src[i] !== "}") {
      ws();
      const key = src[i] === '"' || src[i] === "'" ? quoted(src[i]) : bareKey();
      ws();
      expect(":");
      obj[key] = value();
      ws();
      if (src[i] === ",") {
        i++;
        ws();
      }
    }
    expect("}");
    return obj;
  }

  function list() {
    expect("[");
    const arr = [];
    ws();
    // Skip a typed-array prefix like `I;` / `B;` / `L;`.
    if (/[IBL]/.test(src[i]) && src[i + 1] === ";") i += 2;
    ws();
    while (src[i] !== "]") {
      arr.push(value());
      ws();
      if (src[i] === ",") {
        i++;
        ws();
      }
    }
    expect("]");
    return arr;
  }

  function quoted(q) {
    i++; // opening quote
    let out = "";
    while (src[i] !== q) {
      if (src[i] === "\\") {
        i++;
        out += src[i];
      } else {
        out += src[i];
      }
      i++;
    }
    i++; // closing quote
    return out;
  }

  function bareKey() {
    let out = "";
    while (i < src.length && /[A-Za-z0-9_.+-]/.test(src[i])) out += src[i++];
    return out;
  }

  function scalar() {
    let out = "";
    while (i < src.length && !/[,}\]:]/.test(src[i]) && !/\s/.test(src[i])) out += src[i++];
    // Number with optional type suffix?
    const m = /^([-+]?(?:\d+\.?\d*|\.\d+))([bslfdBSLFD]?)$/.exec(out);
    if (m) return Number(m[1]);
    if (out === "true") return true;
    if (out === "false") return false;
    return out;
  }

  const result = value();
  return result;
}

// --- emit TS ----------------------------------------------------------------

const IDENTITY_QUAT = [0, 0, 0, 1];
const UNIT_SCALE = [1, 1, 1];

const eq = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, k) => v === b[k]);
const vec = (a) => `[${a.join(", ")}]`;

function blockExpr(blockState) {
  if (!blockState || !blockState.Name) return `Block.AIR`;
  const member = `Block.${memberKey(blockState.Name)}`;
  const props = blockState.Properties;
  if (!props || Object.keys(props).length === 0) return member;
  const entries = Object.entries(props)
    .map(([k, v]) => `${/^[A-Za-z_][\w]*$/.test(k) ? k : JSON.stringify(k)}: ${JSON.stringify(String(v))}`)
    .join(", ");
  return `${member}.state({ ${entries} })`;
}

function transformOpts(t) {
  if (!t) return "{}";
  const parts = [];
  if (t.translation && !eq(t.translation, [0, 0, 0])) parts.push(`translation: ${vec(t.translation)}`);
  if (t.scale && !eq(t.scale, UNIT_SCALE)) parts.push(`scale: ${vec(t.scale)}`);
  if (t.left_rotation && !eq(t.left_rotation, IDENTITY_QUAT)) parts.push(`leftRotation: ${vec(t.left_rotation)}`);
  if (t.right_rotation && !eq(t.right_rotation, IDENTITY_QUAT)) parts.push(`rightRotation: ${vec(t.right_rotation)}`);
  return parts.length ? `{ ${parts.join(", ")} }` : "{}";
}

function emit(root) {
  const rootArgs = [blockExpr(root.block_state)];
  const rootT = transformOpts(root.transformation);
  if (rootT !== "{}") rootArgs.push(rootT);
  const lines = [`const display = Display(${rootArgs.join(", ")})`];

  const passengers = root.Passengers || [];
  passengers.forEach((p, idx) => {
    const t = transformOpts(p.transformation);
    const call = `  .add(${blockExpr(p.block_state)}, ${t})`;
    lines.push(idx === passengers.length - 1 ? call + ";" : call);
  });
  if (passengers.length === 0) lines[0] += ";";
  return lines.join("\n");
}

// --- main -------------------------------------------------------------------

const file = process.argv[2];
let input = file ? readFileSync(file, "utf8") : readFileSync(0, "utf8");
input = input.trim();
// Strip a leading `/summon minecraft:block_display <pos> ` if present.
const brace = input.indexOf("{");
if (brace > 0) input = input.slice(brace);

const root = parseSnbt(input);
process.stdout.write(emit(root) + "\n");
