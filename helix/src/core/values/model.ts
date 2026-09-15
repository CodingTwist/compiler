import { normalizeId } from "../../versions/registry";
import { CommandValue } from "./value";

/**
 * A resource pack model. `Model.item(texture)` is a flat item sprite; `.parent`/`.texture`
 * for
 * others, `.raw(json)` as an escape hatch. Registered with {@link Datapack.model}.
 *
 *   dp.model("web_shooter", Model.item("minecraft:item/carrot_on_a_stick"))
 */
export class Model {
  private parentId?: string;
  private textureMap: Record<string, string> = {};
  private rawJson?: Record<string, unknown>;

  /** A flat sprite item model (`parent: item/generated`, `textures.layer0 = texture`). */
  static item(texture: string): Model {
    return new Model()
      .parent("minecraft:item/generated")
      .texture("layer0", texture);
  }

  /** A full-cube block model with one texture on every face (`block/cube_all`). */
  static cubeAll(texture: string): Model {
    return new Model()
      .parent("minecraft:block/cube_all")
      .texture("all", texture);
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
      ...(this.parentId !== undefined
        ? { parent: normalizeId(this.parentId) }
        : {}),
      ...(Object.keys(this.textureMap).length
        ? { textures: this.textureMap }
        : {}),
    };
  }
}

/**
 * A handle to a registered {@link Model}, for `Item.X.model(ref)`.
 * Renders as `item_model` on 1.21.4+; older versions need {@link legacyModelData}.
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
