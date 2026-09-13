// Leaf codegen helpers: turn AST nodes into command text via a Dispatcher.
// Kept separate from codegen.ts (which imports the commands barrel) so the
// command handler files can import these without dragging the whole barrel -
// that import cycle would break FunctionContext's prototype augmentations.
import type { Datapack } from "./datapack";
import { ASTNode, FunctionNode } from "./node";
import { CodegenContext, Dispatcher } from "./commandhandler";
import { validateCommand } from "./command-validator";
import { sourceOf } from "../debug/sources";

/** Dispatch every node of `fn`, each one's lines tagged with where it was authored. */
function dispatchAll(fn: FunctionNode, ctx: CodegenContext, dispatcher: Dispatcher): void {
  for (const node of fn.nodes) {
    ctx.current = sourceOf(fn, node);
    dispatcher.dispatch(node, ctx);
  }
  ctx.current = undefined;
}

/**
 * Validate and store a function's rendered lines. With debug source tracking on,
 * also record its per-line sources, and (`comments`) put `# <loc>` above each
 * run of lines from one author line - after validation, so comments never reach it.
 */
function commit(fn: FunctionNode, dp: Datapack, ctx: CodegenContext): void {
  // Verify every emitted command is legal for the target Minecraft version.
  // External lines (native plugin calls) carry an unknown leading keyword, so
  // they are exempt - they are validated by their own runtime, not vanilla.
  ctx.lines.forEach((line, i) => {
    if (!ctx.externalLines.has(i)) validateCommand(line, dp.version);
  });
  const { sources, comments } = dp.debug;
  let text = ctx.lines;
  let lineSources = ctx.sources;
  if (comments) {
    text = [];
    lineSources = [];
    ctx.lines.forEach((line, i) => {
      const loc = ctx.sources[i];
      if (loc && loc !== ctx.sources[i - 1]) {
        text.push(`# ${loc}`);
        lineSources.push(undefined);
      }
      text.push(line);
      lineSources.push(loc);
    });
  }
  if (sources || comments) dp.sourceMap.set(fn.name, lineSources);
  dp.files.set(fn.name, text.join("\n"));
  dp.functions.set(fn.name, fn);
}

// This builds all the nodes in the function node.
export function generateFunction(
  fn: FunctionNode,
  dp: Datapack,
  dispatcher: Dispatcher,
): string {
  if (dp.files.has(fn.name)) {
    return "";
  }

  const ctx = new CodegenContext(dp, dispatcher);
  dispatchAll(fn, ctx, dispatcher);
  commit(fn, dp, ctx);
  return `function ${dp.name}:${fn.name}`;
}

/**
 * Render a control-flow body for use after `execute … run`. A body of exactly one
 * command is returned **inline** (e.g. `setblock …`, or a nested `execute if … run
 * …`) so the caller can splice it straight into its `run` clause - no child
 * function file. Multi-command (or empty) bodies are committed as their own
 * function and a `function <ns>:<name>` call is returned instead. Inlining single
 * branches collapses the generated `zzz/*` helper explosion from large `if` fans
 * (e.g. a Clip's per-frame `step`).
 */
export function generateRunTarget(
  fn: FunctionNode,
  dp: Datapack,
  dispatcher: Dispatcher,
): string {
  const ctx = new CodegenContext(dp, dispatcher);
  dispatchAll(fn, ctx, dispatcher);

  if (ctx.lines.length === 1 && ctx.externalLines.size === 0) {
    // Inline: the parent function validates the composed `execute … run <line>`.
    // A macro line's leading `$` belongs at the front of the whole composed
    // line, not mid-command - drop it here, the parent's emit re-adds it.
    if (ctx.lines[0].startsWith("$")) return ctx.lines[0].slice(1);
    // A native call is never inlined - a bare `paper:…` keyword can't follow
    // `execute … run` (which expects a vanilla literal), so it gets its own file.
    return ctx.lines[0];
  }

  commit(fn, dp, ctx);
  return `function ${dp.name}:${fn.name}`;
}

export function generateSingleNode(
  node: ASTNode,
  dp: Datapack,
  dispatcher: Dispatcher,
) {
  const scratch = new CodegenContext(dp, dispatcher);
  dispatcher.dispatch(node, scratch);
  const command = scratch.lines[0];
  return command;
}
