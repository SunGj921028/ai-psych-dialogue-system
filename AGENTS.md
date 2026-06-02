# AGENTS.md — Codex Repository Entry Point

This file is the first document future Codex sessions should read before making
changes in this repository. It captures the stable project intent, current
implementation reality, and the rules that should guide implementation work.

## Project Purpose

This project is an AI-assisted counseling documentation system.

It helps a counselor prepare before a formal session by entering client-provided
content, receiving structured micro-summaries, detecting crisis language, and
generating a draft case conceptualization report.

Core boundary: AI assists documentation and conceptualization only. The counselor
remains the professional decision-maker. The system must not diagnose, prescribe,
replace therapy, or present deterministic conclusions about a client.

## Human / AI Role Boundary

| Role | Definition |
|---|---|
| Counselor | The only direct user of the system. Operates all features and reviews all outputs. |
| Client | Not a direct system user. Client content is entered by the counselor. |
| AI / LLM | Tooling role only. Produces draft support material for counselor review. |

The project follows an asynchronous preparation model: the counselor operates
the system before or around formal counseling work; the client does not interact
with the application directly.

## Required Read Order For Future Codex Tasks

Before implementation work, read documents in this order:

1. `AGENTS.md` for top-level rules and current priorities.
2. `docs/IMPLEMENTATION_STATUS.md` to confirm what exists now versus what is intended.
3. For backend API work, read `backend/API_CONTRACT.md`.
4. For backend tests, read `backend/TESTING.md`.
5. For safety-sensitive changes, read `docs/SAFETY_REQUIREMENTS.md` and inspect
   the relevant agent prompt/code.
6. For frontend integration work, read `frontend/UI_CONTRACT.md`.

Do not assume older planning notes are implementation reality. The current codebase
is the source of implementation truth, and the status/contract docs explain known
mismatches.

## Current Architecture Overview

### Backend

- FastAPI application in `backend/main.py`.
- SQLite data layer in `backend/database/db.py` using `aiosqlite`.
- Dedicated `sessions` table stores safe operational metadata only and supports
  durable empty sessions and archive-only lifecycle metadata.
- Four implemented async agent modules in `backend/agents/`:
  - `crisis_agent.py`: crisis detection, Groq provider, fail-safe fallback,
    and post-demo speaker-attribution refinement.
  - `summary_agent.py`: per-turn JSON micro-summary, Groq provider.
  - `conversation_agent.py`: empathic response generation, Gemini provider.
  - `analysis_agent.py`: v1 report generation from summaries through Gemini,
    plus backend-only deterministic Report Schema v2 AI draft generation,
    v2 prompt/input builder helpers, provider output parser, and disabled-by-default
    Report v2 provider mode.
- HTTP router files in `backend/routers/` implement Task 09 routes and are mounted
  under `/api`.
- MCP server skeleton exists in `backend/mcp_servers/case_query_server.py`, but it is not implemented.

### Frontend

- React + Vite app in `frontend/`.
- React Router pages exist for conversation, report, history, and settings.
- ConversationPage is integrated with the backend conversation API.
- ReportPage is integrated with backend manual report generation and now acts as
  a counselor review workspace with a prominent backend disclaimer and
  summary-derived review aids.
- ReportPage places `會談整理輔助` before the v2 workflow, groups v2 manual
  input/generate/preview under `v2 報告草稿`, and moves v1 lower as
  `舊版 v1 暫存報告`. The v2 panel loads existing drafts, requires explicit
  Create Draft when none exists, does not auto-create drafts on page load, and
  saves manual input only through the backend Report v2 draft PATCH endpoint.
- ReportPage includes a separate `v2 AI 草稿產生` action card between the manual
  input panel and `ReportV2Preview`. It calls `generateReportDraftV2(draftId)`,
  blocks generation when manual input has unsaved changes, updates local
  `reportDraft` from the backend response, and remains separate from v1
  transient report generation.
- ReportPage mounts `ReportV2Preview` below the v2 generation card. The preview
  is simplified for demo-useful fields from loaded draft state, including
  `draft.ai_generated` fields labeled `AI 草稿，需諮商師審閱`; manual fields remain
  counselor-owned, `crisis_language_summary` remains visible, manual
  `safety_plan` renders only when provided, evidence refs are turn-number-only,
  and the preview does not call APIs or `generateReport`.
- ReportPage includes the first Recharts demo visualization slice in
  `會談整理輔助`: an emotion dimension radar chart derived from structured summary
  averages on a fixed `0-10` scale, with the existing text/bar fallback and
  browser storage safety unchanged.
- HistoryPage lists cases from the backend and can lazily expand multiple cases
  to show backend session metadata.
- HistoryPage displays session titles when present, uses 「未命名會談」 for untitled
  sessions, and keeps `session_id` visible as secondary metadata.
