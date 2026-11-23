const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = require("../app.js");

test("website includes all required calendar views", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  for (const view of ["Day", "Week", "Month", "Year"]) {
    assert.match(html, new RegExp(`>${view}<`));
  }
});

test("website exposes Pet Configuration, feeding entry, and analytics", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /Pet Configuration/);
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

test("website has expected-slot picker, sidebar filter and no hardcoded on-time rate", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const script = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(html, /id="entrySlot"/);
  assert.match(script, /data-filter-pet/);
  assert.match(script, /escapeHtml\(pet\.name\)/);
  assert.match(script, /schedule/);
  assert.doesNotMatch(script, /"100%"/);
  assert.doesNotMatch(html, /Pet settings/i);
});

test("escapeHtml escapes markup characters", () => {
  assert.equal(app.escapeHtml(`<b>"x" & 'y'</b>`), "&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;");
});

test("normalizeState keeps old data and defaults missing fields", () => {
  const old = { pets: [{ id: "a", name: "A", goal: 3, color: "#000", bg: "#fff", emoji: "x" }], entries: [{ id: "1", petId: "a", date: "2024-01-01", time: "08:00" }] };
  const result = app.normalizeState(old);
  assert.deepEqual(result.pets[0].schedule, []);
  assert.equal(result.pets[0].goal, 3);
  assert.equal(result.pets[0].id, "a");
  assert.deepEqual(result.entries, old.entries);
  const bad = app.normalizeState({ pets: [{ id: "b", name: "B", goal: "x", schedule: ["09:00", "bad", "09:00", "07:00", 5] }] });
  assert.deepEqual(bad.pets[0].schedule, ["07:00", "09:00"]);
  assert.equal(bad.pets[0].goal, 1);
  assert.deepEqual(bad.entries, []);
});

test("effectiveGoal follows the schedule when set", () => {
  assert.equal(app.effectiveGoal({ goal: 5, schedule: ["07:00", "19:00"] }), 2);
  assert.equal(app.effectiveGoal({ goal: 5, schedule: [] }), 5);
});

test("slotHour maps times to week rows and clamps", () => {
  assert.equal(app.slotHour("07:30"), 7);
  assert.equal(app.slotHour("08:00"), 7);
  assert.equal(app.slotHour("09:15"), 9);
  assert.equal(app.slotHour("12:30"), 11);
  assert.equal(app.slotHour("18:00"), 17);
  assert.equal(app.slotHour("05:00"), 7);
  assert.equal(app.slotHour("23:00"), 17);
});

const pet = { id: "p", schedule: ["08:00", "12:00"] };
const e = (id, time, date = "2024-05-10", petId = "p") => ({ id, petId, date, time });
const noon = new Date("2024-05-10T10:00:00");

test("matchSchedule matches within tolerance and not beyond", () => {
  let r = app.matchSchedule(pet, [e("1", "08:00"), e("2", "12:00")], "2024-05-10", new Date("2024-05-10T20:00:00"));
  assert.deepEqual(r.slots.map(s => s.status), ["done", "done"]);
  r = app.matchSchedule(pet, [e("1", "08:45")], "2024-05-10", noon);
  assert.equal(r.slots[0].status, "done");
  r = app.matchSchedule(pet, [e("1", "09:01")], "2024-05-10", noon);
  assert.equal(r.slots[0].status, "missed");
  assert.equal(r.extras.length, 1);
});

test("matchSchedule is one-to-one and nearest-first", () => {
  const close = { id: "p", schedule: ["08:00", "08:30"] };
  const r = app.matchSchedule(close, [e("1", "08:25")], "2024-05-10", noon);
  assert.equal(r.slots[0].entry, null);
  assert.equal(r.slots[1].entry.id, "1");
  const two = app.matchSchedule(close, [e("1", "08:25"), e("2", "07:50")], "2024-05-10", noon);
  assert.equal(two.slots[0].entry.id, "2");
  assert.equal(two.slots[1].entry.id, "1");
  assert.equal(two.extras.length, 0);
});

test("matchSchedule status: pending for future, missed for past days, grace window", () => {
  const now = new Date("2024-05-10T08:30:00");
  let r = app.matchSchedule(pet, [], "2024-05-10", now);
  assert.deepEqual(r.slots.map(s => s.status), ["pending", "pending"]);
  r = app.matchSchedule(pet, [], "2024-05-10", new Date("2024-05-10T09:30:00"));
  assert.deepEqual(r.slots.map(s => s.status), ["missed", "pending"]);
  r = app.matchSchedule(pet, [], "2024-05-09", now);
  assert.deepEqual(r.slots.map(s => s.status), ["missed", "missed"]);
  r = app.matchSchedule(pet, [], "2024-05-11", now);
  assert.deepEqual(r.slots.map(s => s.status), ["pending", "pending"]);
});

test("onTimeStats counts done/missed, excludes pending, null without schedule", () => {
  const other = { id: "q", schedule: [] };
  const entries = [e("1", "08:10"), e("2", "08:00", "2024-05-10", "q")];
  const now = new Date("2024-05-10T10:30:00");
  const s = app.onTimeStats([pet, other], entries, ["2024-05-10"], now);
  assert.deepEqual(s.perPet.p, { done: 1, missed: 0, rate: 100 });
  assert.deepEqual(s.perPet.q, { done: 0, missed: 0, rate: null });
  assert.equal(s.total.rate, 100);
  const later = app.onTimeStats([pet], entries, ["2024-05-10"], new Date("2024-05-10T14:00:00"));
  assert.deepEqual(later.total, { done: 1, missed: 1, rate: 50 });
  assert.equal(app.onTimeStats([other], [], ["2024-05-10"], now).total.rate, null);
});

test("Pet Configuration has a Save button, draft editing and an icon picker", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const script = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(html, /id="saveSettings"/);
  assert.match(html, /id="petEmoji"/);
  assert.match(script, /data-emoji/);
  assert.match(script, /draftPets/);
  assert.match(script, /function saveSettings/);
});
test("How to Use button launches a guided tour covering the platform", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /id="howToUse"[^>]*>[\s\S]*?How to Use/);
  assert.match(html, /<script src="tour\.js">/);
  const { TOUR_STEPS } = require("../tour.js");
  const text = TOUR_STEPS.map(s => `${s.title} ${s.text}`).join(" ").toLowerCase();
  for (const word of ["analytics", "filter", "counter", "add feeding", "day, week, month and year", "expected", "icon", "save changes", "locally"]) {
    assert.ok(text.includes(word), `tour mentions ${word}`);
  }
  TOUR_STEPS.forEach(step => {
    assert.ok(step.title && step.text);
    for (const id of (step.target || "").match(/#[\w-]+/g) || []) assert.ok(html.includes(`id="${id.slice(1)}"`), `${id} exists`);
  });
});
