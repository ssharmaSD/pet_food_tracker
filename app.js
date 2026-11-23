const STORAGE_KEY = "pawday-data-v1";

const defaultPets = [
  { id: "milo", name: "Milo", goal: 3, color: "#e98569", bg: "#f5dfc9", emoji: "🐶" },
  { id: "luna", name: "Luna", goal: 2, color: "#9c86bd", bg: "#eee7f4", emoji: "🐱" },
  { id: "coco", name: "Coco", goal: 2, color: "#70a78a", bg: "#dfece5", emoji: "🐇" }
];

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
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.pets)) return saved;
  } catch (_) {}
  const today = dateKey(new Date());
  return {
    pets: defaultPets,
    entries: [
      { id: "1", petId: "milo", date: today, time: "07:30" },
      { id: "2", petId: "milo", date: today, time: "12:30" },
      { id: "3", petId: "luna", date: today, time: "08:00" },
      { id: "4", petId: "coco", date: today, time: "09:15" }
    ]
  };
}

let state = loadState();
let currentDate = startOfDay(new Date());
let currentView = "week";

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function petById(id) {
  return state.pets.find(pet => pet.id === id);
}

function countForPetOnDate(petId, date) {
  return state.entries.filter(entry => entry.petId === petId && entry.date === dateKey(date)).length;
}

function renderPets() {
  const sidebar = document.getElementById("sidebarPets");
  sidebar.innerHTML = state.pets.map(pet =>
    `<div class="sidebar-pet"><span class="pet-dot" style="background:${pet.color}"></span>${pet.name}</div>`
  ).join("");

  const strip = document.getElementById("petStrip");
  strip.innerHTML = state.pets.map(pet => {
    const count = countForPetOnDate(pet.id, currentDate);
    return `<article class="pet-card">
      <div class="pet-avatar" style="background:${pet.bg}">${pet.emoji}</div>
      <div class="pet-card-info"><h3>${pet.name}</h3><p>${count} of ${pet.goal} feedings today</p></div>
      <div class="counter">
        <button data-count-pet="${pet.id}" data-direction="-1" aria-label="Decrease ${pet.name} feeding count">−</button>
        <span>${count}/${pet.goal}</span>
        <button data-count-pet="${pet.id}" data-direction="1" aria-label="Increase ${pet.name} feeding count">+</button>
      </div>
    </article>`;
  }).join("");
}

function renderEntryOptions() {
  document.getElementById("entryPet").innerHTML = state.pets.map(pet =>
    `<option value="${pet.id}">${pet.name}</option>`
  ).join("");
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

function renderWeek() {
  const dates = weekDates(currentDate);
  const dow = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  let html = `<div class="calendar-grid week-grid"><div></div>`;
  dates.forEach((date, i) => {
    html += `<div class="week-head ${dateKey(date) === dateKey(new Date()) ? "today" : ""}"><div><span>${dow[i]}</span><strong>${date.getDate()}</strong></div></div>`;
  });
  html += `</div><div class="calendar-grid week-grid">`;
  html += `<div class="time-gutter">${[7,9,11,13,15,17].map(h => `<div class="time-slot">${h > 12 ? h - 12 : h}${h >= 12 ? " PM" : " AM"}</div>`).join("")}</div>`;
  dates.forEach(date => {
    html += `<div>`;
    [7,9,11,13,15,17].forEach(hour => {
      const entries = state.entries.filter(entry => entry.date === dateKey(date) && Number(entry.time.split(":")[0]) === hour);
      html += `<div class="time-slot">${entries.map(entry => {
        const pet = petById(entry.petId);
        if (!pet) return "";
        return `<div class="feeding-event" style="background:${pet.bg};border-color:${pet.color}"><strong>${pet.name}</strong><span>${formatTime(new Date(`${entry.date}T${entry.time}`))}</span></div>`;
      }).join("")}</div>`;
    });
    html += `</div>`;
  });
  html += `</div>`;
  document.getElementById("calendar").innerHTML = html;
}

function renderDay() {
  const entries = state.entries.filter(entry => entry.date === dateKey(currentDate)).sort((a,b) => a.time.localeCompare(b.time));
  document.getElementById("calendar").innerHTML = `<div class="day-view"><div class="day-list">${entries.length ? entries.map(entry => {
    const pet = petById(entry.petId);
    if (!pet) return "";
    return `<div class="day-event"><div class="day-event-time">${formatTime(new Date(`${entry.date}T${entry.time}`))}</div><div class="day-event-bar" style="background:${pet.color}"></div><strong>${pet.name}</strong></div>`;
  }).join("") : '<p style="color:#9a9da5">No feedings logged for this day.</p>'}</div></div>`;
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
    const entries = state.entries.filter(entry => entry.date === dateKey(date));
    html += `<div class="month-cell ${date.getMonth() !== month ? "outside" : ""} ${dateKey(date) === dateKey(new Date()) ? "today" : ""}">
      <span class="month-count">${date.getDate()}</span><div class="month-events">${entries.slice(0,3).map(entry => {
        const pet = petById(entry.petId);
        return pet ? `<div class="mini-event" style="background:${pet.bg};color:${pet.color}">${pet.name}</div>` : "";
      }).join("")}</div></div>`;
  }
  html += "</div>";
  document.getElementById("calendar").innerHTML = html;
}

