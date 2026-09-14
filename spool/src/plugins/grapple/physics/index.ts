/**
 * The swing maths over score vectors, one tick at a time:
 *
 *   1. SENSE      {@link senseSwingState}: position, velocity, and the anchor.
 *   2. CONSTRAIN  {@link solveConstraint}: keep the player on the rope and the swing going.
 *   3. RELEASE    {@link releaseKick}: fling on let-go.
 */
export type { PhysicsDeps } from "./types";
export * from "./sense";
export * from "./constrain";
export * from "./release";
