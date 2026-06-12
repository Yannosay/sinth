const esbuild = require("esbuild");
const path = require("path");

const SASS_PACKAGE_NAME = "sass";
const ENTRY = path.join(__dirname, "..", "dist", "cli.js");
const OUTFILE = path.join(__dirname, "..", "dist", "cli.js");

esbuild.build({
  entryPoints: [ENTRY],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  external: [
    "fs", "path", "os", "http", "https", "child_process",
    "stream", "util", "url", "querystring", "crypto",
    "zlib", "events", "assert", "buffer", "string_decoder",
    "tty", "net", "dns", "tls", "readline", "cluster",
    "worker_threads", "perf_hooks", "v8", "vm", "module",
  ],
  plugins: [{
    name: "inline-sass",
    setup(build) {
      build.onResolve({ filter: /^sass$/ }, () => ({
        path: require.resolve(SASS_PACKAGE_NAME),
        namespace: "file",
      }));
    },
  }],
  outfile: OUTFILE,
  allowOverwrite: true,
  logLevel: "info",
}).then(() => {
  console.log("✓ sass inlined into dist/cli.js");
}).catch((err) => {
  console.error("Bundle failed:", err);
  process.exit(1);
});