# Cairn - project brief

Cairn is a workout log and coach. Like the stacked stones that mark a trail, every session adds a stone and you can look back at the route. It started with ski touring and a hip flexor rehab, but it covers all training: strength, full body, travel, surf prep.

## Why this exists
Dave tours (backcountry skis) as much as possible in winter. A recurring right hip flexor strain is the limiter, not cardio. This app answers three questions with as little friction as possible:
1. What should I do today?
2. Log that I did it (with hip pain and how I felt) in a few taps.
3. Am I ready to add more vert?

Workouts are run on a Garmin watch. The app is the plan, the log and the coach. Working out is not the sport - it supports being outside.

App name: **Cairn**. The in-app chat is "the Cairn coach".

Owner/admin: Dave. Other users (family, friends) can sign up and log their own workouts.

## Stack
- Next.js (App Router, TypeScript) on Vercel
- Supabase: Postgres, Auth (email magic link), Row Level Security
- Anthropic API for the in-app coach chat (server route, tool use)
- GitHub repo; Vercel deploys main, preview deploys on PRs
- Mobile first. Must work great as a home-screen web app (PWA manifest). Two-pane layout at >= 900px.

## What already exists (in this repo)
- `prototype/index.html` - the working single-file version Dave used daily. Copy its UX, wording, rules and look. It is the spec for behavior.
- `data/workouts.json` - all 24 workouts as structured data (steps, repeats, rests, reps/seconds, weights in lb, notes, Garmin category/name enums). Seed source.
- `data/workout_rundowns.json` - the grouped display form (tiles for sets/circuits) the prototype renders.
- `data/history.json` - Dave's log so far. Import for Dave's user.
- `garmin/` - Python that builds Garmin .fit workout files from the specs (fit-tool). Phase 3 reference.

## Core rules (from the prototype - keep them)
- Pain scale 0-10: 0 none / 1-3 aware of it, moves fine (green) / 4-6 sharp, changes how you walk / 7-10 stops you.
- Pain must stay <= 3 during anything.
- Phases: `calm` (wall march holds + EZ1 only, no tours) until daily hip check <= 3, then `build` (weekly plan).
- Tour green light, based on the latest tour:
  - pain during > 3 -> "Step back: 1,000-1,500 ft"
  - next-morning pain > 0 -> "Hold at same vert"
  - next-morning pain = 0 -> "Green light: +20-25%" (round to 50 ft)
  - no tours yet -> "Start at 1,000-1,500 ft"
- Daily hip check banner until today's check is logged. The morning after a tour, it also fills that tour's next-morning pain.
- Plans are sequences, not dates: "Up next" = first item not done. Missed a day? Just do what's next. Skip is allowed.
- Home plan (7 items): Mon SKI1 + EZ1 / Tue CC (next in CC01 > CC05 > CC10 > CC15 > CC20) / Wed SKI2 / Thu EZ2 / Fri Rest (optional SKI3) / Sat Tour (SKI4 at trailhead, SKI3 after) / Sun SKI1.
- Travel plan: TRV1 > TRV2 > TRV1 > TRV3, plus TRV4 Drive Reset at every stop on drive/flight days. Toggle travel mode; home plan progress is kept.
- A plan item can hold several workouts; logging it creates one log entry per workout. Logging allows adding extra workouts (rare).
- Every log entry can be edited later (notes at minimum).

