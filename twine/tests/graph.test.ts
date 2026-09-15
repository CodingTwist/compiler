import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { Id } from "helix";
import { defineModule } from "../src/core/module.decorator";
import {
  buildGraph,
  resolveDimensions,
  needsTickMemo,
} from "../src/core/graph";
import type { DatapackModule } from "../src/core/module.interface";

const leaf = (extra: Partial<DatapackModule> = {}): DatapackModule => ({
  ...extra,
});

describe("buildGraph", () => {
  it("visits a shared import once even when two parents both import it", () => {
    let builds = 0;
    const shared = defineModule({ name: "shared" }, (builds++, leaf()));
    const a = defineModule({ name: "a", imports: [shared] }, leaf());
    const b = defineModule({ name: "b", imports: [shared] }, leaf());
    const root = defineModule({ name: "root", imports: [a, b] }, leaf());

    const graph = buildGraph(root, "prod");
    expect(builds).toBe(1); // instance built once when the ref object is constructed once
    expect(graph.nodes.size).toBe(4); // root, a, b, shared - not duplicated
    expect(graph.nodes.get(a)!.children).toEqual([shared]);
    expect(graph.nodes.get(b)!.children).toEqual([shared]);
  });

  it("prunes a module and its whole subtree when env excludes it", () => {
    const grandchild = defineModule({ name: "gc" }, leaf());
    const child = defineModule(
      { name: "child", env: ["dev"], imports: [grandchild] },
      leaf(),
    );
    const root = defineModule({ name: "root", imports: [child] }, leaf());

    const graph = buildGraph(root, "prod");
    expect(graph.nodes.has(child)).toBe(false);
    expect(graph.nodes.has(grandchild)).toBe(false); // pruned with its parent, not just skipped
    expect(graph.nodes.get(root)!.children).toEqual([]);
  });

  it("keeps a module whose env includes the current build", () => {
    const child = defineModule({ name: "child", env: ["prod", "dev"] }, leaf());
    const root = defineModule({ name: "root", imports: [child] }, leaf());
    const graph = buildGraph(root, "prod");
    expect(graph.nodes.has(child)).toBe(true);
  });

  it("orders children before parents", () => {
    const child = defineModule({ name: "child" }, leaf());
    const root = defineModule({ name: "root", imports: [child] }, leaf());
    const graph = buildGraph(root, "prod");
    expect(graph.order.indexOf(child)).toBeLessThan(graph.order.indexOf(root));
  });
});

describe("resolveDimensions", () => {
  it("inherits the nearest ancestor's dimension when a module declares none", () => {
    const end = Id("minecraft:the_end");
    const grandchild = defineModule({ name: "gc" }, leaf());
    const child = defineModule(
      { name: "child", imports: [grandchild] },
      leaf(),
    );
    const root = defineModule(
      { name: "root", dimension: end, imports: [child] },
      leaf(),
    );

    const graph = buildGraph(root, "prod");
    const dims = resolveDimensions(graph);
    expect(dims.get(child)).toBe(end);
    expect(dims.get(grandchild)).toBe(end);
  });

  it("lets a module override the inherited dimension for its own subtree", () => {
    const nether = Id("minecraft:the_nether");
    const end = Id("minecraft:the_end");
    const grandchild = defineModule({ name: "gc" }, leaf());
    const child = defineModule(
      { name: "child", dimension: nether, imports: [grandchild] },
      leaf(),
    );
    const root = defineModule(
      { name: "root", dimension: end, imports: [child] },
      leaf(),
    );

    const graph = buildGraph(root, "prod");
    const dims = resolveDimensions(graph);
    expect(dims.get(child)).toBe(nether);
    expect(dims.get(grandchild)).toBe(nether);
  });

  it("is undefined for a module with no dimension anywhere in its ancestry", () => {
    const root = defineModule({ name: "root" }, leaf());
    const graph = buildGraph(root, "prod");
    expect(resolveDimensions(graph).get(root)).toBeUndefined();
  });
});

describe("needsTickMemo", () => {
  it("is false for a leaf with no onTick, handlers, or triggered area", () => {
    const root = defineModule({ name: "root" }, leaf());
    const graph = buildGraph(root, "prod");
    expect(needsTickMemo(graph)(root)).toBe(false);
  });

  it("is true for a leaf with an onTick", () => {
    const root = defineModule({ name: "root" }, leaf({ onTick: () => {} }));
    const graph = buildGraph(root, "prod");
    expect(needsTickMemo(graph)(root)).toBe(true);
  });

  it("propagates up from a descendant that needs tick, even through several ancestors", () => {
    const grandchild = defineModule({ name: "gc" }, leaf({ onTick: () => {} }));
    const child = defineModule(
      { name: "child", imports: [grandchild] },
      leaf(),
    );
    const root = defineModule({ name: "root", imports: [child] }, leaf());

    const graph = buildGraph(root, "prod");
    const needs = needsTickMemo(graph);
    expect(needs(root)).toBe(true);
    expect(needs(child)).toBe(true);
  });

  it("stays false for a sibling of a module that needs tick", () => {
    const busy = defineModule({ name: "busy" }, leaf({ onTick: () => {} }));
    const idle = defineModule({ name: "idle" }, leaf());
    const root = defineModule({ name: "root", imports: [busy, idle] }, leaf());

    const graph = buildGraph(root, "prod");
    expect(needsTickMemo(graph)(idle)).toBe(false);
  });

  it("requires both area and trigger together - an area with no trigger doesn't count", () => {
    const root = defineModule({ name: "root", area: true }, leaf());
    const graph = buildGraph(root, "prod");
    expect(needsTickMemo(graph)(root)).toBe(false);
  });
});
