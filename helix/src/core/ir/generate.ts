// Codegen helpers that render nodes to text. Separate from codegen.ts so command files can
// import them without the import cycle.
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
 * Validates and stores a function's lines. With debug sources, records sources and adds
 * `# <loc>` comments after validation.
 */
function commit(fn: FunctionNode, dp: Datapack, ctx: CodegenContext): void {
  // Validate every line for the target version, except native plugin calls.
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
  if (dp.files.has(fn.name) || dp.inlined.has(fn.name)) {
    return "";
  }

  const ctx = new CodegenContext(dp, dispatcher);
  dispatchAll(fn, ctx, dispatcher);
  commit(fn, dp, ctx);
  return `function ${dp.name}:${fn.name}`;
}

/**
 * The `run …` tail for a {@link generateRunTarget} result. A nested `execute` is merged
 * into
 * the chain instead of nesting.
 */
export function runClause(cmd: string): string {
  return cmd.startsWith("execute ") ? cmd.slice("execute ".length) : `run ${cmd}`;
}

/**
 * Renders a body for `execute … run`. One command is returned inline; more (or none) become
 * a function and its call is returned. Inlining avoids piles of tiny helper files.
 */
export function generateRunTarget(
  fn: FunctionNode,
  dp: Datapack,
  dispatcher: Dispatcher,
  opts: { keepEmpty?: boolean } = {},
): string {
  const ctx = new CodegenContext(dp, dispatcher);
  dispatchAll(fn, ctx, dispatcher);

  if (ctx.lines.length === 1 && ctx.externalLines.size === 0) {
    // A macro line's `$` must go at the front of the whole composed line, so drop it here.
    if (ctx.lines[0].startsWith("$")) return ctx.lines[0].slice(1);
    // Native calls aren't vanilla literals, so they can't follow `run` inline.
    return ctx.lines[0];
  }
  // An empty body returns `""` so the caller can drop the line, unless it needs a real
  // call.
  if (ctx.lines.length === 0 && !opts.keepEmpty) return "";

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
