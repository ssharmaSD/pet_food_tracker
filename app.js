const STORAGE_KEY = "pawday-data-v1";

const TOLERANCE_MIN = 60;
const WEEK_ROW_HOURS = [7, 9, 11, 13, 15, 17];

const defaultPets = [
  { id: "milo", name: "Milo", goal: 3, schedule: ["07:30", "12:30", "18:00"], color: "#e98569", bg: "#f5dfc9", emoji: "🐶" },
  { id: "luna", name: "Luna", goal: 2, schedule: ["08:00", "18:00"], color: "#9c86bd", bg: "#eee7f4", emoji: "🐱" },
  { id: "coco", name: "Coco", goal: 2, schedule: ["09:15", "17:30"], color: "#70a78a", bg: "#dfece5", emoji: "🐇" }
];

const PET_EMOJIS = ["🐶", "🐕", "🐱", "🐈", "🐇", "🐹", "🐭", "🐦", "🦜", "🐠", "🐢", "🐍", "🦎", "🐴", "🐷", "🐑", "🦔", "🐾"];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}
function isValidTime(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
function toMinutes(time) {
  const [h, m] = String(time).split(":").map(Number);
  return h * 60 + m;
}
function normalizePet(pet) {
  const schedule = Array.isArray(pet.schedule) ? [...new Set(pet.schedule.filter(isValidTime))].sort() : [];
  const goal = Number.isFinite(Number(pet.goal)) && Number(pet.goal) >= 1 ? Math.floor(Number(pet.goal)) : 1;
  return { ...pet, goal, schedule };
}
function normalizeState(saved) {
  return {
    ...saved,
    pets: saved.pets.map(normalizePet),
    entries: Array.isArray(saved.entries) ? saved.entries : []
  };
}
function effectiveGoal(pet) {
  return (pet.schedule && pet.schedule.length) || pet.goal;
}
function slotHour(time) {
  const hour = Number(String(time).split(":")[0]);
  let row = WEEK_ROW_HOURS[0];
  WEEK_ROW_HOURS.forEach(h => { if (h <= hour) row = h; });
  return row;
}

// Matches a pet's expected slots on one day (dateStr "YYYY-MM-DD") to its logged entries.
// Nearest-first, one entry per slot, within TOLERANCE_MIN minutes.
function matchSchedule(pet, entries, dateStr, now) {
  const slotTimes = [...(pet.schedule || [])].sort();
  const mine = entries.filter(e => e.petId === pet.id && e.date === dateStr).sort((a, b) => String(a.time).localeCompare(String(b.time)));
  const pairs = [];
  slotTimes.forEach((time, si) => mine.forEach((entry, ei) => {
    const diff = Math.abs(toMinutes(time) - toMinutes(entry.time));
    if (diff <= TOLERANCE_MIN) pairs.push({ si, ei, diff });
  }));
  pairs.sort((a, b) => a.diff - b.diff || a.si - b.si || a.ei - b.ei);
  const slotMatch = new Map();
  const usedEntries = new Set();
  pairs.forEach(({ si, ei }) => {
    if (slotMatch.has(si) || usedEntries.has(ei)) return;
    slotMatch.set(si, ei);
    usedEntries.add(ei);
  });
  const today = dateKey(now);
  const slots = slotTimes.map((time, si) => {
    if (slotMatch.has(si)) return { time, status: "done", entry: mine[slotMatch.get(si)] };
    const passed = dateStr < today || (dateStr === today && now.getTime() > new Date(`${dateStr}T${time}`).getTime() + TOLERANCE_MIN * 60000);
    return { time, status: passed ? "missed" : "pending", entry: null };
  });
  return { slots, extras: mine.filter((_, ei) => !usedEntries.has(ei)) };
}

// On-time stats over the given dates ("YYYY-MM-DD"). Pending slots are excluded.
function onTimeStats(pets, entries, dates, now) {
  const rateOf = (done, missed) => (done + missed ? Math.round(done / (done + missed) * 100) : null);
  const perPet = {};
  let done = 0, missed = 0;
  pets.forEach(pet => {
    let d = 0, m = 0;
    dates.forEach(dateStr => matchSchedule(pet, entries, dateStr, now).slots.forEach(slot => {
      if (slot.status === "done") d++;
      if (slot.status === "missed") m++;
    }));
    perPet[pet.id] = { done: d, missed: m, rate: rateOf(d, m) };
    done += d; missed += m;
  });
  return { perPet, total: { done, missed, rate: rateOf(done, missed) } };
}


function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function dateKey(date) {
  const d = startOfDay(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function formatTime(date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function loadState() {
  try {
    const saved = JSON.parse(typeof localStorage === "undefined" ? null : localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.pets)) return normalizeState(saved);
  } catch (_) {}
  const today = dateKey(new Date());
  return normalizeState({
    pets: defaultPets,
    entries: [
      { id: "1", petId: "milo", date: today, time: "07:30" },
      { id: "2", petId: "milo", date: today, time: "12:30" },
      { id: "3", petId: "luna", date: today, time: "08:00" },
      { id: "4", petId: "coco", date: today, time: "09:15" }
    ]
  });
}

let state = loadState();
let currentDate = startOfDay(new Date());
let currentView = "week";
let selectedPetId = null; // null = all pets. Not persisted, so it resets on reload.

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function petById(id) {
  return state.pets.find(pet => pet.id === id);
}

function visiblePets() {
  const selected = selectedPetId && petById(selectedPetId);
  return selected ? [selected] : state.pets;
}

function setSelectedPet(id) {
  selectedPetId = id && id !== selectedPetId && petById(id) ? id : null;
  renderAll();
}

function formatSlot(time) {
  return formatTime(new Date(`2000-01-01T${time}`));
}

function countForPetOnDate(petId, date) {
  return state.entries.filter(entry => entry.petId === petId && entry.date === dateKey(date)).length;
}

// Actual entries and unfulfilled expected slots for the visible pets on one day.
function dayItems(dateStr) {
  const now = new Date();
  const actual = [], expected = [];
  visiblePets().forEach(pet => {
    const match = matchSchedule(pet, state.entries, dateStr, now);
    match.slots.forEach(slot => {
      if (slot.entry) actual.push({ pet, entry: slot.entry, forSlot: slot.time });
      else expected.push({ pet, time: slot.time, status: slot.status });
    });
    match.extras.forEach(entry => actual.push({ pet, entry, forSlot: null }));
  });
  return { actual, expected };
}

function renderPets() {
  const sidebar = document.getElementById("sidebarPets");
  sidebar.innerHTML = `<button class="sidebar-pet ${selectedPetId ? "" : "selected"}" data-filter-pet="" aria-pressed="${selectedPetId ? "false" : "true"}">All pets</button>` +
    state.pets.map(pet =>
      `<button class="sidebar-pet ${pet.id === selectedPetId ? "selected" : ""}" data-filter-pet="${pet.id}" aria-pressed="${pet.id === selectedPetId}"><span class="pet-dot" style="background:${pet.color}"></span>${escapeHtml(pet.name)}</button>`
    ).join("");

  const strip = document.getElementById("petStrip");
  strip.innerHTML = visiblePets().map(pet => {
    const count = countForPetOnDate(pet.id, currentDate);
    const goal = effectiveGoal(pet);
    const name = escapeHtml(pet.name);
    return `<article class="pet-card">
      <div class="pet-avatar" style="background:${pet.bg}">${pet.emoji}</div>
      <div class="pet-card-info"><h3>${name}</h3><p>${count} of ${goal} feedings today</p></div>
      <div class="counter">
        <button data-count-pet="${pet.id}" data-direction="-1" aria-label="Decrease ${name} feeding count">−</button>
        <span>${count}/${goal}</span>
        <button data-count-pet="${pet.id}" data-direction="1" aria-label="Increase ${name} feeding count">+</button>
      </div>
    </article>`;
  }).join("");
}

function renderEntryOptions() {
  const select = document.getElementById("entryPet");
  const previous = select.value;
  select.innerHTML = state.pets.map(pet =>
    `<option value="${pet.id}">${escapeHtml(pet.name)}</option>`
  ).join("");
  if (previous && petById(previous)) select.value = previous;
  renderEntrySlots();
}

function renderEntrySlots() {
  const pet = petById(document.getElementById("entryPet").value);
  const label = document.getElementById("entrySlotLabel");
  const select = document.getElementById("entrySlot");
  const schedule = pet ? pet.schedule : [];
  label.hidden = !schedule.length;
  select.disabled = !schedule.length;
  select.innerHTML = `<option value="">Not specific (auto-match)</option>` +
    schedule.map(time => `<option value="${time}">${formatSlot(time)}</option>`).join("");
}

function weekDates(date) {
  const day = date.getDay();
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function renderCalendar() {
  document.getElementById("calendarHeading").textContent = headingText();
  if (currentView === "week") renderWeek();
  if (currentView === "day") renderDay();
  if (currentView === "month") renderMonth();
  if (currentView === "year") renderYear();
}

function headingText() {
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  if (currentView === "day") return `${months[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`;
  if (currentView === "month") return `${months[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  if (currentView === "year") return String(currentDate.getFullYear());
  const dates = weekDates(currentDate);
  const first = dates[0], last = dates[6];
  if (first.getMonth() === last.getMonth()) return `${months[first.getMonth()]} ${first.getDate()} – ${last.getDate()}, ${last.getFullYear()}`;
  return `${months[first.getMonth()].slice(0,3)} ${first.getDate()} – ${months[last.getMonth()].slice(0,3)} ${last.getDate()}, ${last.getFullYear()}`;
}

function actualEventHtml(item, entryDate) {
  const note = item.forSlot ? ` · for ${formatSlot(item.forSlot)}` : "";
  return `<div class="feeding-event" style="background:${item.pet.bg};border-color:${item.pet.color}"><strong>${escapeHtml(item.pet.name)}</strong><span>${formatTime(new Date(`${entryDate}T${item.entry.time}`))}${note}</span></div>`;
}
function expectedEventHtml(item) {
  return `<div class="feeding-event expected ${item.status}" style="border-color:${item.pet.color}"><strong>${escapeHtml(item.pet.name)}</strong><span>${formatSlot(item.time)} · ${item.status}</span></div>`;
}

function renderWeek() {
  const dates = weekDates(currentDate);
  const dow = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  let html = `<div class="calendar-grid week-grid"><div></div>`;
  dates.forEach((date, i) => {
    html += `<div class="week-head ${dateKey(date) === dateKey(new Date()) ? "today" : ""}"><div><span>${dow[i]}</span><strong>${date.getDate()}</strong></div></div>`;
  });
  html += `</div><div class="calendar-grid week-grid">`;
  html += `<div class="time-gutter">${WEEK_ROW_HOURS.map(h => `<div class="time-slot">${h > 12 ? h - 12 : h}${h >= 12 ? " PM" : " AM"}</div>`).join("")}</div>`;
  dates.forEach(date => {
    const key = dateKey(date);
    const items = dayItems(key);
    html += `<div>`;
    WEEK_ROW_HOURS.forEach(hour => {
      const cell = [
        ...items.actual.filter(item => slotHour(item.entry.time) === hour).map(item => ({ time: item.entry.time, html: actualEventHtml(item, key) })),
        ...items.expected.filter(item => slotHour(item.time) === hour).map(item => ({ time: item.time, html: expectedEventHtml(item) }))
      ].sort((a, b) => a.time.localeCompare(b.time));
      html += `<div class="time-slot">${cell.map(item => item.html).join("")}</div>`;
    });
    html += `</div>`;
  });
  html += `</div>`;
  document.getElementById("calendar").innerHTML = html;
}

function renderDay() {
  const key = dateKey(currentDate);
  const items = dayItems(key);
  const rows = [
    ...items.actual.map(item => ({
      time: item.entry.time, pet: item.pet, ghost: false,
      tag: item.forSlot ? `<span class="status-tag done">done · for ${formatSlot(item.forSlot)}</span>` : ""
    })),
    ...items.expected.map(item => ({
      time: item.time, pet: item.pet, ghost: true,
      tag: `<span class="status-tag ${item.status}">expected · ${item.status}</span>`
    }))
  ].sort((a, b) => a.time.localeCompare(b.time));
  document.getElementById("calendar").innerHTML = `<div class="day-view"><div class="day-list">${rows.length ? rows.map(row =>
    `<div class="day-event ${row.ghost ? "expected" : ""}"><div class="day-event-time">${formatSlot(row.time)}</div><div class="day-event-bar" style="background:${row.pet.color}"></div><strong>${escapeHtml(row.pet.name)}</strong>${row.tag}</div>`
  ).join("") : '<p style="color:#9a9da5">No feedings logged for this day.</p>'}</div></div>`;
}

function renderMonth() {
  const year = currentDate.getFullYear(), month = currentDate.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  let html = '<div class="calendar-grid month-grid">';
  ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].forEach(day => html += `<div class="month-dow">${day}</div>`);
  for (let i = 0; i < 42; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const items = dayItems(dateKey(date));
    const minis = [
      ...items.actual.map(item => ({ time: item.entry.time, html: `<div class="mini-event" style="background:${item.pet.bg};color:${item.pet.color}">${escapeHtml(item.pet.name)}</div>` })),
      ...items.expected.map(item => ({ time: item.time, html: `<div class="mini-event expected ${item.status}" style="border-color:${item.pet.color};color:${item.pet.color}">${escapeHtml(item.pet.name)}</div>` }))
    ].sort((a, b) => a.time.localeCompare(b.time));
    html += `<div class="month-cell ${date.getMonth() !== month ? "outside" : ""} ${dateKey(date) === dateKey(new Date()) ? "today" : ""}">
      <span class="month-count">${date.getDate()}</span><div class="month-events">${minis.slice(0,3).map(item => item.html).join("")}</div></div>`;
  }
  html += "</div>";
  document.getElementById("calendar").innerHTML = html;
}

function renderYear() {
  const year = currentDate.getFullYear();
  let html = '<div class="year-grid">';
  const names = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const pets = visiblePets();
  const ids = new Set(pets.map(pet => pet.id));
  const hasSchedule = pets.some(pet => pet.schedule.length);
  const fed = new Set(state.entries.filter(entry => ids.has(entry.petId)).map(entry => entry.date));
  names.forEach((name, month) => {
    const days = new Date(year, month + 1, 0).getDate();
    let dots = "";
    for (let day = 1; day <= days; day++) {
      const date = new Date(year, month, day);
      const cls = fed.has(dateKey(date)) ? "has-feeding" : hasSchedule ? "has-expected" : "";
      dots += `<div class="year-dot ${cls}" title="${name} ${day}"></div>`;
    }
    html += `<div class="year-month"><h3>${name}</h3><div class="year-dots">${dots}</div></div>`;
  });
  html += "</div>";
  document.getElementById("calendar").innerHTML = html;
}

function changeDate(amount) {
  if (currentView === "day") currentDate.setDate(currentDate.getDate() + amount);
  if (currentView === "week") currentDate.setDate(currentDate.getDate() + amount * 7);
  if (currentView === "month") currentDate.setMonth(currentDate.getMonth() + amount);
  if (currentView === "year") currentDate.setFullYear(currentDate.getFullYear() + amount);
  renderAll();
}

function renderAnalytics() {
  const today = new Date();
  const pets = visiblePets();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today); date.setDate(today.getDate() - i);
    days.push(date);
  }
  const keys = days.map(dateKey);
  const countOn = (pet, key) => state.entries.filter(entry => entry.petId === pet.id && entry.date === key).length;
  const weekCounts = {};
  pets.forEach(pet => { weekCounts[pet.id] = keys.reduce((sum, key) => sum + countOn(pet, key), 0); });
  const stats = onTimeStats(pets, state.entries, keys, today);
  const rateText = rate => (rate === null ? "—" : `${rate}%`);

  document.getElementById("weekStat").textContent = pets.reduce((sum, pet) => sum + weekCounts[pet.id], 0);
  document.getElementById("rateStat").textContent = rateText(stats.total.rate);
  const totals = pets.map(pet => ({
    pet,
    count: state.entries.filter(entry => entry.petId === pet.id).length
  })).sort((a,b) => b.count - a.count);
  document.getElementById("activePetStat").textContent = totals[0]?.pet.name || "—";

  document.getElementById("barLegend").innerHTML = pets.map(pet =>
    `<span class="legend-item"><span class="pet-dot" style="background:${pet.color}"></span>${escapeHtml(pet.name)}</span>`
  ).join("");

  const chart = document.getElementById("barChart");
  chart.innerHTML = "";
  days.forEach((date, i) => {
    const segments = pets.map(pet => {
      const count = countOn(pet, keys[i]);
      return count ? `<div class="bar-segment" title="${escapeHtml(pet.name)}: ${count}" style="height:${count * 34}px;background:${pet.color}"></div>` : "";
    }).join("");
    chart.insertAdjacentHTML("beforeend", `<div class="bar-column"><div class="bar-stack">${segments || '<div class="bar-empty"></div>'}</div><span>${date.getMonth() + 1}/${date.getDate()}</span></div>`);
  });

  document.getElementById("petBreakdown").innerHTML = pets.map(pet => {
    const stat = stats.perPet[pet.id];
    return `<div class="breakdown-row"><span class="pet-dot" style="background:${pet.color}"></span><strong>${escapeHtml(pet.name)}</strong>
      <span>${weekCounts[pet.id]} feedings</span><span>On-time ${rateText(stat.rate)}</span><span>${stat.done} on time · ${stat.missed} missed</span></div>`;
  }).join("");
}

function emojiOptions(selected) {
  const list = PET_EMOJIS.includes(selected) ? PET_EMOJIS : [selected, ...PET_EMOJIS];
  return list.map(emoji => `<option value="${escapeHtml(emoji)}"${emoji === selected ? " selected" : ""}>${escapeHtml(emoji)}</option>`).join("");
}

// Pet Configuration edits a draft copy. Nothing reaches `state` or localStorage until Save.
let draftPets = null;
let settingsDirty = false;

function draftById(id) {
  return draftPets.find(pet => pet.id === id);
}

function openSettings() {
  draftPets = state.pets.map(pet => ({ ...pet, schedule: [...pet.schedule] }));
  settingsDirty = false;
  renderSettings();
  updateSaveState();
  document.getElementById("settingsModal").hidden = false;
}

function updateSaveState() {
  document.getElementById("saveSettings").disabled = !settingsDirty;
  const status = document.getElementById("settingsStatus");
  status.textContent = settingsDirty ? "Unsaved changes" : "No changes";
  status.classList.toggle("dirty", settingsDirty);
}

function markDirty() {
  settingsDirty = true;
  updateSaveState();
}

function closeSettings() {
  if (settingsDirty && !confirm("Discard your unsaved changes?")) return;
  draftPets = null;
  settingsDirty = false;
  document.getElementById("settingsModal").hidden = true;
}

function saveSettings() {
  if (!draftPets || !settingsDirty) return;
  const originalName = id => (petById(id) || {}).name;
  const pets = draftPets.map(pet => normalizePet({ ...pet, name: pet.name.trim() || originalName(pet.id) || "Pet" }));
  const keptIds = new Set(pets.map(pet => pet.id));
  state.entries = state.entries.filter(entry => keptIds.has(entry.petId));
  state.pets = pets;
  if (selectedPetId && !keptIds.has(selectedPetId)) selectedPetId = null;
  saveState();
  draftPets = null;
  settingsDirty = false;
  document.getElementById("settingsModal").hidden = true;
  renderAll();
}

function scheduleChips(pet) {
  return pet.schedule.map(time =>
    `<span class="time-chip">${formatSlot(time)}<button data-remove-time="${pet.id}" data-time="${time}" aria-label="Remove ${formatSlot(time)} feeding time" title="Remove ${formatSlot(time)}">×</button></span>`
  ).join("");
}

function renderSettings() {
  document.getElementById("petSettings").innerHTML = draftPets.map(pet => {
    const scheduled = pet.schedule.length > 0;
    const name = escapeHtml(pet.name);
    return `<div class="pet-setting"><span class="pet-dot" style="background:${pet.color}"></span>
      <select class="emoji-select" data-emoji="${pet.id}" aria-label="${name} icon">${emojiOptions(pet.emoji)}</select>
      <input type="text" class="pet-name-input" value="${name}" data-name="${pet.id}" aria-label="${name} name" maxlength="40">
      <input type="number" min="1" max="12" value="${effectiveGoal(pet)}" data-goal="${pet.id}" aria-label="${name} feedings per day" ${scheduled ? 'disabled title="Set by schedule"' : ""}>
      <button class="remove-pet" data-remove-pet="${pet.id}" ${draftPets.length === 1 ? "disabled" : ""}>Remove</button>
      <div class="schedule-row"><span class="schedule-label">Expected feeding schedule${scheduled ? " · feedings per day set by schedule" : ""}</span>
        ${scheduleChips(pet)}
        <span class="schedule-add"><input type="time" data-new-time="${pet.id}" aria-label="New feeding time"><button type="button" class="secondary-button small" data-add-time="${pet.id}">Add time</button></span>
      </div></div>`;
  }).join("");
}

function renderAll() {
  if (selectedPetId && !petById(selectedPetId)) selectedPetId = null;
  renderPets();
  renderCalendar();
  renderAnalytics();
  renderEntryOptions();
  document.getElementById("todayLabel").textContent = new Date().toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" });
}

function init() {
  document.querySelectorAll(".nav-item").forEach(button => button.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    const page = button.dataset.page;
    document.querySelectorAll(".page").forEach(section => section.classList.remove("active"));
    document.getElementById(page === "calendar" ? "calendarPage" : "analyticsPage").classList.add("active");
    document.getElementById("pageTitle").textContent = page === "calendar" ? "Feeding schedule" : "Analytics";
    document.getElementById("addEntry").style.display = page === "calendar" ? "block" : "none";
  }));

  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => {
    document.querySelectorAll("[data-view]").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    currentView = button.dataset.view;
    renderAll();
  }));

  document.getElementById("prevDate").addEventListener("click", () => changeDate(-1));
  document.getElementById("nextDate").addEventListener("click", () => changeDate(1));
  document.getElementById("goToday").addEventListener("click", () => { currentDate = startOfDay(new Date()); renderAll(); });

  document.addEventListener("click", event => {
    const countButton = event.target.closest("[data-count-pet]");
    if (countButton) {
      const petId = countButton.dataset.countPet;
      const direction = Number(countButton.dataset.direction);
      const date = dateKey(currentDate);
      if (direction > 0) {
        state.entries.push({ id: crypto.randomUUID(), petId, date, time: new Date().toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" }) });
      } else {
        const entry = [...state.entries].reverse().find(item => item.petId === petId && item.date === date);
        if (entry) state.entries = state.entries.filter(item => item.id !== entry.id);
      }
      saveState(); renderAll();
    }
    const filterButton = event.target.closest("[data-filter-pet]");
    if (filterButton) setSelectedPet(filterButton.dataset.filterPet);
    const close = event.target.closest("[data-close]");
    if (close) {
      if (close.dataset.close === "settingsModal") closeSettings();
      else document.getElementById(close.dataset.close).hidden = true;
    }
  });

  document.getElementById("addEntry").addEventListener("click", () => {
    document.getElementById("entryDate").value = dateKey(currentDate);
    document.getElementById("entryTime").value = new Date().toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" });
    if (selectedPetId && petById(selectedPetId)) document.getElementById("entryPet").value = selectedPetId;
    renderEntrySlots();
    document.getElementById("entryModal").hidden = false;
  });
  document.getElementById("openSettings").addEventListener("click", openSettings);
  document.getElementById("saveSettings").addEventListener("click", saveSettings);

  document.getElementById("entryPet").addEventListener("change", renderEntrySlots);
  document.getElementById("entrySlot").addEventListener("change", event => {
    if (event.target.value) document.getElementById("entryTime").value = event.target.value;
  });
  document.getElementById("entryForm").addEventListener("submit", event => {
    event.preventDefault();
    state.entries.push({
      id: crypto.randomUUID(),
      petId: document.getElementById("entryPet").value,
      date: document.getElementById("entryDate").value,
      time: document.getElementById("entryTime").value
    });
    saveState();
    document.getElementById("entryModal").hidden = true;
    renderAll();
  });

  document.getElementById("petSettings").addEventListener("input", event => {
    const nameInput = event.target.closest("[data-name]");
    if (!nameInput) return;
    const pet = draftById(nameInput.dataset.name);
    if (pet) { pet.name = nameInput.value; markDirty(); }
  });
  document.getElementById("petSettings").addEventListener("change", event => {
    const nameInput = event.target.closest("[data-name]");
    if (nameInput) {
      const pet = draftById(nameInput.dataset.name);
      if (!pet) return;
      const name = nameInput.value.trim();
      if (!name) {
        // Empty names are not allowed: restore the last saved name, or a default for a new pet.
        const saved = petById(pet.id);
        pet.name = saved ? saved.name : "New pet";
        nameInput.value = pet.name;
      } else {
        pet.name = name;
        nameInput.value = name;
      }
      nameInput.setAttribute("aria-label", `${pet.name} name`);
      markDirty();
      return;
    }
    const emojiSelect = event.target.closest("[data-emoji]");
    if (emojiSelect) {
      const pet = draftById(emojiSelect.dataset.emoji);
      if (pet) { pet.emoji = emojiSelect.value; markDirty(); }
      return;
    }
    const input = event.target.closest("[data-goal]");
    if (input) {
      const pet = draftById(input.dataset.goal);
      if (pet) { pet.goal = Math.max(1, Number(input.value) || 1); markDirty(); }
    }
  });
  document.getElementById("petSettings").addEventListener("click", event => {
    const addTime = event.target.closest("[data-add-time]");
    if (addTime) {
      const pet = draftById(addTime.dataset.addTime);
      const value = addTime.parentElement.querySelector("input").value;
      if (!pet || !isValidTime(value) || pet.schedule.includes(value)) return;
      pet.schedule = [...pet.schedule, value].sort();
      pet.goal = pet.schedule.length;
      markDirty(); renderSettings();
      return;
    }
    const removeTime = event.target.closest("[data-remove-time]");
    if (removeTime) {
      const pet = draftById(removeTime.dataset.removeTime);
      if (!pet) return;
      pet.schedule = pet.schedule.filter(time => time !== removeTime.dataset.time);
      if (pet.schedule.length) pet.goal = pet.schedule.length;
      markDirty(); renderSettings();
      return;
    }
    const button = event.target.closest("[data-remove-pet]");
    if (button) {
      const pet = draftById(button.dataset.removePet);
      if (!pet || draftPets.length === 1) return;
      const hasEntries = state.entries.some(entry => entry.petId === pet.id);
      if (hasEntries && !confirm(`Remove ${pet.name} and all of their logged feedings when you save?`)) return;
      draftPets = draftPets.filter(item => item.id !== pet.id);
      markDirty(); renderSettings();
    }
  });
  document.getElementById("petForm").addEventListener("submit", event => {
    event.preventDefault();
    const name = document.getElementById("petName").value.trim();
    if (!name) return;
    draftPets.push({
      id: crypto.randomUUID(), name, goal: Number(document.getElementById("petFeedings").value), schedule: [],
      color: ["#e98569","#9c86bd","#70a78a","#e9bb72","#6e9bd1"][draftPets.length % 5],
      bg: ["#fde9df","#eee7f4","#dfece5","#faf0dc","#e6edf7"][draftPets.length % 5],
      emoji: document.getElementById("petEmoji").value
    });
    document.getElementById("petName").value = "";
    markDirty(); renderSettings();
  });
  document.getElementById("petEmoji").innerHTML = emojiOptions("🐾");
  renderAll();
}

if (typeof document !== "undefined") init();

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    escapeHtml, isValidTime, toMinutes, normalizePet, normalizeState, effectiveGoal,
    slotHour, matchSchedule, onTimeStats, TOLERANCE_MIN
  };
}
