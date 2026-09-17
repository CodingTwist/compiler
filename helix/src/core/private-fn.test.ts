import { expect, test } from "vitest";
import { isPrivate, privateChild, privateName } from "./private-fn";

test("privateName split", () => {
  expect(privateName("clock", "split")).toBe("zzzprivate/clock");
  expect(privateName("mace/tick_one", "split")).toBe(
    "zzzprivate/mace/tick_one",
  );
  expect(privateName("zzzprivate/clock", "split")).toBe("zzzprivate/clock");
});

test("privateName beside", () => {
  expect(privateName("clock", "beside")).toBe("zzz/clock");
  expect(privateName("mace/tick_one", "beside")).toBe("mace/zzz/tick_one");
  expect(privateName("mace/state/idle/done", "beside")).toBe(
    "mace/zzz/state/idle/done",
  );
  expect(privateName("mace/zzz/tick_one", "beside")).toBe("mace/zzz/tick_one");
});

test("privateChild split", () => {
  expect(privateChild("tick", "if_0", "split")).toBe("zzzprivate/tick/if_0");
  expect(privateChild("door/open", "if_0", "split")).toBe(
    "zzzprivate/door/open/if_0",
  );
  expect(privateChild("zzzprivate/tick/if_0", "at_0", "split")).toBe(
    "zzzprivate/tick/if_0/at_0",
  );
});

test("privateChild beside", () => {
  expect(privateChild("tick", "if_0", "beside")).toBe("zzz/tick/if_0");
  expect(privateChild("zzz/tick/if_0", "at_0", "beside")).toBe(
    "zzz/tick/if_0/at_0",
  );
  expect(privateChild("mace/tick", "if_0", "beside")).toBe(
    "mace/zzz/tick/if_0",
  );
});

test("plugin folder is kept in both layouts", () => {
  expect(isPrivate("zzzplugin/rigidbody/init")).toBe(true);
  expect(privateName("zzzplugin/rb/init", "beside")).toBe("zzzplugin/rb/init");
  expect(privateChild("zzzplugin/rb/solve", "if_0", "split")).toBe(
    "zzzplugin/rb/solve/if_0",
  );
});
