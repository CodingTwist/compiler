// Typed SNBT numbers (`1.0f`, `64b`…) and int arrays.

/**
 * A number with an SNBT type suffix (`0.0f`, `64b`…). Use {@link Float}, {@link Double} and
 * friends.
 */
export class NbtNum {
  constructor(
    readonly value: number,
    readonly suffix: "" | "b" | "s" | "l" | "f" | "d",
    /** Force a decimal point even on whole numbers (`0` -> `0.0f`). */
    private readonly decimal = false,
  ) {}

  render(): string {
    let n = String(this.value);
    if (this.decimal && Number.isInteger(this.value)) n = `${n}.0`;
    return n + this.suffix;
  }
}

/** `1.0f` - a 32-bit float (decimal point always emitted). */
export const Float = (n: number): NbtNum => new NbtNum(n, "f", true);
/** `1.0d` - a 64-bit double (decimal point always emitted). */
export const Double = (n: number): NbtNum => new NbtNum(n, "d", true);
/** `1b` - a byte (also how booleans are commonly written). */
export const Byte = (n: number): NbtNum => new NbtNum(n, "b");
/** `1s` - a short. */
export const Short = (n: number): NbtNum => new NbtNum(n, "s");
/** `1l` - a long. */
export const Long = (n: number): NbtNum => new NbtNum(n, "l");

/** `[I;1,2,3]`: an int array, used for UUIDs and block positions. */
export class NbtIntArray {
  constructor(private readonly values: readonly number[]) {}
  render(): string {
    return `[I;${this.values.join(",")}]`;
  }
}

export const IntArray = (values: readonly number[]): NbtIntArray => new NbtIntArray(values);