## Data model (Supabase)
- `profiles` (id = auth.users.id, display_name, role: 'admin' | 'member', goals text + goals_updated_at (0006, set by the coach's set_goals), created_at)
- `workouts` (id, name, category, owner_id null = shared library, steps jsonb (Garmin), rundown jsonb (display), notes, version, change_note, updated_at, updated_by)
- `workout_versions` (snapshot per version, written by trigger; restore from the Library) and `garmin_exports` (user_id, workout_id, version last downloaded for the watch)
- `plans` (id, owner_id, name, kind: 'home' | 'travel' | 'calm', items jsonb: [{key, day, title, workout_ids[], kind: 'workout'|'tour'|'rest', note}], program_id + program_week (0007))
- `programs` (0007): goal programs - title, goal, kind 'event' (target_date) | 'ongoing', weeks, days_per_week, status idea|active|paused|done (one active), phases [{name, weeks, focus}], preferences. Event phases are stretched/trimmed at the front so the taper ends on the date (`src/lib/programs.ts`)
- `plan_state` (user_id pk, phase, travel bool, active_home_plan_id, active_travel_plan_id, done jsonb, travel_done jsonb, week int)
- `log_entries` (id, user_id, date, kind: 'workout'|'tour'|'rest'|'hip_check', workout_id null, what text, pain_during, pain_next_am, hip_pain, feel, vert_ft, notes, created_at, updated_at)
- RLS: users read/write only their own plans, state and log. Shared workouts are readable by everyone and writable by admin only. Users can create private workouts (owner_id = self).
- Seed: shared workouts from `data/workouts.json`, Dave's home and travel plans from the rules above, Dave's history from `data/history.json`.

## Features
### Phase 1 - parity + users (ship first)
- Magic-link login, profile, admin flag for Dave
- Up next card with full rundown (set/circuit tiles), Done - log it, Skip
- Daily hip check, tour green light, week list, travel toggle, calm/build toggle
- Log sheet (multi-workout, pain 0-10 in one row, feel, vert for tours, notes), recent list with edit/delete, pain trend chart
- Workout library (view any workout)
- Coach check-ins: `src/lib/review.ts` digests the last 5/14/28 days (focus split, pain, feel, tours) into the prompt; `review_training` for other windows. Check-ins answer: last 5 days / vs your goals / next. Weekly programs come back as one plan card with any new workouts bundled in.
- Goal programs: the coach interviews (when, how long, days/week, minutes, variety, rest, equipment, limits), then `propose_program` + week 1 in one card. The active program drives the weekly plan; each new program week the app prompts "Build this week". Plan page lists the active program (phase bar, countdown) and the bank.
- Coach chat: `/api/chat` calls Claude with the user's context (plan, up next details, last ~25 log entries, rules) and tools: log_session, hip_check, set_phase, set_travel, skip_up_next, start_next_week. Key in `ANTHROPIC_API_KEY` (server only).

### Phase 2 - editing
- Workout editor: create, edit and duplicate workouts (steps, sets, reps/time, weight, notes, set/circuit grouping). Shared ones admin-only, private ones by owner.
- Plan editor: reorder items, assign workouts, set days and notes.
- Chat tools for the same: create_workout, update_workout, update_plan (admin can touch shared; members only their own). Always show a diff and confirm before saving.
- Admin "change the app" from chat: tool `request_code_change` opens a GitHub issue (title and body from the conversation) that tags @claude. The Claude Code GitHub Action makes a PR, Vercel makes a preview, Dave reviews and merges. Never let the chat edit code or merge directly.

### Phase 3 - Garmin
- Done: `src/lib/garmin/` (TS port of `garmin/fitlib.py`, decodes identically for all 24 workouts). Library shows "Update watch" when a workout changed since the last download; `/api/garmin` and `npm run garmin:pull` give the files. Coach edits rebuild only the changed rows' watch steps. Tests: `npm run test:garmin`.
- Export any workout as a Garmin .fit file. Rules learned the hard way:
  - sport = TRAINING, sub_sport = STRENGTH_TRAINING
  - exercise_category and exercise_name on every step, plus ExerciseTitle messages for custom names
  - unique serial_number and time_created per file, or the watch overwrites
  - only wrap a step in a repeat when sets > 1
  - workout name <= 20 chars
- Later: push workouts to Garmin Connect (python-garminconnect, unofficial) and pull completed activities in for a review view Dave likes better than Garmin Connect.

## Style
- Casual, short copy. Single dash (-), never em dash. "Done - log it", "Up next", "Hip check".
- Keep the prototype's palette, fonts (Barlow Condensed + Source Sans 3), light/dark themes and layout.
- Hip-risk swaps stay in workout notes (e.g. "R hip >3/10: swap to dead bug").
- Coach tone: brief, practical, not a doctor. Red flags (pain at rest/night, catching/clicking, limping that won't settle) -> suggest PT/sports med.
