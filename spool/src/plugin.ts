/**
 * A spool plugin: a `name`, its `deps`, and an `install` that adds the feature.
 * Does nothing until passed to `installKit`.
 */
export interface KitPlugin {
  /** Unique id. Used to dedupe installs and to resolve `deps`. */
  readonly name: string;
  /** Plugins that must be installed first. A missing one is an error. */
  readonly deps?: readonly string[];
  /**
   * Adds the feature (e.g. `Selector.prototype.holding = …`). Runs at most once, so needn't
   * be idempotent.
   */
  install(): void;
}
