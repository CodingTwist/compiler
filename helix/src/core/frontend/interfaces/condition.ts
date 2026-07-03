export interface Condition {
  toExecuteIf(): string;
  invert(): Condition;
}