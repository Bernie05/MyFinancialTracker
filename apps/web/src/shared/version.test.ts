import { expect, test } from "bun:test";
import rootPkg from "../../../../package.json";
import webPkg from "../../package.json";
import { APP_VERSION } from "./version";

test("the shown version matches both package.json files and is MAJOR.MINOR.PATCH", () => {
  expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  expect(webPkg.version).toBe(APP_VERSION);
  expect((rootPkg as { version?: string }).version).toBe(APP_VERSION);
});
