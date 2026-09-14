// The dependencies the swing maths reads.
import type { PlayerMotion } from "../../player_motion";
import type { Constants, GrappleSelectors, StateRepository } from "../state";

/** What the swing maths needs from the rest of the plugin. */
export interface PhysicsDeps {
  repo: StateRepository;
  consts: Constants;
  selectors: GrappleSelectors;
  motion: PlayerMotion;
}