- HistoryPage supports inline counselor-entered session title rename/clear through
  the frontend `updateSessionTitle(caseId, sessionId, payload)` helper, which
  calls `PATCH /api/cases/{case_id}/sessions/{session_id}`.
- HistoryPage implements archive-only session lifecycle: archived sessions are
  hidden by default, can be shown with 「顯示已封存會談」, display 「已封存」, can be
  unarchived, and remain resumable/reportable when explicitly shown.
- SettingsPage is implemented as a static counselor-facing informational page
  covering system purpose, safety boundaries, storage/privacy behavior, theme
  preference behavior, backend-managed provider/model configuration, and
  counselor review reminders.
- Header navigation and light/dark theme toggle are implemented.
- Frontend deterministic tests use Vitest, React Testing Library, and jsdom.
- Frontend tests mock API helpers and do not call the live backend, providers, or
  network.
- Browser storage safety tests confirm clinical message content, summaries,
  generated report text, `ai_generated` JSON, report drafts, manual input,
  crisis levels, crisis reasons, and case notes are not persisted.
- ConversationPage uses backend durable sessions for create-case and new-session
  flows, while query-param resume takes precedence over stale `sessionStorage`
  and does not create a new session.
- ConversationPage restores persisted high, low, and none crisis display from
  loaded summary rows' top-level nullable `crisis_level`, with precedence
  `high > low > none`; legacy `crisis_flag` without persisted `crisis_level`
  remains safe fallback metadata and is not reinterpreted as low/high.
- Live high-risk turn responses open the high-risk modal without showing backend
  reason/detail inline; restored persisted high-risk state shows only a short
  page-level banner and does not replay the modal.
- ReportPage preserves case and session IDs when linking back to conversation.
- Session metadata, previews, titles, report drafts, manual input,
  `ai_generated` JSON, generated report text, and clinical content are not
  stored in browser storage.
- Backend-only deterministic Report Schema v2 AI draft generation, backend v2
  prompt/input builder and provider parser, disabled-by-default provider mode,
  and frontend v2 generate/preview integration are implemented. Manual local
  provider smoke testing has passed with synthetic data, and a classroom demo
  runbook exists at `docs/DEMO_RUNBOOK.md`. The post-demo prompt/preview
  refinement batch is complete. Counselor final report workflow, reviewed
  status, print-friendly/PDF export, production deployment/testing, additional
  chart polish/visualizations, hard delete/session data-retention workflow,
  title search/filter, richer session metadata, optional secret-safe
  runtime/provider status, and MCP integration remain future work.
- Hard delete, bulk archive/delete, HistoryPage crisis-level display if desired,
  and optional latest/peak session crisis aggregates remain future work.

### Active API Reality

The current active HTTP API includes:

- `GET /health`
- `POST /api/cases`
- `GET /api/cases`
- `GET /api/cases/{case_id}`
- `DELETE /api/cases/{case_id}`
- `POST /api/cases/{case_id}/sessions`
- `PATCH /api/cases/{case_id}/sessions/{session_id}`
- `POST /api/cases/{case_id}/sessions/{session_id}/archive`
- `POST /api/cases/{case_id}/sessions/{session_id}/unarchive`
- `POST /api/conversation/turn`
- `GET /api/cases/{case_id}/sessions`
- `GET /api/cases/{case_id}/sessions?include_archived=true`
- `GET /api/cases/{case_id}/sessions/{session_id}/messages`
- `GET /api/cases/{case_id}/sessions/{session_id}/summaries`
- `POST /api/reports/generate`
- `GET /api/cases/{case_id}/sessions/{session_id}/report-drafts/current`
- `POST /api/cases/{case_id}/sessions/{session_id}/report-drafts`
- `PATCH /api/report-drafts/{draft_id}/manual-input`
- `POST /api/report-drafts/{draft_id}/generate`

Remaining frontend workflow completion and focused frontend test gaps are now the
next major product integration blockers.

## Current Development Priority

Integrate remaining frontend workflows with the implemented HTTP API before MCP
work, now that durable backend session creation/use is implemented for the main
conversation flows.

Recommended order:

1. Keep repository context docs aligned with current code.
2. Add deterministic pytest-style backend tests with mocked LLM clients as behavior expands.
3. Complete remaining frontend workflows, including title search/filter, report
   workflow completion, and focused frontend test gaps. Hard delete requires a
   separate data-retention/privacy policy.
4. Implement MCP Task 07 after API contracts, data access behavior, and frontend
   workflows are clear.

MCP Task 07 remains future work until frontend/API behavior is stable enough to
guide case-query tooling.

## Non-Negotiable Safety Rules

All agent, API, report, and UI work must preserve these boundaries:

