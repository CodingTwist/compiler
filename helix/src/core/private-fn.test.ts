import { expect, test } from "vitest";
import { privateChild, privateName } from "./private-fn";

test("privateName", () => {
  expect(privateName("clock")).toBe("zzz/clock");
  expect(privateName("mace/tick_one")).toBe("mace/zzz/tick_one");
  expect(privateName("mace/state/idle/done")).toBe("mace/zzz/state/idle/done");
  expect(privateName("mace/zzz/tick_one")).toBe("mace/zzz/tick_one");
  expect(privateName("zzz/clock")).toBe("zzz/clock");
});

test("privateChild", () => {
  expect(privateChild("tick", "if_0")).toBe("zzz/tick/if_0");
  expect(privateChild("zzz/tick/if_0", "at_0")).toBe("zzz/tick/if_0/at_0");
  expect(privateChild("mace/tick", "if_0")).toBe("mace/zzz/tick/if_0");
  expect(privateChild("mace/zzz/tick/if_0", "at_0")).toBe("mace/zzz/tick/if_0/at_0");
});
