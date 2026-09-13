import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { latestProfile, PROFILE_DIR } from "./profile-file";

describe("latestProfile", () => {
  it("picks the newest dump by timestamp, not string order, and ignores other files", () => {
    const world = fs.mkdtempSync(path.join(os.tmpdir(), "helix-prof-"));
    expect(latestProfile(world)).toBeUndefined();
    const dir = path.join(world, PROFILE_DIR);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "profile-9.json"), '{"mc":"old"}');
    fs.writeFileSync(path.join(dir, "profile-10.json"), '{"mc":"new"}');
    fs.writeFileSync(path.join(dir, "notes.json"), "not json");
    const got = latestProfile(world)!;
    expect(got.file.endsWith("profile-10.json")).toBe(true);
    expect(got.dump.mc).toBe("new");
  });
});