- Do not provide psychological or psychiatric diagnosis.
- Do not provide medication, dosage, stopping-medication, or medical advice.
- Do not replace professional counseling, therapy, or medical care.
- Do not present deterministic conclusions about the client.
- Do not give concrete treatment instructions.
- Use cautious language such as "possible", "initial observation", and
  "requires counselor confirmation" where interpretation is needed.
- The fixed report disclaimer must be supplied by code, not generated by an LLM:

```text
本報告為 AI 草稿，僅供諮商師參考，非診斷文件。
所有判斷與決策須由專業諮商師負責審核。
```

### Crisis Handling

- Crisis detection must be conservative.
- Runtime `crisis_level` values are only `none`, `low`, and `high`; persisted
  per-summary `crisis_level` may also be null for legacy rows.
- Frontend red crisis banners should be shown only when `crisis_level == "high"`.
- `crisis_flag` is controlled by the crisis detection result and must not be
  independently reinterpreted by the summary agent.
- On crisis detector failure, preserve fail-safe behavior.

## Key Implementation Realities

These are current code facts and should not be contradicted in new work:

- SQLite currently uses WAL mode in `backend/database/db.py`. Preserve this unless
  a future task explicitly asks for a database journal-mode migration.
- The database schema internally uses a `round` column for turn ordering.
- Public-facing API/data models should use `turn_number`, not `round`.
- `get_summaries_by_session()` and `get_latest_summaries()` return parsed summary
  data in a `summary` field, not raw `summary_json`.
- A dedicated `sessions` table stores only `case_id`, `session_id`, `created_at`,
  `updated_at`, `last_activity_at`, nullable `title`, and nullable
  `archived_at`; session rows cascade on case delete.
- Session titles are nullable operational metadata only. They are not
  AI-generated and must not be derived from raw messages, summaries, key
  statements, themes, crisis reasons, previews, reports, notes, or other
  clinical content.
- `PATCH /api/cases/{case_id}/sessions/{session_id}` supports backend-only
  manual title rename with shared normalization, nullable title clearing,
  `updated_at` changes, no `last_activity_at` changes, legacy/backfilled session
  support, and safe metadata responses.
- Session archive/unarchive sets or clears nullable `archived_at`, updates
  `updated_at`, does not update `last_activity_at`, preserves messages and
  summaries, and has no hard-delete endpoint.
- `GET /api/cases/{case_id}/sessions` includes explicit sessions plus legacy
  message/summary-derived sessions, excludes archived sessions by default, and
  supports `include_archived=true` for active plus archived sessions.
- `POST /api/conversation/turn` ensures/touches a session row without changing
  response shape or crisis logic.
- `POST /api/conversation/turn` persists exact backend `crisis.crisis_level`
  into nullable per-summary metadata. Legacy summary rows remain null and are
  not backfilled from old `crisis_flag` values.
- Session metadata must not store or expose raw messages, summaries,
  `summary_json`, `key_statement`, themes, crisis reasons, report text,
  DB-internal `round`, or latest/peak `crisis_level` aggregates.
- Existing Pydantic models inside agent files should be reused instead of duplicated:
  - `ConversationMessage`, `ConversationResponse`
  - `CrisisDetectionResult`
  - `TurnSummary`, `EmotionDetail`, `EmotionDimensions`
  - `ConceptualizationReport`, `EmotionPattern`
- `analysis_agent.py` computes `has_crisis`, `peak_turn`, and the fixed disclaimer
  in code.
- `analysis_agent.generate_report_v2_ai_draft(...)` exists beside v1
  `generate_report(...)`; unset or blank `REPORT_V2_PROVIDER_MODE` defaults to
  deterministic/conservative behavior and does not call a provider.
- `REPORT_V2_PROMPT_VERSION = "report_v2_prompt_001"` and Report v2
  prompt/input builder helpers exist. They use fixed curated knowledge-base
  excerpts and safety instructions, shape summaries into safe provider input,
  bound/truncate `key_statement`, and exclude raw messages, crisis detector
  reasons, DB-internal `round`, and session title. Post-demo refinements cover
  dialogue-based `crisis_language_summary`, supplemental
  `client_understanding_draft`, and `theoretical_orientation_rationale` starting
  with `初步建議取向：...`.
- Report v2 provider output parsing exists. It accepts JSON string or dict
  inputs, rejects invalid/non-object JSON, validates with
  `ReportAIGeneratedV2`, rejects unknown/manual-only fields through strict schema
  validation, normalizes provider `source_type` and `missing_reason` variants
  for known `ReportAIGeneratedV2` fields, and rejects unsafe evidence ref notes.
  Unknown/manual-only fields remain rejected. `_call_report_v2_provider(...)`
  exists as a selected-provider boundary used only when
  `REPORT_V2_PROVIDER_MODE=provider`.
