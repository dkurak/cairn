# Cairn - site map and components

> **Keep this current.** Any change to a route, a tile on a screen, a shared component, the nav, a coach tool,
> an API route or a database migration updates this file in the same change. Add a line to the
> [Changelog](#9-changelog) at the bottom. (The rule is also in `CLAUDE.md`, so cloud sessions follow it too.)

As of 2026-11-28, code at `c1f927e`, migrations 0001-0007.

---

## 1. Site map

```mermaid
flowchart TD
  login["/login<br/>email + password, or email link"] --> shell
  cb["/auth/callback"] -.-> shell

  subgraph shell["App shell (every screen)"]
    top["Top bar: menu, title, At home / Traveling, avatar"]
    nav["Phone: 6 bottom tabs<br/>Laptop: slide-out menu"]
    coach["Coach pane (right, global)"]
    sheets["Sheets: Log, Travel"]
  end

  shell --> today["Today /"]
  shell --> day["Any day /day/[date]"]
  shell --> plan["Plan /plan"]
  shell --> body["Body /body"]
  shell --> history["History /history"]
  shell --> library["Library /library"]
  top --> account["Account /account"]

  today -. same layout .- day
  plan -->|"Upcoming | Past"| plan
  coach --> chat["/api/chat"]
  library --> garmin["/api/garmin (.fit / zip)"]
  today --> recap["/api/recap"]
```

## 2. Frame and navigation

| Piece | Where | Notes |
|---|---|---|
| Top bar | `Shell.tsx` | menu button (laptop only), "Cairn", At home / Traveling switch, avatar to `/account` |
| Bottom tabs (phone) | `Shell.tsx` | Today, Coach (opens the pane), Body, Plan, History, Library |
| Slide-out menu (laptop) | `Shell.tsx` | pushes the page right, stays open while navigating, remembered in `localStorage` (`cairn.menu`) |
| Coach pane | `CoachDrawer.tsx` + `Chat.tsx` | right side, pushes the page left; stays mounted so the chat keeps its state; Esc closes |
| Log sheet | `LogSheet.tsx` (opened by `openLog`) | workout(s), date, vert, pain, feel, notes; also used for rest days and back-dated entries |
| Travel sheet | `TravelSheet.tsx` (opened by `openTravel`) | gear (gym / bodyweight), jogging, return date; sends the answers to the coach |
| App state | `AppProvider.tsx` (`useApp()`) | `data`, `sb`, `uid`, `today`, `status`, `run`, `openLog`, `openTravel`, `saveProposal`, `askCoach`, `coachOpen`, `outbox` |

Auth: `src/proxy.ts` sends signed-out visitors to `/login`; `(app)/layout.tsx` loads everything once (`loadAll`) and hands it to `AppProvider`.

## 3. Screens and their tiles

### Today `/` and any day `/day/[date]` (one component: `DayView.tsx`)
Same layout for past, today and future; only the contents change. Future days grey out the check-in.

| Tile | Component | Shown |
|---|---|---|
| Header: ‹ day ›, Back to today, Ask coach | `DayView` | always |
| Day strip (7 tiles; rest = dashed grey, tour = accent, selected = filled) | `DayView` | always |
| Up next (calm-down / plan item / no plan / week done) | `DayView` | today |
| Done card (what was logged, rundown) | `DayView` | past days |
| Planned card (disabled Done / Skip, rundown) | `DayView` | future days |
| Program week banner ("Build this week") | `ProgramWeekBanner` in `Programs.tsx` | today |
| Tour green light | `DayView` + `rules.greenLight` | today, only when a tour is close |
| After-tour check-in banner | `DayView` | morning after a tour |
| Quick check-in (overall feel + one tap per pain area, exact 0-10, add area) | `QuickCheck.tsx` | all days (disabled in the future) |
| AI recap with next steps | `Recap.tsx` -> `/api/recap` | today |
| Log something else (tour / workout / rest) | `DayView` | today |
| Notes (that day's entries, editable) | `RecentList.tsx` | other days |

### Plan `/plan` (Upcoming | Past)
| Tile | Component | Notes |
|---|---|---|
| Program week banner | `ProgramWeekBanner` | |
| Programs (active program, phase bar, Check in / Pause / This week, saved bank) | `Programs.tsx`, `PhaseBar.tsx` | phases are not yet clickable |
| Goals | `plan/page.tsx` | text the coach keeps (`profiles.goals`) |
| This week / Travel set (checklist, tap a number to mark done) | `plan/page.tsx` | |
| Next-tour banner | `plan/page.tsx` | always findable here |
| Where are you training? (trip details, edit, start over) | `plan/page.tsx` | |
| Hip flared? / Calm-down | `plan/page.tsx` | hip-specific (see backlog) |
| Log something else | `plan/page.tsx` | copy of the Today block |
| **Past:** full log, day-grouped, editable | `RecentList.tsx` | up to 400 days |

### Body `/body`
Pain check per area (0-10, trend, "mostly better" to stop tracking) - `PainCard.tsx` + `PainChart.tsx`; Recent notes; How you've felt; Resolved areas (track again).

### History `/history` (range: 4 weeks default, Quarter, Year, Max; starts at the first tracked day)
Four KPI tiles (`StatTile`: sessions, active days, green-zone %, tour vert or streak) - Sessions per week (`WeeklyBars`) - What you trained (`MixBars`) - Pain: sessions vs daily checks (`PainTrend`) - Activity heatmap (`Heatmap`) - Body areas with sparklines (`Spark`) - Tours table - Log (`RecentList`). Charts and tooltips: `charts/Charts.tsx`, `charts/Tip.tsx`; numbers: `lib/stats.ts`.

### Library `/library`
Watch card (bundle the week's `.fit` files, "update watch" flags) - search + category pills - workout rows that expand to the rundown (`Rundown.tsx`) with Change with coach, Download .fit and History (`WorkoutHistory.tsx`, versions and restore). Components: `Watch.tsx` (`WatchCard`, `WatchChip`, `useGarminDownload`).

### Account `/account` and Login `/login`
Account: signed-in line, sign out, set a password. Login: password form, or "email me a link".

## 4. Shared components

| Component | What it is | Used by |
|---|---|---|
| `AppProvider` | context + data reload (`run`) + proposal saving + sheets | everything |
| `Shell` | top bar, tabs, slide-out menu | `(app)/layout` |
| `DayView` | the day screen | `/`, `/day/[date]` |
| `RecentList` | day-grouped log with rest-day rows and the full entry editor (delete lives in the editor) | DayView, Plan, History |
| `Rundown` | workout set/circuit tiles | DayView, Library, WorkoutHistory |
| `Collapsible` | "Show/Hide workout", closed by default on phones | DayView |
| `QuickCheck` | one-tap daily check-in | DayView |
| `PainCard` / `PainChart` | per-area pain card and its line | Body |
| `FeelPill` / `VertPill` | Rough / OK / Good / Great and vert pills | DayView, RecentList |
| `Programs` / `PhaseBar` | program card, saved bank, phase strip | Plan, DayView (banner), ProposalCard |
| `ProposalCard` | coach suggestions as before/after cards with Save / Discard (workout, plan, program, program update) | Chat |
| `Recap` | AI recap tile, cached per device | DayView |
| `Watch` | Garmin download hook, week bundle card, "on watch" chip | Library |
| `WorkoutHistory` | version list and restore | Library |
| `Chat` / `CoachDrawer` / `voice.ts` | saved conversation, thinking indicator, voice in and out | AppProvider |
| `charts/*` | `StatTile`, `WeeklyBars`, `MixBars`, `PainTrend`, `Heatmap`, `Spark`, tooltip | History |

## 5. Coach and APIs

| Route | Purpose |
|---|---|
| `POST /api/chat` | the coach (Claude, tool use). Saves every message to `coach_messages`. |
| `GET /api/garmin` | builds a `.fit` (one workout) or a `.zip` (the week) |
| `GET /api/recap` | the short AI recap shown on Today |
| `GET /auth/callback` | magic-link landing (`token_hash` or PKCE `code`) |

Coach tools (`/api/chat`): `log_session`, `pain_check`, `add_pain_area`, `propose_workout`, `propose_plan_change`, `propose_program`, `propose_program_update`, `set_program_status`, `set_goals`, `review_training`, `set_phase`, `set_travel`, `skip_up_next`, `start_next_week`. Anything that changes a workout, plan or program is a **proposal**: it shows as a card and saves only when the person taps Save.

## 6. Data

| Migration | Adds |
|---|---|
| 0001 | `profiles`, `workouts`, `plans`, `plan_state`, `log_entries` (+ RLS, signup trigger) |
| 0002 | `pain_areas`, `pain_checks`; new users start with an empty plan |
| 0003 | `plan_state.travel_info` |
| 0004 | `daily_checkins`, `coach_messages` |
| 0005 | `workout_versions`, `garmin_exports`, `workouts.version` |
| 0006 | `profiles.goals` |
| 0007 | `programs`, `plans.program_id / program_week` |

Library modules (`src/lib`): `actions.ts` (all writes, shared by browser and coach), `rules.ts` (up next, green light, dates), `stats.ts` (History numbers), `programs.ts` / `programInput.ts` (program position, phases, "done when" checks), `proposals.ts`, `review.ts` (digest for the coach), `types.ts`, `garmin/*` (`.fit` writer, steps, zip, status).

## 7. UI conventions
- Page: `.page` > `.page-head` (h1 + one control) > `.two` columns of `.stack`s of `.card`s.
- Pain colours: 0-3 green, 4-6 amber, 7-10 red (`painClass`). Feel: Rough red, OK grey, Good green, Great solid green.
- Rest days are grey and dashed; tours use the accent colour; days before tracking began are faded.
- Destructive actions: delete an entry = open it, then tap twice. Nothing the coach suggests saves without a tap.
- Charts: brand teal for single-series; validated blue / orange (`--s1`, `--s2`) for two series; direct labels plus a "View as table".
- Dates: use the browser locale; show the first tracked day, never time before it.

## 8. Cleanup backlog (from the 2026-11-28 audit)
- [ ] One `WorkoutTile` replacing the five ways a workout is shown (Today, Library, planned day, proposal diff, version viewer)
- [ ] One `format.ts` for dates (helpers are redefined in 6 files; 5 places hardcode `en-US`)
- [ ] Shared `PainPicker` / `FeelPicker` (hand-built 5 and 3 times); drop the duplicate `PainChart.tsx`
- [ ] One `ConfirmButton` (browser `confirm()` in Plan and Programs vs tap-twice vs none for Pause / calm-down)
- [ ] One label family for `.tag` / `.chip` / pills; a `SectionCard` with a standard header (30 hand-written cards, 83 inline styles)
- [ ] One `PageHeader` and one name for the coach button (Ask / Update / Build with coach)
- [ ] Share the "Log something else" block (Plan and Today)
- [ ] Generalise Dave-specific defaults: Plan's "Hip flared / Calm-down", `SKI1 Hip Strength` as the log default
- [ ] Three lists of the same log (Plan > Past, History > Log, Body > Recent notes): keep one editable list
- [ ] Slim the Plan page (8 tiles, 5 concerns)

**Planned:** program pages. Program overview with clickable phases, then a week page with one tile per workout, then the workout tile. Needs a table that stores each program week (migration 0008) so past weeks are kept.

## 9. Changelog
- 2026-11-28 - Initial site map and component inventory; cleanup backlog from the audit.
