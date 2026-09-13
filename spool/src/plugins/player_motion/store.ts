import { Range } from "helix";
import type { FunctionRef } from "helix";
import type { PlayerMotionInternals } from "./context";

/**
 * `internal/store/{x,y,z}`: writes each axis as 32 bit flags (`#x.0` .. `#x.31`).
 *
 * The enchantment can only test "is this score 1" and apply a fixed push, so each bit gets
 * a
 * push of `0.0001 * 2^bit`, and the set bits add up to the value.
 *
 * Bit 31 is the sign: if negative, set it and add 2^31-1. Bits 30..1 are set by subtracting
 * 2^bit when the value is big enough. Bit 0 is what's left.
 */
export function defineStore(I: PlayerMotionInternals): void {
  const { storeBit, dummyScore, fStoreX, fStoreY, fStoreZ } = I;

  const defineAxis = (fn: FunctionRef, axis: string) => {
    const value = dummyScore(`#${axis}`);
    fn.build((ctx) => {
      // Clear bits 0..30, set bit 31 = 0 (as the run target so it's one execute).
      const clear = ctx.execute();
      for (let bit = 0; bit <= 30; bit++) clear.storeResultScore(storeBit(`#${axis}.${bit}`));
      clear.run((b) => storeBit(`#${axis}.31`).set(0));

      ctx.execute().ifScoreMatches(value, new Range(0, 0)).run((b) => b.return_(1));

      // Sign bit: if negative, flag bit 31 and add 2^31-1 to make it positive.
      ctx
        .execute()
        .storeSuccessScore(storeBit(`#${axis}.31`))
        .ifScoreMatches(value, new Range(undefined, -1))
        .run((b) => value.add(2147483647));

      // Bits 30..1: subtract the power of two when present, recording the bit.
      for (let bit = 30; bit >= 1; bit--) {
        const pow = 2 ** bit;
        ctx
          .execute()
          .storeSuccessScore(storeBit(`#${axis}.${bit}`))
          .ifScoreMatches(value, new Range(pow, undefined))
          .run((b) => value.remove(pow));
      }
      // Bit 0: whatever remains (1) is the lowest bit.
      ctx
        .execute()
        .ifScoreMatches(value, new Range(1, undefined))
        .run((b) => storeBit(`#${axis}.0`).set(1));
    });
  };

  defineAxis(fStoreX, "x");
  defineAxis(fStoreY, "y");
  defineAxis(fStoreZ, "z");
}
