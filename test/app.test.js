const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("website includes all required calendar views", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  for (const view of ["Day", "Week", "Month", "Year"]) {
    assert.match(html, new RegExp(`>${view}<`));
  }
});

test("website exposes pet settings, feeding entry, and analytics", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /Pet settings/);
  assert.match(html, /Add feeding/);
  assert.match(html, /Analytics/);
  assert.match(html, /id="petForm"/);
});

test("application persists data and supports configurable pet goals", () => {
  const script = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(script, /localStorage\.setItem/);
  assert.match(script, /goal:/);
  assert.match(script, /data-goal/);
  assert.match(script, /petFeedings/);
});
