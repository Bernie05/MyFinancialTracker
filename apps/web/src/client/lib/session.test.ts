import { expect, test } from "bun:test";
import { safeNext } from "./session";

const BS = String.fromCharCode(92); // a backslash
test("after sign-in, only same-site paths are followed", () => {
  const origin = "https://mft.example.com";
  expect(safeNext("/expenses?range=all", origin)).toBe("/expenses?range=all");
  expect(safeNext("/cards/1", origin)).toBe("/cards/1");
  const bad = ["//evil.com", `/${BS}evil.com`, `${BS}${BS}evil.com`, `/a${BS}b`, "https://evil.com", "javascript:alert(1)", "/x\ny", "evil.com", "/login", "/register", ""];
  for (const next of [...bad, null]) expect(safeNext(next, origin)).toBe("/");
});
