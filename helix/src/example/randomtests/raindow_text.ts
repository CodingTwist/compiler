import { TellrawText, Text, text } from "../../core/frontend";
import { Color } from "../../core/values/enums";
import { Selector } from "../../core/frontend/nodes/selector";
import { Datapack } from "../../core/ir/datapack";
import { v1_21_4 } from "../../versions/1_21_4";

function rainbowText(input: string): TellrawText {
  const parts: Text[] = [];

  const colors: Color[] = [
    Color.RED, Color.GOLD, Color.YELLOW, Color.GREEN,
    Color.AQUA, Color.BLUE, Color.LIGHT_PURPLE,
  ];

  //Set each letter to the next colour to create a rainbow
  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    const colorIndex = i % colors.length;
    parts.push(text(char).color(colors[colorIndex]));
  }
  return new TellrawText(parts);
}

const dp = new Datapack("example_rainbowtest", v1_21_4);
const main = dp.createFunction("main");

main.build((ctx) => {
  ctx.tellraw(Selector.allPlayers(), rainbowText("This is rainbow text!"));
  ctx.tellraw(Selector.allPlayers(), rainbowText("Anything in here will be rainbow"),
  );
});

dp.writeDatapack("./out/example_rainbowtext");


