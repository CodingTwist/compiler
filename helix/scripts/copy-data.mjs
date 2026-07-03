// Copy the version data JSON into dist so the compiled profiles can read it at
// runtime. tsc does not copy non-.ts assets, so this runs after `tsc`.
import fs from "fs";
import path from "path";

const src = path.join("src", "versions", "data");
const dest = path.join("dist", "versions", "data");

fs.mkdirSync(dest, { recursive: true });
for (const file of fs.readdirSync(src)) {
  if (file.endsWith(".json")) {
    fs.copyFileSync(path.join(src, file), path.join(dest, file));
  }
}
console.error(`Copied version data -> ${dest}`);

// The example ships static structure .nbt assets that tsc won't copy; mirror
// them into dist so `node dist/example/example.js` (npm run example) finds them.
const structSrc = path.join("src", "example", "structures");
const structDest = path.join("dist", "example", "structures");
if (fs.existsSync(structSrc)) {
  fs.cpSync(structSrc, structDest, { recursive: true });
  console.error(`Copied example structures -> ${structDest}`);
}
