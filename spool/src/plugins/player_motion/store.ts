import { Range } from "helix";
import type { FunctionRef } from "helix";
import type { PlayerMotionInternals } from "./context";

/**
 * `internal/store/{x,y,z}`: write each axis value into the store objective as 32
 * on/off bit flags (`#x.0` .. `#x.31`).
 *
 * Why: the `apply_impulse` enchantment can't read a number - it can only test
 * "is this fixed score == 1?" and apply a fixed impulse if so. So we express the
 * value in binary: the enchantment has one effect per bit that, when that bit's
 * flag is set, pushes the player by `0.0001 * 2^bit` along the axis. Summed over
 * the set bits, those impulses reconstruct the original value as a real impulse.
 *
 * How we fill the flags (standard binary decomposition, high bit to low):
 *   - bit 31 is the sign bit. If the value is negative, set bit 31 and add
 *     2^31-1 to make it non-negative (the enchantment makes bit 31's impulse
 *     negative to match).
 *   - for bits 30..1: if the (now non-negative) value is >= 2^bit, set that bit
 *     and subtract 2^bit. `storeSuccessScore` records 1 exactly when the `if`
 *     matched, so the test and the flag are one command.
 *   - bit 0 is whatever single unit remains.
 */
export function defineStore(I: PlayerMotionInternals): void {
  const { storeBit, dummyScore, fStoreX, fStoreY, fStoreZ } = I;

  const defineAxis = (fn: FunctionRef, axis: string) => {
    const value = dummyScore(`#${axis}`);
    fn.build((ctx) => {
      // Clear bits 0..30, set bit 31 = 0 (as the run target so it's one execute).
      const clear = ctx.execute();
      for (let bit = 0; bit <= 30; bit++) clear.storeResultScore(storeBit(`#${axis}.${bit}`));
      clear.run((b) => b.scoreSet(storeBit(`#${axis}.31`).set(0)));

      ctx.execute().ifScoreMatches(value, new Range(0, 0)).run((b) => b.return_(1));

      // Sign bit: if negative, flag bit 31 and add 2^31-1 to make it positive.
      ctx
        .execute()
        .storeSuccessScore(storeBit(`#${axis}.31`))
        .ifScoreMatches(value, new Range(undefined, -1))
        .run((b) => b.scoreAdd(value.add(2147483647)));

      // Bits 30..1: subtract the power of two when present, recording the bit.
      for (let bit = 30; bit >= 1; bit--) {
        const pow = 2 ** bit;
        ctx
          .execute()
          .storeSuccessScore(storeBit(`#${axis}.${bit}`))
          .ifScoreMatches(value, new Range(pow, undefined))
          .run((b) => b.scoreRemove(value.remove(pow)));
      }
      // Bit 0: whatever remains (1) is the lowest bit.
      ctx
        .execute()
        .ifScoreMatches(value, new Range(1, undefined))
        .run((b) => b.scoreSet(storeBit(`#${axis}.0`).set(1)));
    });
  };

  defineAxis(fStoreX, "x");
  defineAxis(fStoreY, "y");
  defineAxis(fStoreZ, "z");
}
