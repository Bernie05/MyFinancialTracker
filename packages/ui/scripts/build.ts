/**
 * Builds @mft/ui with Bun's bundler.
 *   bun scripts/build.ts
 *
 * Outputs
 *   dist/index.js, dist/index.css   ESM library for the app (React stays external)
 *   dist/iife/mft-ui.js             one classic script assigning window.MFT,
 *                                   reading React from window.React (design-system previews)
 *   dist/**\/*.d.ts                  type declarations (tsc)
 */
import type { BunPlugin } from "bun";
import { rm } from "node:fs/promises";

const root = new URL("../", import.meta.url).pathname;
const external = ["react", "react-dom", "react/jsx-runtime"];

await rm(`${root}dist`, { recursive: true, force: true });

// 1. ESM library ------------------------------------------------------------
const esm = await Bun.build({
  entrypoints: [`${root}src/index.ts`],
  outdir: `${root}dist`,
  format: "esm",
  target: "browser",
  external,
  sourcemap: "linked",
});
assertOk("esm", esm);

// 2. IIFE bundle ------------------------------------------------------------
/**
 * Resolves React imports to the page's globals instead of bundling a second copy.
 * The automatic JSX runtime is shimmed over React.createElement:
 * `jsx` receives children as one value, `jsxs` a static array to spread.
 */
const reactGlobals: BunPlugin = {
  name: "react-globals",
  setup(build) {
    build.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, (args) => ({ path: args.path, namespace: "react-global" }));
    build.onLoad({ filter: /.*/, namespace: "react-global" }, (args) => {
      if (args.path === "react/jsx-runtime" || args.path === "react/jsx-dev-runtime") {
        return {
          loader: "js",
          contents: `
const R = window.React;
function split(props, key) {
  const { children, ...rest } = props || {};
  if (key !== undefined) rest.key = key;
  return [rest, children];
}
export function jsx(type, props, key) {
  const [rest, children] = split(props, key);
  return children === undefined ? R.createElement(type, rest) : R.createElement(type, rest, children);
}
export function jsxs(type, props, key) {
  const [rest, children] = split(props, key);
  return R.createElement(type, rest, ...children);
}
export const Fragment = R.Fragment;
export const jsxDEV = jsx;`,
        };
      }
      const global = args.path.startsWith("react-dom") ? "ReactDOM" : "React";
      return { loader: "js", contents: `module.exports = window.${global};` };
    });
  },
};

const iife = await Bun.build({
  entrypoints: [`${root}src/iife-entry.ts`],
  outdir: `${root}dist/iife`,
  naming: { entry: "mft-ui.[ext]" },
  format: "iife",
  target: "browser",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [reactGlobals],
});
assertOk("iife", iife);

// 3. Type declarations ------------------------------------------------------
const tsc = Bun.which("tsc") ?? `${root}node_modules/.bin/tsc`;
const types = Bun.spawnSync([tsc, "-p", "tsconfig.json", "--noEmit", "false", "--declaration", "--emitDeclarationOnly", "--outDir", "dist", "--rootDir", "src"], {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
});
if (types.exitCode !== 0) throw new Error("tsc: declaration emit failed");

for (const out of [...esm.outputs, ...iife.outputs]) {
  console.log(`built ${out.path.replace(root, "")}  ${(out.size / 1024).toFixed(1)} KB`);
}

function assertOk(label: string, result: Awaited<ReturnType<typeof Bun.build>>) {
  if (result.success) return;
  for (const log of result.logs) console.error(log);
  throw new Error(`${label} build failed`);
}
