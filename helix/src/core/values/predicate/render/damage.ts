import type { VersionProfile } from "../../../../versions/profile";
import type { DamageSourceSpec, PredicateJson } from "../types";
import { CONDITION_TYPE_DATA_VERSION } from "../versions";
import { idStr, since } from "./common";
import { renderEntitySpec } from "./entity";

/** A `damage_source` predicate body. */
export function renderDamageSource(
  spec: DamageSourceSpec,
  version: VersionProfile,
): PredicateJson {
  const out: PredicateJson = {};
  if (spec.tags) {
    // ponytail: really 1.19.4, which has no DV key.
    since(version, "1.20", "damage tags");
    out.tags = spec.tags.map((t) => {
      const id = idStr(t.id);
      // Before 26.3 the id is always a tag, written without `#`.
      // ponytail: gated on the 26.3 condition-format snapshot; the exact one is unchecked.
      const bare = version.dataVersion < CONDITION_TYPE_DATA_VERSION && id.startsWith("#");
      return { id: bare ? id.slice(1) : id, expected: t.expected };
    });
  }
  if (spec.sourceEntity) out.source_entity = renderEntitySpec(spec.sourceEntity, version);
  if (spec.directEntity) out.direct_entity = renderEntitySpec(spec.directEntity, version);
  if (spec.isDirect !== undefined) {
    since(version, "1.21", "isDirect");
    out.is_direct = spec.isDirect;
  }
  return out;
}
