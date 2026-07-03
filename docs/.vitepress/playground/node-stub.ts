// Empty stand-in for Node built-ins (`fs`/`path`/`zlib`) in the browser build.
// helix's pure compile path never imports these; only its disk writers do, and
// those are dynamic-imported by `dp.writeDatapack()` - never called in the
// playground. The alias (see .vitepress/config.ts) points those specifiers here.
//
// It must be a benign empty object, not a throwing proxy: the CJS write/structure
// modules ARE evaluated (their `require("fs")` is followed by the bundler) even
// though their functions never run, and TS's `__importDefault` interop reads
// `.__esModule` at module-init time. Members stay undefined - safe, because
// they're only ever touched inside the disk-writing functions the browser
// doesn't call.
export default {};
