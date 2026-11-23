// Guided "How to Use" tour. It only drives the UI (page, view, modals) and restores it afterwards.
// It never writes to localStorage and never changes pets or entries.
const TOUR_STEPS = [
  { title: "Welcome to Pawday", text: "This quick tour shows every part of the app. Use Next and Back, the arrow keys, or press Esc to leave at any time. Nothing you see here changes your data." },
  { target: ".nav", page: "calendar", title: "Pages", text: "Switch between the Calendar, where you log and plan feedings, and Analytics, where you see how things are going." },
  { target: "#sidebarPets", page: "calendar", title: "Filter by pet", text: "Click a pet's name to show only that pet on the cards, calendar and analytics. Click it again, or choose All pets, to see everyone." },
  { target: "#petStrip", page: "calendar", title: "Pet cards and counters", text: "Each card shows today's progress for one pet. Use + to log a feeding right now and − to remove the latest one for the date you are viewing." },
  { target: "#addEntry", page: "calendar", title: "Add feeding", text: "Log a feeding for any pet, date and time, for example to record one you forgot earlier." },
  { target: "#entryForm", page: "calendar", modal: "entry", title: "The feeding form", text: "Pick the pet, date and time. If the pet has an expected feeding schedule, an optional picker lets you say which expected time this feeding fulfils." },
  { target: "#viewTabs", page: "calendar", title: "Day, Week, Month and Year", text: "Choose how much of the calendar to see. Day and Week show times, Month and Year give the big picture." },
  { target: ".date-controls", page: "calendar", title: "Moving through time", text: "Use the arrows to step back and forward by a day, week, month or year. Today jumps back to the current date." },
  { target: "#calendar", page: "calendar", view: "week", title: "Expected and actual feedings", text: "Solid events are feedings you logged. Dashed events are expected feedings from the schedule: pending is still to come, done was matched by a logged feeding, and missed passed without one." },
  { target: ".analytics-grid", page: "analytics", title: "Analytics at a glance", text: "See feedings this week, your on-time rate against the expected schedule, and the most active pet. Pick a pet in the sidebar to focus on one." },
  { target: ".chart-card", page: "analytics", title: "Last 7 days", text: "A stacked chart of feedings per day, labelled by date (like 11/21) and coloured by pet." },
  { target: "#petBreakdown", page: "analytics", title: "Breakdown by pet", text: "Each pet's totals and on-time performance, side by side." },
  { target: "#openSettings", page: "calendar", title: "Pet Configuration", text: "Open this to manage your pets: names, icons, daily goals and expected feeding schedules." },
  { target: ".pet-setting", page: "calendar", modal: "settings", title: "Edit names and icons", text: "Type in a pet's name to rename it and choose an icon from the list. Renaming keeps all its logged feedings. You can also set the daily goal." },
  { target: ".pet-setting .schedule-row", page: "calendar", modal: "settings", title: "Expected feeding schedule", text: "Add the times you plan to feed. They appear as dashed events on the calendar and drive the on-time rate. With a schedule, the daily goal follows the number of times." },
  { target: "#petForm", page: "calendar", modal: "settings", title: "Add or remove pets", text: "Add a new pet here with a name, icon and daily goal. Use Remove on a pet row to delete it and its feedings." },
  { target: ".settings-footer", page: "calendar", modal: "settings", title: "Save your changes", text: "Edits here are a draft. They only stick once you click Save changes, and Cancel discards them." },
  { title: "You're all set", text: "Your data is stored locally in this browser, so it stays on this device. Start the tour again any time with How to Use." }
];

