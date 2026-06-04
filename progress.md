# Jeopardy App — Progress Log

## Stack
Next.js 16 App Router · Supabase (Realtime via postgres_changes) · Framer Motion · TypeScript · Tailwind

---

## Completed Features

### Core Game Flow
- [x] Auth (Supabase email/password, middleware guard on `/admin`)
- [x] Game CRUD — create, edit, delete
- [x] Round / Category / Question editor (inline, sidebar nav)
- [x] Team management (name + color picker)
- [x] Session creation → generates Run URL + Board URL
- [x] Board updates via Supabase Realtime (postgres_changes on `game_sessions` + `session_teams`)

### Question Flow
- [x] Admin selects question from mini-grid or dropdown
- [x] Board transitions: `board → question → resolved`
- [x] Multi-attempt answering — any team can buzz in, wrong answers stay open
- [x] `attempts[]` array tracks per-team guess history in board_state
- [x] Admin controls: who guessed, attempt count per question
- [x] Skip question — shows answer, no points, no verdict
- [x] Wrong answer penalty toggle (deducts points or no-op)

### Animations
- [x] INCORRECT flash — red overlay glow on board screen, fades after 2s
- [x] Score drain animation — points animate downward from center toward score bar
- [x] Score flash on ScoreCard — green (up) / red (down) on change
- [x] Events driven by unique `last_incorrect_event` + `score_delta_event` IDs in board_state

### Double Points
- [x] `is_double` flag on questions
- [x] Types: `wagerable` (team chooses wager) / `static_max` (capped wager)
- [x] Wager flow: admin enters wager → board shows wager screen → judged
- [x] Star indicator hidden from player board (surprise element preserved)

### Final Jeopardy
- [x] `final_jeopardy_enabled` toggle on game settings
- [x] `final_jeopardy_question` JSONB column on `games` table
- [x] Admin editor: Category / Question text / Answer fields in GameEditor sidebar
- [x] JSON import supports `final_jeopardy` field at root level
- [x] Board screens: `final_wager` → `final_question` → `final_reveal`
- [x] Admin run panel shows question reference card during final phases
- [x] Final wager state hydrated from DB on page load/refresh (survives admin reconnect)

### Score Display (Player Board)
- [x] Centered score bar at bottom of board
- [x] Sorted highest → lowest score
- [x] Leader card: `★ LEAD` badge, team-color glow halo, larger score
- [x] Non-leaders: rank number (`#2`, `#3`) below score
- [x] Score delta animation wired

### JSON Import
- [x] Full game import from JSON (rounds → categories → questions)
- [x] Batched DB inserts (categories per round, questions per category) — 60%+ fewer roundtrips
- [x] File size guard (5 MB max)
- [x] Supports `is_double`, `double_type` per question
- [x] Supports `final_jeopardy` block at root
- [x] Template at `public/jeopardy-template.json`

### Session Stats (`/admin/games/[id]/sessions/[sessionId]`)
- [x] Dark Jeopardy theme (matches rest of admin UI)
- [x] Per-team breakdown: correct/wrong counts, points earned/lost
- [x] Point-tier breakdown per team
- [x] Full question attempt log

---

## Code Quality & Fixes Applied

### Security
- [x] Session-game ownership cross-validated in RunPage (`.eq("game_id", gameId)` added)
- [x] Score update + attempt log are atomic via `update_score_and_log_attempt` DB function (migration `004_atomic_score.sql`)

### Performance
- [x] Realtime replaces polling (`supabase.channel()` with `postgres_changes`)
- [x] FK indexes on all foreign key columns (migration `003_indexes.sql`)
- [x] JSON import uses batch inserts instead of N+1 sequential calls

### DRY / Maintainability
- [x] `SessionTeamWithTeam` type centralized in `lib/types.ts` (was duplicated 5×)
- [x] `findQuestion()` in `lib/game-utils.ts` (was duplicated in RunPanel + JeopardyBoard)
- [x] `sortGame()` in `lib/game-utils.ts` (was duplicated across 4 pages)
- [x] No-op `export const dynamic = "force-dynamic"` removed from client components

### Correctness
- [x] Dashboard "Stats" link uses latest session (sessions ordered by `started_at desc`)
- [x] Wager button validation matches actual min ($5), not just `> 0`

---

## DB Migrations Applied
| File | Status |
|------|--------|
| `supabase/migrations/001_initial.sql` | Applied |
| `supabase/migrations/002_final_jeopardy_question.sql` | **Pending user action** |
| `supabase/migrations/003_indexes.sql` | **Pending user action** |
| `supabase/migrations/004_atomic_score.sql` | **Pending user action** |

---

## Pending / Known Gaps

- [ ] Run migrations `002`, `003`, `004` in Supabase SQL Editor (user action required)
- [ ] End-of-game leaderboard screen (`/play/[sessionId]/final`) — podium layout, confetti
- [ ] Score drain animation target: currently animates toward bottom of screen, not exact score card position
