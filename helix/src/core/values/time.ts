import { CommandValue } from "./value";

type Unit = "t" | "s" | "d";

/**
 * A duration (`time`): a number of ticks by default, or seconds/days.
 *
 *   Time(20)            -> "20"   (ticks)
 *   Time.seconds(5)     -> "5s"
 *   Time.days(1)        -> "1d"
 */
export class TimeValue implements CommandValue {
  constructor(
    private readonly amount: number,
    private readonly unit: Unit,
  ) {}

  render(): string {
    return this.unit === "t" ? `${this.amount}` : `${this.amount}${this.unit}`;
  }
}

export type Time = TimeValue;

export const Time = Object.assign(
  (ticks: number): TimeValue => new TimeValue(ticks, "t"),
  {
    ticks: (n: number): TimeValue => new TimeValue(n, "t"),
    seconds: (n: number): TimeValue => new TimeValue(n, "s"),
    days: (n: number): TimeValue => new TimeValue(n, "d"),
  },
);
