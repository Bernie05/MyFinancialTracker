/**
 * Generates the token stylesheets from `src/tokens/tokens.ts`.
 *   bun scripts/build-tokens.ts
 */
import { tokensCss, typeCss } from "./lib/token-outputs";

const root = new URL("../", import.meta.url);

await Bun.write(new URL("src/tokens/tokens.css", root), tokensCss("../../assets/fonts/"));
await Bun.write(new URL("src/tokens/type.css", root), typeCss());

console.log("tokens: wrote src/tokens/tokens.css and src/tokens/type.css");
