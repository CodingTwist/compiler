// `dp.group(path)`: a view of the pack whose functions are created under `path`.
import type { DatapackCore } from "./core";

/**
 * Wraps `root` so reads see `path` and every write lands on `root`.
 *
 * Methods run with `this` as the view, so anything that creates functions through `this`
 * (including plugin methods added to the prototype) nests under the group. Writes go to the
 * root so a method never leaves state on a view.
 */
export function groupView<T extends DatapackCore>(root: T, path: string): T {
  return new Proxy(root, {
    get: (target, key, receiver) =>
      key === "path"
        ? path
        : key === "root"
          ? target
          : Reflect.get(target, key, receiver),
    set: (target, key, value) => Reflect.set(target, key, value),
  });
}
