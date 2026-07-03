import { normalizeId } from "../../versions/registry";
import { CommandValue } from "./value";

/**
 * A resource-pack **model** definition (`assets/<ns>/models/...json`). Covers the
 * common item case out of the box - `Model.item(texture)` is the flat
 * `item/generated` sprite - with `.parent`/`.texture` for anything else and a
 * `.raw(json)` escape hatch for shapes the typed builder doesn't model yet
 * (mirrors `dp.registryFile`). Registered via {@link Datapack.model}, which also
 * emits the 1.21.4+ item-definition file and hands back a {@link ModelRef} the
 * author attaches with `Item.X.model(ref)`.
 *
 *   dp.model("web_shooter", Model.item("minecraft:item/carrot_on_a_stick"))
 */
export class Model {
  private parentId?: string;
  private textureMap: Record<string, string> = {};
  private rawJson?: Record<string, unknown>;

  /** A flat sprite item model (`parent: item/generated`, `textures.layer0 = texture`). */
  static item(texture: string): Model {
    return new Model().parent("minecraft:item/generated").texture("layer0", texture);
  }

  /** A full-cube block model with one texture on every face (`block/cube_all`). */
  static cubeAll(texture: string): Model {
    return new Model().parent("minecraft:block/cube_all").texture("all", texture);
  }

  /** A column block model - `end` on top/bottom, `side` around (`block/cube_column`). */
  static cubeColumn(side: string, end: string): Model {
    return new Model()
      .parent("minecraft:block/cube_column")
      .texture("side", side)
      .texture("end", end);
  }

  /** Set the `parent` model id (namespace defaults to `minecraft:`). */
  parent(id: string): this {
    this.parentId = id;
    return this;
  }

  /** Bind a texture `slot` (e.g. `layer0`, `all`) to a texture id. */
  texture(slot: string, id: string): this {
    this.textureMap[slot] = normalizeId(id);
    return this;
  }

  /** Verbatim model JSON escape hatch; wins over the typed fields. */
  raw(json: Record<string, unknown>): this {
    this.rawJson = json;
    return this;
  }

  /** The model-file JSON (`assets/<ns>/models/item/<name>.json`). */
  toJson(): Record<string, unknown> {
    if (this.rawJson) return this.rawJson;
    return {
      ...(this.parentId !== undefined ? { parent: normalizeId(this.parentId) } : {}),
      ...(Object.keys(this.textureMap).length ? { textures: this.textureMap } : {}),
    };
  }
}

/**
 * A typed handle to a registered {@link Model} - the `<ns>:name` id of its item
 * definition, consumed by `Item.X.model(ref)`. On 1.21.4+ it lowers to the
 * `item_model` component; on older versions it needs {@link legacyModelData} (a
 * `custom_model_data` number) since `item_model` didn't exist yet.
 */
export class ModelRef implements CommandValue {
  constructor(
    readonly id: string,
    /** Fallback `custom_model_data` for versions predating the `item_model` component. */
    readonly legacyModelData?: number,
  ) {}

  render(): string {
    return normalizeId(this.id);
  }
}
