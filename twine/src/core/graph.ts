import type { Id } from "helix";
import { getModuleMetadata, isConfiguredModule } from "./module.decorator";
import { getEventHandlers } from "./events";
import type {
  DatapackModule,
  ModuleMetadata,
  ModuleRef,
  BuildEnv,
} from "./module.interface";

/** A module resolved to its instance + metadata + included child refs. */
export interface Node {
  ref: ModuleRef;
  instance: DatapackModule;
  meta: ModuleMetadata;
  children: ModuleRef[];
}

export interface Graph {
  root: ModuleRef;
  nodes: Map<ModuleRef, Node>;
  /** Children-before-parent order, for register/load iteration. */
  order: ModuleRef[];
}

/** Resolve a class or configured module to its metadata + a built instance. */
function resolve(ref: ModuleRef): {
  instance: DatapackModule;
  meta: ModuleMetadata;
} {
  return isConfiguredModule(ref)
    ? { instance: ref.instance, meta: ref.metadata }
    : { instance: new ref(), meta: getModuleMetadata(ref) };
}

/**
 * Builds the module graph depth-first. A shared import is built once; separate `Door(...)`
 * calls stay separate. Modules excluded by `env` are pruned with their subtree.
 *
 * With `only`, a module is kept if it is named, inside a named module, or an ancestor of
 * one. Ancestors stay so area gating and dimensions still apply. No match leaves the graph
 * empty, so `only` can also name things the pack builds outside twine.
 */
export function buildGraph(
  root: ModuleRef,
  env: BuildEnv,
  only?: string[],
): Graph {
  const nodes = new Map<ModuleRef, Node>();
  const order: ModuleRef[] = [];

  const visit = (ref: ModuleRef, selected: boolean): boolean => {
    if (nodes.has(ref)) return true;
    const { instance, meta } = resolve(ref);
    if (meta.env && !meta.env.includes(env)) return false; // pruned for this build
    const self = selected || Boolean(only?.includes(meta.name));
    const node: Node = { ref, instance, meta, children: [] };
    for (const childRef of meta.imports ?? []) {
      if (visit(childRef, self)) node.children.push(childRef);
    }
    // ponytail: a shared import first kept as an ancestor is not re-walked when selected later.
    if (!self && !node.children.length) return false; // nothing selected below
    nodes.set(ref, node);
    order.push(ref);
    return true;
  };

  if (!only?.length) only = undefined;
  visit(root, !only);
  return { root, nodes, order };
}

/** Each module's dimension: its own, or the nearest ancestor's. `undefined` if none. */
export function resolveDimensions(
  graph: Graph,
): Map<ModuleRef, Id | undefined> {
  const dims = new Map<ModuleRef, Id | undefined>();
  const walk = (ref: ModuleRef, inherited: Id | undefined): void => {
    if (dims.has(ref)) return;
    const node = graph.nodes.get(ref)!;
    const own = node.meta.dimension ?? inherited;
    dims.set(ref, own);
    for (const child of node.children) walk(child, own);
  };
  walk(graph.root, undefined);
  return dims;
}

/**
 * Memoized: does `ref` need any tick output? True for `onTick`, `@On` handlers, triggered areas, or
 * any descendant that does. Lets empty subtrees be skipped.
 */
export function needsTickMemo(graph: Graph): (ref: ModuleRef) => boolean {
  const cache = new Map<ModuleRef, boolean>();
  const has = (ref: ModuleRef): boolean => {
    const cached = cache.get(ref);
    if (cached !== undefined) return cached;
    const node = graph.nodes.get(ref)!;
    const result =
      Boolean(node.instance.onTick) ||
      getEventHandlers(node.instance).length > 0 ||
      Boolean(node.meta.area && node.meta.trigger) ||
      node.children.some((c) => has(c));
    cache.set(ref, result);
    return result;
  };
  return has;
}
