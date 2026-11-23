# Pawday pet feeding tracker

A dependency-free website for tracking your pets' feeding schedules.

## Run locally

```bash
npm start
```

Then open `http://localhost:4173`.

## Features

- Daily, weekly, monthly, and yearly calendar views
- Pet Configuration: add pets, rename them in place (entries stay attached) and set daily feeding targets
- Click a pet in the sidebar to filter the pet cards, calendar and analytics to that pet; click it again (or "All pets") to clear
- Expected feeding schedule per pet, shown as dashed events on the calendar with pending, done or missed status
- Feeding counters and entry logging, with an optional "fulfils expected time" picker
- Weekly analytics stratified by pet, with a stacked 7-day chart and a real on-time rate

- "How to Use" button starts a guided tour that walks through every part of the app (switching pages and opening Pet Configuration as it goes) and restores your view afterwards without changing any data
## How the schedule works

- A logged feeding counts for an expected time if it is within 60 minutes of it (nearest first, one feeding per slot).
- A slot is "missed" once 60 minutes have passed without a match. Future slots stay pending.
- When a pet has a schedule, its daily feeding goal follows the number of scheduled times. Without a schedule the goal input is used.
- The on-time rate shows "—" when there is no schedule or nothing has come due yet.
- The pet filter is not saved; it resets to all pets on reload.