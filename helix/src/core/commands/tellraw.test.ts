import { describe, it, expect } from "vitest";
import { TellrawCommand } from "./tellraw";
import { Objective, Score, Text, text } from "../frontend";
import { Color } from "../values/enums";
import { Datapack } from "../ir/datapack";
import { CodegenContext, Dispatcher } from "../ir/commandhandler";
import { SayNode } from "./saycommand";
import { SelectorNode } from "./selector";
import { TellrawNode } from "./tellraw";
import { createHandlerMap } from "../codegen/codegen";
import { TellrawText } from "../frontend/nodes/tellraw_text";
import { click } from "../frontend/nodes/click";
import { hover } from "../frontend/nodes/hover";
import { Selector } from "../frontend/nodes/selector";
import { v1_21_4 } from "../../versions/profiles";


function createCommandTestEnv() {
  const dp = new Datapack("testpack", v1_21_4);

  const dispatcher = new Dispatcher(createHandlerMap());
  const ctx = new CodegenContext(dp, dispatcher);

  return { dp, dispatcher, ctx };
}

function buildTellraw(target: SelectorNode, value: string) {
  const tellraw = new TellrawText([new Text(value)]);

  return new TellrawNode(target, tellraw);
}

describe("TellrawCommand", () => {
  const cases = [
    { target: new Selector("@a").build(), text: "hello", expected: 'tellraw @a {"text":"hello"}' },
    { target: new Selector("@p").build(), text: "hi", expected: 'tellraw @p {"text":"hi"}' },
  ];

  it.each(cases)("generates tellraw %#", ({ target, text, expected }) => {
    const { ctx } = createCommandTestEnv();

    const command = new TellrawCommand();
    const node = buildTellraw(target, text);

    command.generate(node, ctx);

    expect(ctx.lines[0]).toEqual(expected);
  });
});

it("builds multi-part tellraw", () => {
      const { ctx } = createCommandTestEnv();

  const node = new TellrawNode(new Selector("@a").build(), new TellrawText([
    text("hello"),
    text(" world").bold(),
  ]));

    const command = new TellrawCommand();

    command.generate(node, ctx);
  expect(ctx.lines[0]).toEqual(
    `tellraw @a [{"text":"hello"},{"text":" world","bold":true}]`
  );
});

it("builds scoreboard tellraw node", () => {
        const { ctx } = createCommandTestEnv();

  const ob = new Objective("test");
  const score = new Score(ob, "test", 10);
  const node = new TellrawNode(new Selector("@a").build(), new TellrawText([score]));

    const command = new TellrawCommand();

    command.generate(node, ctx);

  expect(ctx.lines[0]).toEqual(
    `tellraw @a {"score":{"name":"test","objective":"test"}}`
  );
});
it("emits multi-part tellraw", () => {
  const message = new TellrawText([text("hello"), text(" world").bold()]);

  const { ctx } = createCommandTestEnv();

  const node = new TellrawNode(new Selector("@a").build(), message);
  const command = new TellrawCommand();

  command.generate(node, ctx);

  expect(ctx.lines[0]).toBe(
    'tellraw @a [{"text":"hello"},{"text":" world","bold":true}]',
  );
});

it("emits scoreboard tellraw", () => {
  const ob = new Objective("test");
  const score = new Score(ob, "player", 10);

  const { ctx } = createCommandTestEnv();

  const tellraw = new TellrawText([score]);

  const node = new TellrawNode(new Selector("@a").build(), tellraw);
  const command = new TellrawCommand();

  command.generate(node, ctx);

  expect(ctx.lines[0]).toBe(
    'tellraw @a {"score":{"name":"player","objective":"test"}}',
  );
});

it("emits mixed tellraw", () => {
  const ob = new Objective("var1");

  const message = new TellrawText([
    text("Score: ").bold().color(Color.BLUE),
    new Score(ob, "temp1", 0),
    text("!"),
  ]);

  const { ctx } = createCommandTestEnv();

  const node = new TellrawNode(new Selector("@a").build(), message);
  const command = new TellrawCommand();

  command.generate(node, ctx);

  expect(ctx.lines[0]).toBe(
    'tellraw @a [{"text":"Score: ","bold":true,"color":"blue"},{"score":{"name":"temp1","objective":"var1"}},{"text":"!"}]',
  );
});

it("tellraw click event", () => {

  const temp1: SayNode = new SayNode("hi");
  
  const message = new TellrawText([
    text("Test").onClick(click.command(temp1))
    .onHover(hover.text(text("hello"))),

  ]);

  const { ctx } = createCommandTestEnv();

  const node = new TellrawNode(new Selector("@a").build(), message);
  const command = new TellrawCommand();

  command.generate(node, ctx);

  expect(ctx.lines[0]).toBe(
    'tellraw @a {"text":"Test","click_event":{"action":"run_command","command":"say hi"},"hover_event":{"action":"show_text","value":[{"text":"hello"}]}}',
  );
});

