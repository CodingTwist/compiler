import { normalizeId } from "../../versions/registry";
import { ModelRef } from "./model";

/**
 * One applied model in a blockstate file: which model to show, plus the optional
 * rotation (`x`/`y`, multiples of 90), `uvlock`, and random-`weight`.
 */
export interface BlockStateVariant {
  /** The block model to render - a {@link ModelRef} (`dp.blockModel(...)`) or `<ns>:block/x`. */
  model: ModelRef | string;
  x?: number;
  y?: number;
  uvlock?: boolean;
  weight?: number;
}

function variantJson(v: BlockStateVariant): Record<string, unknown> {
  return {
    model: v.model instanceof ModelRef ? v.model.render() : normalizeId(v.model),
    ...(v.x !== undefined ? { x: v.x } : {}),
    ...(v.y !== undefined ? { y: v.y } : {}),
    ...(v.uvlock ? { uvlock: true } : {}),
    ...(v.weight !== undefined ? { weight: v.weight } : {}),
  };
}

/** A variant value: one model, or a weighted list Minecraft picks randomly from. */
type VariantValue = BlockStateVariant | BlockStateVariant[];

function variantValueJson(v: VariantValue): unknown {
  return Array.isArray(v) ? v.map(variantJson) : variantJson(v);
}

/**
 * A resource-pack **blockstate** definition (`assets/<ns>/blockstates/<block>.json`),
 * mapping each state of a block to the model(s) that render it. Blockstate files
 * override the appearance of an *existing* (usually vanilla) block - there is no
 * vanilla "new block", so this is the file half of any custom-block technique
 * (that technique - allocation, place/break detection - is policy for a higher
 * layer). Registered via {@link Datapack.blockState}.
 *
 *   dp.blockState("note_block", BlockState.variants({
 *     "note=0": { model: myModel },      // repurpose an unused note pitch
 *   }));
 */
export class BlockState {
  private variantMap: Record<string, VariantValue> = {};
  private multipartList: unknown[] = [];
  private rawJson?: Record<string, unknown>;

  /** A `variants`-style file mapping state strings (`""`, `facing=north`) to models. */
  static variants(map: Record<string, VariantValue>): BlockState {
    const bs = new BlockState();
    bs.variantMap = { ...map };
    return bs;
  }

  /** Map a single blockstate string to a variant (repeatable). */
  variant(state: string, v: VariantValue): this {
    this.variantMap[state] = v;
    return this;
  }

  /** Add a `multipart` case verbatim (`{ when?, apply }`) - the flexible builder. */
  part(part: unknown): this {
    this.multipartList.push(part);
    return this;
  }

  /** Verbatim blockstate JSON escape hatch; wins over the typed fields. */
  raw(json: Record<string, unknown>): this {
    this.rawJson = json;
    return this;
  }

  /** The blockstate-file JSON. */
  toJson(): Record<string, unknown> {
    if (this.rawJson) return this.rawJson;
    if (this.multipartList.length) return { multipart: this.multipartList };
    const variants: Record<string, unknown> = {};
    for (const [state, v] of Object.entries(this.variantMap)) {
      variants[state] = variantValueJson(v);
    }
    return { variants };
  }
}
