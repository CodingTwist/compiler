import { Byte, type NbtInput } from "./nbt";
import type { VersionProfile } from "../../versions/profile";
import {
  asByte,
  atLeast,
  defineEntityNbt,
  field,
  nested,
  type EntityNbtSchema,
} from "./entity-nbt";
import type { MobEffect } from "./resource.generated";

/**
 * One entry of a mob's `active_effects` (and of anything else holding a
 * `MobEffectInstance`), as a typed concept rather than a hand-spelt compound:
 *
 *   Effect({ id: MobEffect.SLOWNESS, amplifier: 127, duration: -1, showParticles: false })
 *     // 1.20.2+ -> {id:"minecraft:slowness",amplifier:127b,duration:-1,show_particles:0b}
 *     // 1.20.1  -> {Id:2,Amplifier:127b,Duration:-1,ShowParticles:0b}
 *
 * 1.20.2 both lower-cased the keys and swapped the numeric effect id for a
 * resource location; the author names the effect once and the version decides.
 */
export interface EffectFields {
  id: MobEffect;
  /** Level I is 0. */
  amplifier?: number;
  /** Ticks; `-1` is infinite. */
  duration?: number;
  /** Semi-transparent particles, as from a beacon. */
  ambient?: boolean;
  showParticles?: boolean;
  /**
   * Whether the effect appears in the inventory GUI / HUD. NBT-only: `/effect give`'s
   * `hideParticles` flag sets both this and `showParticles` together, so hiding just the
   * particles and keeping the icon (or the reverse) is only reachable from here.
   */
  showIcon?: boolean;
  /** A lower-amplifier effect of the same type, restored when this one ends. */
  hiddenEffect?: EffectFields;
}

/**
 * The pre-1.20.2 numeric ids (mcdoc `EffectIntId`, 1.19+). Nothing added after
 * 1.20.1 is here because nothing after it needs the numeric form.
 * ponytail: 1.19 and older want the *byte* form; add the cast if helix ever
 * supports a version that old.
 */
const LEGACY_IDS: Record<string, number> = {
  speed: 1, slowness: 2, haste: 3, mining_fatigue: 4, strength: 5,
  instant_health: 6, instant_damage: 7, jump_boost: 8, nausea: 9,
  regeneration: 10, resistance: 11, fire_resistance: 12, water_breathing: 13,
  invisibility: 14, blindness: 15, night_vision: 16, hunger: 17, weakness: 18,
  poison: 19, wither: 20, health_boost: 21, absorption: 22, saturation: 23,
  glowing: 24, levitation: 25, luck: 26, unluck: 27, slow_falling: 28,
  conduit_power: 29, dolphins_grace: 30, bad_omen: 31, hero_of_the_village: 32,
  darkness: 33,
};

const encodeId = (v: MobEffect, version: VersionProfile): NbtInput => {
  const id = v.render();
  if (atLeast(version, "1.20.2")) return id;
  const numeric = LEGACY_IDS[id.replace(/^minecraft:/, "")];
  if (numeric === undefined)
    throw new Error(
      `${id} has no pre-1.20.2 numeric id - it did not exist on that version`,
    );
  return numeric;
};

export const EFFECT: EntityNbtSchema<EffectFields> = {
  id: field({ key: "id", was: { key: "Id", until: "1.20.2" }, encode: encodeId }),
  amplifier: field({ key: "amplifier", was: { key: "Amplifier", until: "1.20.2" }, encode: Byte }),
  duration: field({ key: "duration", was: { key: "Duration", until: "1.20.2" } }),
  ambient: field({ key: "ambient", was: { key: "Ambient", until: "1.20.2" }, encode: asByte }),
  showParticles: field({ key: "show_particles", was: { key: "ShowParticles", until: "1.20.2" }, encode: asByte }),
  showIcon: field({ key: "show_icon", was: { key: "ShowIcon", until: "1.20.2" }, encode: asByte }),
  // The schema refers to itself, so build this field's encoder at render time -
  // by then `EFFECT` is initialised.
  hiddenEffect: (v, version) =>
    field<EffectFields>({
      key: "hidden_effect",
      was: { key: "HiddenEffect", until: "1.20.2" },
      encode: nested(EFFECT),
    })(v, version),
};

/** {@link EffectFields} as an NBT compound. */
export const Effect = defineEntityNbt<EffectFields>(EFFECT);
