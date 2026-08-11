// Leaf codegen helpers: turn AST nodes into command text via a Dispatcher.
// Kept separate from codegen.ts (which imports the commands barrel) so the
// command handler files can import these without dragging the whole barrel -
// that import cycle would break FunctionContext's prototype augmentations.
import type { Datapack } from "./datapack";
import { ASTNode, FunctionNode } from "./node";
import { CodegenContext, Dispatcher } from "./commandhandler";
import { validateCommand } from "./command-validator";

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

  for (const node of fn.nodes) {
    dispatcher.dispatch(node, ctx);
  }

  // Verify every emitted command is legal for the target Minecraft version.
  // External lines (native plugin calls) carry an unknown leading keyword, so
  // they are exempt - they are validated by their own runtime, not vanilla.
  ctx.lines.forEach((line, i) => {
    if (!ctx.externalLines.has(i)) validateCommand(line, dp.version);
  });

  dp.files.set(fn.name, ctx.lines.join("\n"));
  dp.functions.set(fn.name, fn);

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
  for (const node of fn.nodes) {
    dispatcher.dispatch(node, ctx);
  }

  if (ctx.lines.length === 1 && ctx.externalLines.size === 0) {
    // Inline: the parent function validates the composed `execute … run <line>`.
    // A macro line's leading `$` belongs at the front of the whole composed
    // line, not mid-command - drop it here, the parent's emit re-adds it.
    if (ctx.lines[0].startsWith("$")) return ctx.lines[0].slice(1);
    // A native call is never inlined - a bare `paper:…` keyword can't follow
    // `execute … run` (which expects a vanilla literal), so it gets its own file.
    return ctx.lines[0];
  }

  ctx.lines.forEach((line, i) => {
    if (!ctx.externalLines.has(i)) validateCommand(line, dp.version);
  });
  dp.files.set(fn.name, ctx.lines.join("\n"));
  dp.functions.set(fn.name, fn);
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
