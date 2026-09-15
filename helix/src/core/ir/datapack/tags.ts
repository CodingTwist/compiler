// `Datapack` layer: registry tags, function tags and raw registry files.
import { FunctionRef } from "../../function_ref";
import { EntityType } from "../../values/resource.generated";
import { FunctionTagRef } from "../../values/function-tag";
import { DatapackFunctions } from "./functions";

/** A registry tag's registered body: its members and whether it replaces inherited ones. */
export interface RegistryTag {
  /** The registry this tag belongs to (`block`, `item`, `fluid`, `entity_type`, ...). */
  registry: string;
  /** Member ids / `#tag` references. */
  values: string[];
  /** `replace: true` to discard members contributed by lower-priority packs. */
  replace: boolean;
}

export class DatapackTags extends DatapackFunctions {
  // Registry tags, keyed `<registry>/<name>`. Separate from function tags.
  private registryTags = new Map<string, RegistryTag>();
  // Raw JSON for types without a builder, keyed `<folder>/<name>`.
  private registryFiles = new Map<string, unknown>();

  /**
   * Registers a registry tag (`block`, `item`, `entity_type`…). Registering again appends.
   * `replace: true` drops members from lower-priority packs.
   */
  tag(
    registry: string,
    name: string,
    spec: { values: string[]; replace?: boolean },
  ): void {
    const key = `${registry}/${name}`;
    const existing = this.registryTags.get(key);
    if (existing) {
      existing.values.push(...spec.values);
      if (spec.replace) existing.replace = true;
      return;
    }
    this.registryTags.set(key, {
      registry,
      values: [...spec.values],
      replace: spec.replace ?? false,
    });
  }

  /** Registered registry tags (`<registry>/<name>` → body), for codegen. */
  get registryTagDefs(): ReadonlyMap<string, RegistryTag> {
    return this.registryTags;
  }

  /**
   * Declares a function tag and returns a ref for `ctx.callTag(...)` / `schedule`.
   * Members are {@link FunctionRef}s, so they must exist. Registering again appends.
   */
  functionTag(
    name: string,
    spec: { values: FunctionRef[]; replace?: boolean } = { values: [] },
  ): FunctionTagRef {
    this.tag("function", name, {
      values: spec.values.map((ref) => this.idOf(ref).render()),
      replace: spec.replace,
    });
    return FunctionTagRef(this.name, name);
  }

  /**
   * Declares an entity type tag and returns it as a type for `Selector.type(...)`, so one
   * selector can match several types. Registering again appends.
   */
  entityTypeTag(name: string, types: readonly EntityType[]): EntityType {
    const known = this.registryTags.get(`entity_type/${name}`)?.values ?? [];
    this.tag("entity_type", name, {
      values: [...new Set(types.map((t) => t.render()))].filter(
        (t) => !known.includes(t),
      ),
    });
    return EntityType(`#${this.name}:${name}`);
  }

  /**
   * Escape hatch for data types without a builder: writes `json` to
   * `data/<ns>/<folder>/<name>.json`.
   */
  registryFile(folder: string, name: string, json: unknown): void {
    this.registryFiles.set(`${folder}/${name}`, json);
  }

  /** Registered raw registry files (`<folder>/<name>` → JSON), for codegen. */
  get registryFileDefs(): ReadonlyMap<string, unknown> {
    return this.registryFiles;
  }
}