function startTour() {
  if (document.getElementById("tourRoot")) return;
  const $ = id => document.getElementById(id);
  const activeNav = document.querySelector(".nav-item.active");
  const saved = {
    page: activeNav ? activeNav.dataset.page : "calendar",
    view: currentView,
    filter: selectedPetId,
    date: new Date(currentDate),
    focus: document.activeElement
  };
  const root = document.createElement("div");
  root.id = "tourRoot";
  root.innerHTML = `<div class="tour-shield"></div><div class="tour-spot" hidden></div>
    <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tourTitle" aria-describedby="tourText" tabindex="-1">
      <div aria-live="polite"><div class="tour-count" id="tourCount"></div><h2 id="tourTitle"></h2><p id="tourText"></p></div>
      <div class="tour-actions"><button type="button" class="tour-skip" id="tourSkip">Skip</button><button type="button" class="secondary-button" id="tourBack">Back</button><button type="button" class="primary-button" id="tourNext">Next</button></div>
    </div>`;
  document.body.appendChild(root);
  const shield = root.querySelector(".tour-shield");
  const spot = root.querySelector(".tour-spot");
  const card = root.querySelector(".tour-card");
  let index = 0;
  let target = null;

  const closeModals = keep => {
    if (keep !== "settings" && !$("settingsModal").hidden) closeSettings(); // never dirty during the tour
    if (keep !== "entry") $("entryModal").hidden = true;
  };
  function scroller(el) {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const oy = getComputedStyle(p).overflowY;
      if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight) return p;
    }
    return document.scrollingElement;
  }
  function place(retry) {
    const margin = 12, pad = 6, gap = 14;
    const vw = window.innerWidth, vh = window.innerHeight;
    card.classList.remove("docked");
    card.style.width = "";
    let r = target ? target.getBoundingClientRect() : null;
    if (!r) {
      spot.hidden = true;
      shield.classList.add("dim");
      card.style.left = Math.max(margin, (vw - card.offsetWidth) / 2) + "px";
      card.style.top = Math.max(margin, (vh - card.offsetHeight) / 2) + "px";
      return;
    }
    shield.classList.remove("dim");
    let top = Math.max(0, r.top - pad), left = Math.max(0, r.left - pad);
    let bottom = Math.min(vh, r.bottom + pad), right = Math.min(vw, r.right + pad);
    let cw = card.offsetWidth, ch = card.offsetHeight;
    const fits = {
      right: vw - right - gap - margin >= cw && vh - 2 * margin >= ch,
      left: left - gap - margin >= cw && vh - 2 * margin >= ch,
      below: vh - bottom - gap - margin >= ch,
      above: top - gap - margin >= ch
    };
    const side = ["below", "right", "above", "left"].find(s => fits[s]);
    let x, y;
    if (side === "right") { x = right + gap; y = top; }
    else if (side === "left") { x = left - gap - cw; y = top; }
    else if (side === "below") { x = left; y = bottom + gap; }
    else if (side === "above") { x = left; y = top - gap - ch; }
    else {
      // No free side: dock a compact full-width sheet at the bottom and keep the target above it.
      card.classList.add("docked");
      card.style.width = vw - 2 * margin + "px";
      ch = card.offsetHeight;
      const limit = vh - margin - ch - gap; // lowest y the target may reach
      const excess = r.bottom + pad - limit;
      if (excess > 0 && !retry) {
        const sc = scroller(target), before = sc.scrollTop;
        sc.scrollTop = before + Math.min(excess, Math.max(0, r.top - pad));
        if (sc.scrollTop !== before) return place(true);
      }
      bottom = Math.min(bottom, limit); // spotlight only the part visible above the sheet
      top = Math.min(top, bottom);
      x = margin; y = vh - ch - margin; cw = vw - 2 * margin;
    }
    spot.hidden = false;
    Object.assign(spot.style, { top: top + "px", left: left + "px", width: right - left + "px", height: bottom - top + "px" });
    card.style.left = Math.min(Math.max(margin, x), vw - cw - margin) + "px";
    card.style.top = Math.min(Math.max(margin, y), vh - ch - margin) + "px";
  }
  const onMove = () => place();
  function show(i) {
    index = Math.min(Math.max(i, 0), TOUR_STEPS.length - 1);
    const step = TOUR_STEPS[index];
    closeModals(step.modal);
    if (step.page) {
      const active = document.querySelector(".nav-item.active");
      if (!active || active.dataset.page !== step.page) document.querySelector(`.nav-item[data-page="${step.page}"]`).click();
    }
    if (step.view && currentView !== step.view) document.querySelector(`[data-view="${step.view}"]`).click();
    if (step.modal === "settings" && $("settingsModal").hidden) openSettings();
    if (step.modal === "entry" && $("entryModal").hidden) $("addEntry").click();
    target = step.target ? document.querySelector(step.target) : null;
    if (target && (!target.getClientRects().length || target.offsetWidth === 0 || target.offsetHeight === 0)) target = null;
    if (target) target.scrollIntoView({ block: "center", inline: "nearest" });
    $("tourCount").textContent = `Step ${index + 1} of ${TOUR_STEPS.length}`;
    $("tourTitle").textContent = step.title;
    $("tourText").textContent = step.text;
    $("tourBack").hidden = index === 0;
    $("tourNext").textContent = index === TOUR_STEPS.length - 1 ? "Done" : "Next";
    $("tourSkip").hidden = index === TOUR_STEPS.length - 1;
    place();
    card.focus();
  }
  function end() {
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", onMove);
    window.removeEventListener("scroll", onMove, true);
    closeModals(null);
    root.remove();
    const nav = document.querySelector(".nav-item.active");
    if (!nav || nav.dataset.page !== saved.page) document.querySelector(`.nav-item[data-page="${saved.page}"]`).click();
    if (currentView !== saved.view) document.querySelector(`[data-view="${saved.view}"]`).click();
    currentDate = saved.date;
    selectedPetId = saved.filter;
    renderAll();
    if (saved.focus && saved.focus.focus) saved.focus.focus();
  }
  const next = () => (index === TOUR_STEPS.length - 1 ? end() : show(index + 1));
  const back = () => show(index - 1);
  function onKey(event) {
    if (event.key === "Escape") { event.preventDefault(); end(); }
    else if (event.key === "ArrowRight") { event.preventDefault(); next(); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); back(); }
    else if (event.key === "Enter" && !(event.target.closest && event.target.closest("button"))) { event.preventDefault(); next(); }
    else if (event.key === "Tab") {
      event.preventDefault();
      const items = [...card.querySelectorAll("button")].filter(b => !b.hidden);
      const at = items.indexOf(document.activeElement);
      const step = event.shiftKey ? -1 : 1;
      items[(at + step + items.length) % items.length].focus();
    }
  }
  $("tourNext").addEventListener("click", next);
  $("tourBack").addEventListener("click", back);
  $("tourSkip").addEventListener("click", end);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", onMove);
  window.addEventListener("scroll", onMove, true);
  show(0);
}

if (typeof document !== "undefined") document.getElementById("howToUse").addEventListener("click", startTour);
if (typeof module !== "undefined" && module.exports) module.exports = { TOUR_STEPS };
