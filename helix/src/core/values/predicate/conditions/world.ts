// Condition JSON builders for world, block, item and score checks. `Predicate` wraps them.
import type { VersionProfile } from "../../../../versions/profile";
import type { BlockValue } from "../../block";
import type { Id } from "../../id";
import type { ItemValue } from "../../item";
import { PredicateRef } from "../ref";
import type { Bound, LocationSpec, PredicateJson, ScoreBound } from "../types";
import { CONDITION_TYPE_DATA_VERSION, INT_VALUE_CHECK_DATA_VERSION } from "../versions";
import { atLeast, bound, conditionKey, idStr, since } from "../render/common";
import { renderLocation } from "../render/location";

export type Build = (v: VersionProfile) => PredicateJson;

export const scoreValue =
  (name: string, objective: string, range: ScoreBound): Build =>
  (v) => {
    const modern = v.dataVersion >= INT_VALUE_CHECK_DATA_VERSION;
    return {
      ...conditionKey(v, modern ? "int_value_check" : "value_check"),
      value: {
        type: "minecraft:score",
        target: { type: "minecraft:fixed", name },
        score: objective,
      },
      [modern ? "test" : "range"]: range,
    };
  };

export const blockState =
  (block: string | BlockValue, properties?: Record<string, string>): Build =>
  (v) => {
    const id = typeof block === "string" ? idStr(block) : block.render();
    const hasProps = properties && Object.keys(properties).length;
    if (v.dataVersion >= CONDITION_TYPE_DATA_VERSION) {
      return {
        ...conditionKey(v, "match_block"),
        blocks: id,
        ...(hasProps ? { state: properties } : {}),
      };
    }
    return {
      ...conditionKey(v, "block_state_property"),
      block: id,
      ...(hasProps ? { properties } : {}),
    };
  };

export const location =
  (spec: LocationSpec, offset?: [number, number, number]): Build =>
  (v) => ({
    ...conditionKey(v, "location_check"),
    ...(offset ? { offsetX: offset[0], offsetY: offset[1], offsetZ: offset[2] } : {}),
    predicate: renderLocation(spec, v),
  });

export const matchTool =
  (item: ItemValue): Build =>
  (v) => ({ ...conditionKey(v, "match_tool"), predicate: item.toPredicate(v) });

export const weather =
  (spec: { raining?: boolean; thundering?: boolean }): Build =>
  (v) => ({ ...conditionKey(v, "weather_check"), ...spec });

export const randomChance =
  (chance: number): Build =>
  (v) => ({ ...conditionKey(v, "random_chance"), chance });

export const timeCheck =
  (spec: { value: Bound; period?: number; clock?: string | Id }): Build =>
  (v) => {
    const out: PredicateJson = { ...conditionKey(v, "time_check") };
    if (atLeast(v, "26.1")) {
      if (spec.clock === undefined) {
        throw new Error(`Predicate timeCheck needs a clock on 26.1+ (the pack targets ${v.id})`);
      }
      out.clock = idStr(spec.clock);
    } else if (spec.clock !== undefined) {
      since(v, "26.1", "timeCheck clock");
    }
    out.value = bound(spec.value);
    if (spec.period !== undefined) out.period = spec.period;
    return out;
  };

export const environmentAttribute =
  (attribute: string | Id, value: unknown): Build =>
  (v) => {
    since(v, "26.1", "environmentAttribute");
    return {
      ...conditionKey(v, "environment_attribute_check"),
      attribute: idStr(attribute),
      value,
    };
  };

export const reference =
  (ref: PredicateRef | Id | string): Build =>
  (v) => {
    const name = ref instanceof PredicateRef ? ref.id : idStr(ref);
    // 26.3 dropped `reference`; an id string is a valid term instead.
    return v.dataVersion >= CONDITION_TYPE_DATA_VERSION
      ? { ...conditionKey(v, "all_of"), terms: [name] }
      : { ...conditionKey(v, "reference"), name };
  };
