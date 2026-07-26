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
function resolve(ref: ModuleRef): { instance: DatapackModule; meta: ModuleMetadata } {
  return isConfiguredModule(ref)
    ? { instance: ref.instance, meta: ref.metadata }
    : { instance: new ref(), meta: getModuleMetadata(ref) };
}

/**
 * Depth-first, de-duplicated walk building the module graph. A reference imported
 * by several parents is built once; two separate `Door(...)` calls stay distinct.
 * Modules whose `env` excludes the active build are pruned with their subtree.
 */
export function buildGraph(root: ModuleRef, env: BuildEnv): Graph {
  const nodes = new Map<ModuleRef, Node>();
  const order: ModuleRef[] = [];

  const visit = (ref: ModuleRef): boolean => {
    if (nodes.has(ref)) return true;
    const { instance, meta } = resolve(ref);
    if (meta.env && !meta.env.includes(env)) return false; // pruned for this build
    const node: Node = { ref, instance, meta, children: [] };
    nodes.set(ref, node);
    for (const childRef of meta.imports ?? []) {
      if (visit(childRef)) node.children.push(childRef);
    }
    order.push(ref);
    return true;
  };

  visit(root);
  return { root, nodes, order };
}

/**
 * Each area's *effective* dimension: its own `dimension`, or the nearest
 * ancestor that names one (an area inherits the dimension of the area it sits
 * inside). Resolved root-down so a child sees the value already computed for its
 * parent; where a ref is reached through several parents the first walk wins,
 * matching the identity de-duplication in {@link buildGraph}. Returns the map
 * for every reachable node - `undefined` for anything with no dimension in its
 * ancestry, which is left running wherever its caller runs, exactly as before.
 */
export function resolveDimensions(graph: Graph): Map<ModuleRef, Id | undefined> {
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
 * Memoized: does `ref` need any per-tick work emitted? True if it has an
 * `onTick`, any `@On` handler (each is a poll), if it's a **triggered area**
 * (its detector must run), or if any included descendant needs ticking. Lets a
 * whole subtree with nothing to do be skipped - no empty guard lines.
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