- `REPORT_V2_PROVIDER_MODE` allows `deterministic` or `provider`; invalid
  explicit values fail closed. `REPORT_V2_PROVIDER` explicitly selects
  `gemini` or `groq` in provider mode and defaults blank/unset values to
  `gemini`. `REPORT_V2_MODEL` is provider-specific: Gemini falls back to
  `ANALYSIS_MODEL`, then `gemini-2.5-flash`; Groq falls back to
  `llama-3.3-70b-versatile` and does not use `ANALYSIS_MODEL`.
  `REPORT_V2_API_KEY` may override the selected provider key for Report v2 only;
  if unset, Gemini uses `GEMINI_API_KEY` and Groq uses `GROQ_API_KEY`.
- Report v2 generation failures are classified internally for diagnostics while
  public route responses remain generic and non-leaking.
- Gemini `response_format={"type": "json_object"}` compatibility is a known risk.
  If provider calls fail around JSON mode, prefer prompt-enforced JSON and robust
  parsing rather than changing the architecture.
- Deterministic route, agent, and DB tests exist under `backend/tests/`; older
  manual checks live under `backend/manual_checks/` and may still call live
  providers unless migrated.
- Frontend deterministic tests exist and use Vitest, React Testing Library, and
  jsdom with mocked API helpers.
- Future automated tests should remain deterministic pytest-style tests with mocked
  LLM clients or monkeypatched agent/provider boundaries.
- Live provider tests are manual checks only.

## Key Engineering Rules

### General

- Keep changes scoped to the requested task.
- Do not refactor unrelated code while implementing features.
- Do not modify application source while performing documentation-only tasks.
- Do not commit local database artifacts such as `cases.db`.
- The repository may contain user or generated changes. Do not revert unrelated
  changes unless explicitly asked.

### File Deletion Rule

Bulk deletion is prohibited. Do not use:

- `del /s`
- `rd /s`
- `rmdir /s`
- `Remove-Item -Recurse`
- `rm -rf`

If a file must be deleted, delete only one explicit file path at a time. If bulk
deletion seems necessary, stop and ask the user to handle it manually.

### Backend

- Preserve async style with `async/await`.
- Database access should use `async with get_db() as db:`.
- Agent functions should not write to the database; router/service orchestration
  owns persistence.
- Use `datetime.now(timezone.utc).isoformat()` for timestamps.
- Use `str(uuid.uuid4())` for UUIDs.
- For future backend API changes, keep routes aligned with `backend/API_CONTRACT.md`.

### Frontend

- Use function components and hooks.
- Page components live in `frontend/src/pages/`.
- Shared components live in `frontend/src/components/`.
- API calls should go through `frontend/src/api/client.js`.
- Preserve the existing API integration patterns in the implemented frontend pages.
- Do not store clinical message content, summaries, session metadata, previews,
  report text, report drafts, manual input, crisis levels, crisis reasons, case
  notes, titles, drafts, or other clinical content in browser storage.
- `localStorage` is used only for the existing `ai-psych-theme` key.
- `sessionStorage` may store only active case/session identifiers.

### Testing

- Prefer pytest-style deterministic tests.
- Mock LLM clients by default.
- Do not run live LLM/provider tests unless the user explicitly asks.
- For DB tests, use temporary SQLite paths and avoid touching real local data.
- Keep CI deterministic: run `backend/tests` and frontend test/build commands
  only, without provider API keys or live/manual provider scripts.
- Do not use `backend/manual_checks/` as automated tests. Manual provider checks
  in that directory should run only when explicitly requested.

## Documentation Map

| File | Purpose |
|---|---|
| `docs/IMPLEMENTATION_STATUS.md` | Current implementation reality, intended future work, known mismatches, and recommended order. |
| `backend/API_CONTRACT.md` | Implemented HTTP API contract for Task 09 and route-level data flow. |
| `backend/TESTING.md` | Backend testing direction, current script inventory, and pytest migration guidance. |
| `docs/SAFETY_REQUIREMENTS.md` | Detailed safety behavior for agents, routes, reports, frontend warnings, and tests. |
| `frontend/UI_CONTRACT.md` | Intended frontend behavior, state shapes, and integration expectations. |
| `README.md` | Basic setup and local run commands; may lag behind implementation details. |

If documents conflict:

- Source code is the source of truth for current implementation reality.
- `docs/IMPLEMENTATION_STATUS.md` tracks current versus intended status.
- `backend/API_CONTRACT.md` guides future backend API changes.
- `docs/SAFETY_REQUIREMENTS.md` is the deeper authority for safety behavior.
- `backend/TESTING.md` guides backend testing strategy.
- `frontend/UI_CONTRACT.md` guides frontend integration behavior.
- `AGENTS.md` remains the top-level entrypoint and high-level rule file.
