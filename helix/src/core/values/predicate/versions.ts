// dataVersion of the snapshot each predicate format change landed in.

/** 26.2 release: the entity predicate's `type` field became `entity_type`. */
export const ENTITY_TYPE_KEY_DATA_VERSION = 4903; // ponytail: release, not the snapshot it landed in; 26.2 snapshot profiles get the old key

/**
 * 26.3 Snapshot 4: `condition` became `type`, `reference` was removed, and
 * `block_state_property` became `match_block`.
 */
export const CONDITION_TYPE_DATA_VERSION = 5003;

/** 26.3 Pre-Release 1: `value_check` split into `int_value_check`/`float_value_check`, `range` became `test`. */
export const INT_VALUE_CHECK_DATA_VERSION = 5017;
