/**
 * The plugin contract. A `KitPlugin` is one self-describing feature of the kit:
 * it knows its `name`, which other plugins it `deps` on, and how to `install`
 * itself (typically a prototype augmentation on a core class). Plugins are inert
 * until handed to the installer - see `Kit` / `installKit`.
 */
export interface KitPlugin {
  /** Unique id. Used to dedupe installs and to resolve `deps`. */
  readonly name: string;
  /**
   * Names of other plugins that must be installed before this one. The kit
   * topologically orders by this; a listed dep that wasn't provided (and isn't
   * already installed) is an error.
   */
  readonly deps?: readonly string[];
  /**
   * Apply the feature's side effects (e.g. `Selector.prototype.holding = …`).
   * The kit guarantees this runs **at most once** globally, so `install`
   * itself need not be idempotent.
   */
  install(): void;
}
