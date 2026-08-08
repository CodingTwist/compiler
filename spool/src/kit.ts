import type { KitPlugin } from "./plugin";

/**
 * Plugins installed process-wide. Augmentations are global (they mutate shared
 * prototypes on the one `helix` instance), so installing the same plugin twice -
 * from two modules, or two `installKit` calls - must be a no-op.
 */
const installed = new Set<string>();

/**
 * Install plugins: dedupe, topologically order them by `deps`, and run each
 * `install()` once.
 *
 *   installKit([holding, clip]);
 *
 * Depth-first topological sort; throws on a missing dep or a cycle.
 */
export function installKit(plugins: KitPlugin[]): void {
  const pending = new Map<string, KitPlugin>();
  for (const p of plugins) if (!pending.has(p.name)) pending.set(p.name, p);

  const order: KitPlugin[] = [];
  const visiting = new Set<string>();
  const done = new Set<string>();

  const visit = (p: KitPlugin): void => {
    if (done.has(p.name)) return;
    if (visiting.has(p.name)) {
      throw new Error(`spool: dependency cycle through "${p.name}"`);
    }
    visiting.add(p.name);
    for (const depName of p.deps ?? []) {
      if (installed.has(depName)) continue; // satisfied by an earlier install
      const dep = pending.get(depName);
      if (!dep) {
        throw new Error(
          `spool: plugin "${p.name}" depends on "${depName}", ` +
            `which was not provided to installKit()`,
        );
      }
      visit(dep);
    }
    visiting.delete(p.name);
    done.add(p.name);
    order.push(p);
  };

  for (const p of pending.values()) visit(p);

  for (const p of order) {
    if (installed.has(p.name)) continue;
    p.install();
    installed.add(p.name);
  }
}
