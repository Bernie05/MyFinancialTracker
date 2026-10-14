/**
 * Exports @mft/ui as Design System files (the claude.ai Design System artifact layout).
 *   bun run export:ds        (builds first)
 *
 * Writes <repo>/design-system-export/project/… — git-ignored, regenerated on every run:
 *   tokens.json                      from src/tokens/tokens.ts
 *   README.md                        design-system/README.md (the brand book)
 *   components/bundle.js|css         dist/iife (window.MFT)
 *   components/index.d.ts            flattened declarations
 *   components/<Comp>/README.md      src/components/<Comp>/README.md
 *   components/<Comp>/preview.html   design-system/previews/<Comp>.html
 *   components/Cover/preview.html    design-system/cover.html
 *   fonts/*.woff, assets/Logos/*
 */
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { designSystemTokens } from "./lib/token-outputs";

const pkg = new URL("../", import.meta.url).pathname;
const repo = new URL("../../../", import.meta.url).pathname;
const out = `${repo}design-system-export/project/`;
const NAMESPACE = "MFT";

const components = (await readdir(`${pkg}src/components`, { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

await rm(`${repo}design-system-export`, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const write = (path: string, data: string | Blob) => Bun.write(`${out}${path}`, data);
const text = (path: string) => Bun.file(path).text();

// Provenance -----------------------------------------------------------------
const git = (...args: string[]) => Bun.spawnSync(["git", ...args], { cwd: repo }).stdout.toString().trim();
const sha = git("rev-parse", "--short", "HEAD");
const branch = git("branch", "--show-current") || "main";
const meta = {
  source: "github",
  repo: "Bernie05/MyFinancialTracker",
  ref: sha ? `${branch}@${sha}` : `${branch} (uncommitted)`,
  package: "packages/ui",
  paths: {
    tokens: ["packages/ui/src/tokens/tokens.ts"],
    fonts: ["packages/ui/assets/fonts"],
    assets: ["packages/ui/assets/logo-mark.svg"],
    docs: ["packages/ui/design-system/README.md", "packages/ui/src/components/*/README.md"],
  },
  components: Object.fromEntries(components.map((c) => [c, `packages/ui/src/components/${c}/${c}.tsx`])),
  synced: new Date().toISOString().slice(0, 10),
};

// Tokens & docs ----------------------------------------------------------------
await write("tokens.json", JSON.stringify(designSystemTokens(meta), null, 2) + "\n");
await write("README.md", await text(`${pkg}design-system/README.md`));

// Bundle ---------------------------------------------------------------------
const header = `/* @ds-bundle: ${JSON.stringify({ format: 4, namespace: NAMESPACE, components: components.map((name) => ({ name })) })} */`;
const js = await text(`${pkg}dist/iife/mft-ui.js`);
const css = await text(`${pkg}dist/iife/mft-ui.css`);
if (/<\/script|<!--/i.test(js)) throw new Error("bundle.js contains </script or <!-- and can't be inlined");
if (/<\/style/i.test(css)) throw new Error("bundle.css contains </style and can't be inlined");
await write("components/bundle.js", `${header}\n${js}`);
await write("components/bundle.css", css);

// Types: one flat file — drop imports/re-exports, keep declarations ----------
const flatten = (src: string) =>
  src
    .split("\n")
    .filter((l) => !/^\s*import\s/.test(l) && !/^\s*export \* from/.test(l) && !/^\s*export \{\s*\};?$/.test(l))
    .join("\n")
    .trim();
const sources = [
  await text(`${pkg}dist/lib/money.d.ts`),
  ...(await Promise.all(components.map((c) => text(`${pkg}dist/components/${c}/${c}.d.ts`)))),
];
// Merge every `import { … } from "react"` into one line; local imports vanish because their declarations are inlined.
const reactNames = new Set<string>();
for (const src of sources) {
  for (const m of src.matchAll(/^import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"react";/gm)) {
    for (const name of m[1]!.split(",")) {
      const clean = name.replace(/\btype\b/, "").trim();
      if (clean) reactNames.add(clean);
    }
  }
}
const dts = [
  `// ${NAMESPACE} — MyFinancialTracker components (window.${NAMESPACE}). Types for documentation.`,
  `import type { ${[...reactNames].sort().join(", ")} } from "react";`,
  ...sources.map(flatten),
].join("\n\n");
await write("components/index.d.ts", dts + "\n");

// Per-component guidelines & previews ------------------------------------------
for (const c of components) {
  await write(`components/${c}/README.md`, await text(`${pkg}src/components/${c}/README.md`));
  await write(`components/${c}/preview.html`, await text(`${pkg}design-system/previews/${c}.html`));
}
await write("components/Cover/preview.html", await text(`${pkg}design-system/cover.html`));

// Fonts & assets ---------------------------------------------------------------
await cp(`${pkg}assets/fonts`, `${out}fonts`, { recursive: true, filter: (p) => !p.endsWith(".txt") });
await cp(`${pkg}assets/fonts/OFL.txt`, `${out}assets/Fonts/OFL.txt`);
await cp(`${pkg}assets/logo-mark.svg`, `${out}assets/Logos/logo-mark.svg`);
await write(
  "assets/Logos/README.md",
  "The MyFinancialTracker mark: three ascending bars on a `pine` tile, the tallest in `marigold` (the savings goal). Full-color only; it has fixed fills and does not inherit `currentColor`. Minimum size 24px; clear space of `space-2` on every side. The wordmark is plain type: Hanken Grotesk 650 in `ink`.\n",
);
await write(
  "assets/Fonts/README.md",
  "Hanken Grotesk is licensed under the SIL Open Font License 1.1 (OFL.txt). The variable WOFF files live in `fonts/`.\n",
);

console.log(`design system: exported ${components.length} components to design-system-export/project`);
