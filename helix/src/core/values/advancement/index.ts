// Advancements: `dp.advancement(name, new AdvancementDef().criterion("t", Trigger.usingItem(wand)))`.
//
// Triggers are native event listeners, so prefer them over tick polling for anything a player does.
export { Trigger, type CriterionJson } from "./trigger";
export { AdvancementDef, type AdvancementDisplay, type AdvancementFrame } from "./def";
