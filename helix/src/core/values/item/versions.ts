// dataVersion of the snapshot each item format change landed in.

/** Data version of 1.20.5, where item NBT was replaced by data components. */
export const COMPONENTS_DATA_VERSION = 3837;

/**
 * 24w44a (1.21.4) added `item_model`. Before it, model handles fall back to
 * `custom_model_data`.
 */
export const ITEM_MODEL_DATA_VERSION = 4174;

/**
 * 24w44a (1.21.4) made `custom_model_data` a struct, rendered `{floats:[n]}`; before, a
 * plain integer.
 */
export const CUSTOM_MODEL_DATA_STRUCT_DATA_VERSION = 4174;
