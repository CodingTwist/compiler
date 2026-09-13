import { ignoreSourceFrames } from "helix";
import type { KitPlugin } from "./plugin";

// Debug source tracking points at the plugin's caller, not plugin internals.
ignoreSourceFrames(__dirname.replace(/[\\/][^\\/]+$/, ""));

/**
 * Plugins installed in this process. Installs change shared prototypes, so a repeat install
 * must be a no-op.
 */
const installed = new Set<string>();

/**
 * Installs plugins once each, ordered by their `deps`.
 *
 *   installKit([holding, clip]);
 *
 * Throws on a missing dep or a cycle.
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