function renderYear() {
  const year = currentDate.getFullYear();
  let html = '<div class="year-grid">';
  const names = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  names.forEach((name, month) => {
    const days = new Date(year, month + 1, 0).getDate();
    let dots = "";
    for (let day = 1; day <= days; day++) {
      const date = new Date(year, month, day);
      dots += `<div class="year-dot ${state.entries.some(entry => entry.date === dateKey(date)) ? "has-feeding" : ""}" title="${name} ${day}"></div>`;
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
  let total = 0;
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today); date.setDate(today.getDate() - i);
    total += state.entries.filter(entry => entry.date === dateKey(date)).length;
  }
  document.getElementById("weekStat").textContent = total;
  document.getElementById("rateStat").textContent = "100%";
  const totals = state.pets.map(pet => ({
    pet,
    count: state.entries.filter(entry => entry.petId === pet.id).length
  })).sort((a,b) => b.count - a.count);
  document.getElementById("activePetStat").textContent = totals[0]?.pet.name || "—";

  const chart = document.getElementById("barChart");
  chart.innerHTML = "";
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today); date.setDate(today.getDate() - i);
    const count = state.entries.filter(entry => entry.date === dateKey(date)).length;
    const height = Math.max(8, count * 34);
    chart.insertAdjacentHTML("beforeend", `<div class="bar-column"><div class="bar" style="height:${height}px"></div><span>${date.toLocaleDateString([], { weekday:"short" })}</span></div>`);
  }
}

function renderSettings() {
  document.getElementById("petSettings").innerHTML = state.pets.map(pet =>
    `<div class="pet-setting"><span class="pet-dot" style="background:${pet.color}"></span><strong>${pet.name}</strong>
      <input type="number" min="1" max="12" value="${pet.goal}" data-goal="${pet.id}" aria-label="${pet.name} feedings per day">
      <button class="remove-pet" data-remove-pet="${pet.id}" ${state.pets.length === 1 ? "disabled" : ""}>Remove</button></div>`
  ).join("");
}

function renderAll() {
  renderPets();
  renderCalendar();
  renderAnalytics();
  renderEntryOptions();
  document.getElementById("todayLabel").textContent = new Date().toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" });
}

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
  const close = event.target.closest("[data-close]");
  if (close) document.getElementById(close.dataset.close).hidden = true;
});

document.getElementById("addEntry").addEventListener("click", () => {
  document.getElementById("entryDate").value = dateKey(currentDate);
  document.getElementById("entryTime").value = new Date().toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" });
  document.getElementById("entryModal").hidden = false;
});
document.getElementById("openSettings").addEventListener("click", () => {
  renderSettings();
  document.getElementById("settingsModal").hidden = false;
});

document.getElementById("entryForm").addEventListener("submit", event => {
  event.preventEvent?.();
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

document.getElementById("petSettings").addEventListener("change", event => {
  const input = event.target.closest("[data-goal]");
  if (input) {
    const pet = petById(input.dataset.goal);
    if (pet) pet.goal = Math.max(1, Number(input.value) || 1);
    saveState(); renderAll();
  }
});
document.getElementById("petSettings").addEventListener("click", event => {
  const button = event.target.closest("[data-remove-pet]");
  if (button) {
    state.pets = state.pets.filter(pet => pet.id !== button.dataset.removePet);
    state.entries = state.entries.filter(entry => entry.petId !== button.dataset.removePet);
    saveState(); renderSettings(); renderAll();
  }
});
document.getElementById("petForm").addEventListener("submit", event => {
  event.preventDefault();
  const name = document.getElementById("petName").value.trim();
  if (!name) return;
  state.pets.push({
    id: crypto.randomUUID(), name, goal: Number(document.getElementById("petFeedings").value),
    color: ["#e98569","#9c86bd","#70a78a","#e9bb72","#6e9bd1"][state.pets.length % 5],
    bg: ["#fde9df","#eee7f4","#dfece5","#faf0dc","#e6edf7"][state.pets.length % 5], emoji: "🐾"
  });
  document.getElementById("petName").value = "";
  saveState(); renderSettings(); renderAll();
});

renderAll();
