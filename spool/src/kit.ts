import type { KitPlugin } from "./plugin";

/**
 * Plugins installed process-wide. Augmentations are global (they mutate shared
 * prototypes on the one `helix` instance), so installing the same
 * plugin twice - from two modules, or two `Kit`s - must be a no-op.
 */
const installed = new Set<string>();

/**
 * A registration session. Collect plugins with `use(...)`, then `install()` to
 * topologically order them by `deps`, dedupe, and run each `install()` once.
 *
 *   createKit().use(holding).use(clip).install();
 */
export class Kit {
  private readonly pending = new Map<string, KitPlugin>();

  /** Queue one or more plugins. Re-adding the same `name` is ignored. */
  use(...plugins: KitPlugin[]): this {
    for (const p of plugins) {
      if (!this.pending.has(p.name)) this.pending.set(p.name, p);
    }
    return this;
  }

  /** Resolve dependency order and install each not-yet-installed plugin once. */
  install(): void {
    for (const p of this.resolve()) {
      if (installed.has(p.name)) continue;
      p.install();
      installed.add(p.name);
    }
  }

  /** Depth-first topological sort over `deps`; throws on missing dep or cycle. */
  private resolve(): KitPlugin[] {
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
        if (installed.has(depName)) continue; // satisfied by an earlier install()
        const dep = this.pending.get(depName);
        if (!dep) {
          throw new Error(
            `spool: plugin "${p.name}" depends on "${depName}", ` +
              `which was not provided to use()/installKit()`,
          );
        }
        visit(dep);
      }
      visiting.delete(p.name);
      done.add(p.name);
      order.push(p);
    };

    for (const p of this.pending.values()) visit(p);
    return order;
  }
}

/** Start a fresh registration session. */
export function createKit(): Kit {
  return new Kit();
}

/** One-shot convenience: `installKit([holding, clip])`. */
export function installKit(plugins: KitPlugin[]): void {
  new Kit().use(...plugins).install();
}
