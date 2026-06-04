# Jeopardy App — Product Requirements Document

## Purpose
Offline trivia hosting tool. Admin creates games, hosts live sessions from phone/tablet, players see board on main screen. Scores auto-tally. End screen screenshot-worthy.

---

## Users

| Role | Device | Access |
|------|--------|--------|
| Admin / Host | Phone or tablet | `/admin/*` (auth required) |
| Players | TV / projector screen | `/play/[sessionId]` (public) |

---

## Core Requirements

### Game Creation
- Admin creates game with title, settings (wrong answer penalty, final jeopardy toggle)
- Adds teams (name + color, min 2 max 8)
- Builds rounds → categories → questions inline
- Supports JSON import for bulk game setup

### Question Structure
- Questions have: text, answer, points, optional double status
- Double types: `wagerable` (team sets wager) or `static_max` (admin-capped)
- Final Jeopardy stored separately (not as a question row) — category, text, answer on `games` table

### Live Session
- Admin starts session → two URLs generated: Run URL (admin control) + Board URL (presentation)
- Board state synced via JSONB polling (1500ms interval)
- Admin phone controls everything; board screen is read-only display

### Question Flow
1. Admin selects question → board shows question text
2. Any team can buzz in and attempt
3. Admin judges: Correct (award points, close question) or Wrong (deduct if penalty on, stay open for next guesser)
4. Admin can skip (show answer, no points awarded)
5. Same team can attempt again after wrong answer

### Scoring
- Correct: `+question.points` (or `+wager` for doubles)
- Wrong + penalty on: `-question.points` (or `-wager` for doubles)
- Wrong + penalty off: no change
- Skip: no change
- Scores sorted descending on board at all times

### Double Points Flow
1. Admin selects double question → board shows wager screen
2. Admin enters wager amount → board confirms
3. Question revealed, judged, score updated by wager

### Final Jeopardy Flow
1. Admin triggers Final Jeopardy → board shows category name only
2. All teams submit wager (admin enters per team on run panel)
3. Admin advances → board shows full question text
4. Teams answer (off-screen), admin judges each team correct/wrong
5. Board reveals answer → scores update → transition to leaderboard

### Player Board Display
- Full-screen dark blue board (Jeopardy aesthetic)
- Category headers top, point tiles in grid
- Revealed questions greyed out
- Active question overlays board (slides in)
- Score bar centered at bottom, sorted high→low
- Leader highlighted with badge + glow
- No double indicator visible to players (surprise preserved)

### Animations
- INCORRECT flash: red glow overlay on board, fades 2s
- Score drain: points visually flow downward to score bar on wrong answer
- Score card flash: green (gain) / red (loss) on change
- All animation events driven by unique IDs in board_state (no extra DB round-trips)

### JSON Import Format
```json
{
  "rounds": [
    {
      "name": "Round 1",
      "categories": [
        {
          "name": "Category Name",
          "questions": [
            {
              "text": "Question text",
              "answer": "Answer",
              "points": 200,
              "is_double": true,
              "double_type": "wagerable"
            }
          ]
        }
      ]
    }
  ],
  "final_jeopardy": {
    "category": "Category Name",
    "text": "Question text",
    "answer": "Answer"
  }
}
```

---

## Out of Scope (Not Built)
- Real-time buzzers / team-facing app (admin judges buzz manually)
- Audio effects
- Custom point values beyond what admin sets
- Multiple concurrent sessions per game

---

## Design Tokens

| Token | Value |
|-------|-------|
| Background | `#060B2C` |
| Board blue | `#0A0A3E` / `#0F1050` |
| Accent gold | `#FFDB58` |
| Correct | `#2E7D32` green |
| Incorrect | `#E0115F` crimson |
| Font (board) | Anton / Bebas Neue |
| Font (UI) | Inter |

---

## Non-Functional Requirements
- Mobile-responsive admin run panel (host on phone)
- Board readable at TV distance (large fonts, high contrast)
- Polling latency acceptable for live play (≤1500ms board update)
- No auth required for player board URL
