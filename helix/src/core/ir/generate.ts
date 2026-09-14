// Codegen helpers that render nodes to text. Separate from codegen.ts so command files can
// import them without the import cycle.
import type { Datapack } from "./datapack";
import { ASTNode, FunctionNode } from "./node";
import { CodegenContext, Dispatcher } from "./commandhandler";
import { validateCommand } from "./command-validator";
import { sourceOf } from "../debug/sources";
import { callLine, COMMENT_LINE, commandLine, Effect, UNKNOWN_LINE, type LineInfo } from "./line-info";

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
  let infos = ctx.infos;
  if (comments) {
    text = [];
    lineSources = [];
    infos = [];
    ctx.lines.forEach((line, i) => {
      const loc = ctx.sources[i];
      if (loc && loc !== ctx.sources[i - 1]) {
        text.push(`# ${loc}`);
        lineSources.push(undefined);
        infos.push(COMMENT_LINE);
      }
      text.push(line);
      lineSources.push(loc);
      infos.push(ctx.infos[i]);
    });
  }
  if (sources || comments) dp.sourceMap.set(fn.name, lineSources);
  dp.lineInfo.set(fn.name, infos);
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
  return functionCall(dp, fn.name);
}

/**
 * The `run …` tail for a {@link generateRunTarget} result. A nested `execute` is merged
 * into
 * the chain instead of nesting.
 */
export function runClause(cmd: string): string {
  return cmd.startsWith("execute ") ? cmd.slice("execute ".length) : `run ${cmd}`;
}

/** `cmd` run under the rendered `execute` context `clauses`. */
export function underClauses(clauses: string[], cmd: string): string {
  return `execute ${clauses.join(" ")} ${runClause(cmd)}`;
}

/** `line` without its leading `execute` context `clauses`, as a command of its own. */
export function withoutClauses(line: string, clauses: string[]): string {
  const head = `execute ${clauses.join(" ")} `;
  // The clauses come from the handler that rendered the line, so a mismatch is a bug there.
  if (!line.startsWith(head)) throw new Error(`Line doesn't start with its recorded clauses: ${line}`);
  const rest = line.slice(head.length);
  return rest.startsWith("run ") ? rest.slice("run ".length) : `execute ${rest}`;
}

/** Matches a command that can run once per entity, which `return run` would stop after the first. */
export const FORKS = /\s(as|at|on|summon)\s|facing entity/;

/** Stores `ctx`'s lines as the function `name` and returns the call to it. */
export function commitLines(name: string, dp: Datapack, ctx: CodegenContext): { cmd: string; info: LineInfo } {
  commit(new FunctionNode(name), dp, ctx);
  return { cmd: functionCall(dp, name), info: callLine(name) };
}

/** `function <pack>:<name>`. */
export function functionCall(dp: Datapack, name: string): string {
  return `function ${dp.name}:${name}`;
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
  return generateRunTargetLine(fn, dp, dispatcher, opts).cmd;
}

/** {@link generateRunTarget}, plus what the returned command is. */
export function generateRunTargetLine(
  fn: FunctionNode,
  dp: Datapack,
  dispatcher: Dispatcher,
  opts: { keepEmpty?: boolean; inline?: (cmd: string, info: LineInfo) => boolean } = {},
): { cmd: string; info: LineInfo } {
  const ctx = new CodegenContext(dp, dispatcher);
  dispatchAll(fn, ctx, dispatcher);

  const inlinable = ctx.lines.length === 1 && (opts.inline?.(ctx.lines[0], ctx.infos[0]) ?? true);
  if (inlinable && ctx.externalLines.size === 0) {
    // A macro line's `$` must go at the front of the whole composed line, so drop it here.
    if (ctx.lines[0].startsWith("$")) return { cmd: ctx.lines[0].slice(1), info: ctx.infos[0] };
    // Native calls aren't vanilla literals, so they can't follow `run` inline.
    return { cmd: ctx.lines[0], info: ctx.infos[0] };
  }
  // An empty body returns `""` so the caller can drop the line, unless it needs a real
  // call.
  if (ctx.lines.length === 0 && !opts.keepEmpty) return { cmd: "", info: commandLine(Effect.NONE) };

  commit(fn, dp, ctx);
  return { cmd: functionCall(dp, fn.name), info: callLine(fn.name) };
}

export function generateSingleNode(
  node: ASTNode,
  dp: Datapack,
  dispatcher: Dispatcher,
) {
  return generateSingleNodeLine(node, dp, dispatcher).cmd;
}

/** {@link generateSingleNode}, plus what the returned command is. */
export function generateSingleNodeLine(
  node: ASTNode,
  dp: Datapack,
  dispatcher: Dispatcher,
): { cmd: string; info: LineInfo } {
  const scratch = new CodegenContext(dp, dispatcher);
  dispatcher.dispatch(node, scratch);
  return { cmd: scratch.lines[0], info: scratch.infos[0] ?? UNKNOWN_LINE };
}
