import type { Id } from "../../id";
import type { EntityPredicateSpec } from "./entity";

/** A damage source check, for `damage_source_properties` and damage triggers. */
export interface DamageSourceSpec {
  /** Damage type tags the damage must (`expected: true`) or must not be in. 1.19.4+. */
  tags?: { id: string | Id; expected: boolean }[];
  /** The entity responsible, e.g. the skeleton. */
  sourceEntity?: EntityPredicateSpec;
  /** The entity that hit, e.g. the arrow. */
  directEntity?: EntityPredicateSpec;
  /** Source and direct entity are the same. 1.21+. */
  isDirect?: boolean;
}
