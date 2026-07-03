import { ExpressionNode } from "../../ir/node";
import { FunctionContext } from "../context";

export interface IfBuilder {
  elif(condition: ExpressionNode, fn: (ctx: FunctionContext) => void): IfBuilder;
  else(fn: (ctx: FunctionContext) => void): void;
}