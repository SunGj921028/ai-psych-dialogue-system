# Implementation Status

This document separates current implementation reality from intended future work.
Use it before planning or implementing repository tasks.

## Current Reality By Subsystem

### Backend Database

Status: implemented, with known documentation mismatches.

Current facts:

- `backend/database/db.py` defines SQLite schema and async CRUD helpers.
- The app initializes the database through `init_db()` during FastAPI lifespan.
- SQLite currently uses WAL mode. Preserve this unless a future task explicitly
  asks for a journal-mode migration.
- The database internally stores turn order in a column named `round`.
- Public-facing code should expose `turn_number`.
- Summary query helpers return parsed summary dictionaries in `summary`, not raw
  `summary_json`.
- A dedicated `sessions` table exists for safe operational metadata only:
  `case_id`, `session_id`, `created_at`, `updated_at`, `last_activity_at`, and
  nullable `title`.
- Session titles are nullable counselor-provided operational metadata. The
  backend does not generate titles with AI and must not derive titles from raw
  messages, summaries, key statements, themes, crisis reasons, previews,
  reports, notes, or other clinical content.
- `update_session_title(case_id, session_id, title)` exists for manual backend
  session rename support.
- Session title normalization is shared: null and empty or whitespace-only
  strings clear the title to null, valid strings are trimmed, and over-length
  titles are rejected by API validation.
- Renaming a session updates `sessions.updated_at` without updating
  `last_activity_at`.
- Legacy message/summary-derived sessions can be renamed because the backend
  backfills or ensures a durable `sessions` row before updating.
- Session rows are linked to cases and cascade when a case is deleted.
- Existing message/summary-derived sessions are backfilled idempotently.
- Empty sessions can now exist durably through backend session creation.
- Session metadata must not store or expose raw messages, summaries,
  `summary_json`, `key_statement`, themes, crisis reasons, report text,
  DB-internal `round`, or exact `crisis_level`.

### Backend Agents

Status: mostly implemented.

Current facts:

- `crisis_agent.py` detects crisis language through Groq and falls back to heuristic
  detection on failure.
- `summary_agent.py` generates one-turn `TurnSummary` objects and forces
  `crisis_flag` to match the external crisis detector result.
- `conversation_agent.py` generates empathic non-streaming responses through Gemini
  and contains safety fallback behavior.
- `analysis_agent.py` generates `ConceptualizationReport` objects from summaries.
  It computes `has_crisis`, `peak_turn`, and the fixed disclaimer in code.
- Gemini JSON mode via `response_format={"type": "json_object"}` is a known
  compatibility risk.

### Backend Routers

Status: implemented.

Current facts:

- `backend/routers/cases.py`, `backend/routers/conversation.py`, and
  `backend/routers/reports.py` implement Task 09 HTTP routes.
- Routers are mounted in `backend/main.py` under `/api`.
- `GET /health` remains active.
- Implemented API endpoints are:
  - `POST /api/cases`
  - `GET /api/cases`
  - `GET /api/cases/{case_id}`
  - `DELETE /api/cases/{case_id}`
  - `POST /api/cases/{case_id}/sessions`
  - `PATCH /api/cases/{case_id}/sessions/{session_id}`
  - `POST /api/conversation/turn`
  - `GET /api/cases/{case_id}/sessions`
  - `GET /api/cases/{case_id}/sessions/{session_id}/messages`
  - `GET /api/cases/{case_id}/sessions/{session_id}/summaries`
  - `POST /api/reports/generate`
- Public route responses expose `turn_number`, not DB-internal `round`.
- Summary responses expose parsed summary data, not raw `summary_json`.
- `POST /api/cases/{case_id}/sessions` creates durable session metadata. The
  backend may generate `session_id` when omitted, duplicate same-case/session
  creation is idempotent, missing cases return 404, and helper failures return
  generic non-leaking 500 responses.
- `POST /api/cases/{case_id}/sessions` accepts optional `title`. Omitted or
  whitespace-only titles are normalized to null, valid titles are trimmed,
  over-length titles are rejected, and duplicate same-case/session creation
  returns the existing metadata without overwriting an existing title.
- `PATCH /api/cases/{case_id}/sessions/{session_id}` updates nullable
  counselor-entered session title metadata. The `title` field is required but
  may be null; null or whitespace-only values clear the title to null; valid
  strings are trimmed; titles longer than 80 characters return 422; missing
  cases or sessions return 404; helper/DB failures return generic non-leaking
  500 responses; and the response matches the safe session metadata shape with
  nullable `title`.
- `GET /api/cases/{case_id}/sessions` remains backward-compatible and includes
  explicit sessions plus legacy sessions derived from existing messages and
  summaries. Legacy/backfilled sessions return `title: null`.
- Existing cases with no explicit or derived sessions still return `[]`.
- `POST /api/conversation/turn` ensures/touches a session row while preserving
  the existing conversation response shape and crisis logic.
- Session metadata responses expose only metadata fields and do not expose raw
  messages, summaries, raw `summary_json`, summary `key_statement`, themes,
  crisis reasons, report text, DB-internal `round`, or exact `crisis_level`.
- Exact `crisis_level` is not persisted in this milestone.

### MCP Server

Status: placeholder / future work.

Current facts:

- `backend/mcp_servers/case_query_server.py` is a skeleton and raises
  `NotImplementedError`.
- MCP Task 07 should come after HTTP API behavior and data access expectations are stable.

### Frontend

Status: partially implemented and integrated with the HTTP API.

Current facts:

- React + Vite app exists under `frontend/`.
- Routes exist for conversation, report, history, and settings.
- ConversationPage is integrated with the backend conversation API and supports
  query-param resume with `caseId` and `sessionId`; query params take precedence
  over stale `sessionStorage` identifiers and do not create a new session.
- The frontend API layer exposes `createSession(caseId, payload = {})`, which
  calls `POST /api/cases/{case_id}/sessions`; normal frontend-created sessions
  omit `session_id` and use the backend returned `session_id`.
- ConversationPage create-case flow calls `createCase`, then
  `createSession(newCase.id)`, and uses the backend returned `session_id`.
- The frontend API layer exposes `updateSessionTitle(caseId, sessionId, payload)`,
  which calls `PATCH /api/cases/{case_id}/sessions/{session_id}` with
  `{ title: string | null }`.
- The ConversationPage "new session" action calls `createSession(activeCaseId)`
  and uses the backend returned `session_id`.
- Old messages and summaries are cleared only after durable session creation
  succeeds.
- Selecting an existing case does not automatically create a session; it clears
  the active session and waits for the counselor to click the new-session action.
- Send-turn payload shape is unchanged, and the backend continues to ensure/touch
  durable session rows.
- ConversationPage uses a bounded, scrollable message log so conversation turns
  do not awkwardly grow the whole page, and the latest message remains visible
  above the composer.
- ConversationPage input behavior is stabilized: Enter submits, Shift+Enter adds
  a newline, IME composing Enter does not submit, the textarea remains editable
  while submitting, the send button is locked while submitting, and duplicate
  submits are guarded.
- ReportPage acts as a counselor review workspace integrated with the backend
  report API. Report generation remains manual-only.
- Generated reports are currently transient: `POST /api/reports/generate` returns
  a report response but does not persist it, and ReportPage tells counselors that
  draft reports are shown only temporarily and must be regenerated after leaving
  or reloading the page.
- ReportPage displays the backend-supplied fixed disclaimer prominently.
- ReportPage includes summary review aids derived from loaded summaries: emotion
  intensity trend, emotion dimension average/latest snapshot, theme frequency
  chips, micro-summary timeline, and crisis occurrence indicator from existing
  backend data.
- ReportPage review aids are counselor-facing context only and are not objective
  clinical measurements.
- HistoryPage lists cases from the backend and can lazily expand multiple cases
  to show backend session metadata, including empty durable sessions when the
  backend returns them, plus resume links and report links.
- HistoryPage displays `session.title` as the primary session label when present.
  Untitled sessions display the fallback `未命名會談`, while `session_id` remains
  visible as secondary metadata.
- HistoryPage supports inline session title editing on one session row at a time.
  Each editable row includes an edit control, input, Save, Cancel, and Clear
  title action.
- Saving a title sends the trimmed title through `updateSessionTitle`; clearing a
  title sends `{ title: null }`.
- Title drafts are limited to 80 characters. Over-length titles show validation
  and do not call the API.
- Enter saves, Escape cancels, failed saves show a friendly generic error, and
  the draft is preserved for retry.
- HistoryPage resume links use `/?caseId={caseId}&sessionId={sessionId}`.
- HistoryPage report links use `/report/{caseId}?sessionId={sessionId}`.
- SettingsPage is implemented as a static counselor-facing informational page.
  It explains the system purpose, safety boundaries, browser storage/privacy,
  theme preference behavior, backend-managed model/service configuration, and
  counselor review reminders.
- SettingsPage states that the system is counseling documentation support only,
  does not provide diagnosis, does not generate formal treatment plans, does not
  provide medication or dosage advice, is not an emergency service replacement,
  and leaves the counselor as final reviewer and decision-maker.
- SettingsPage performs no storage writes, exposes no API keys or `.env` values,
  includes no provider/model selection, and does not add a second theme toggle.
- ReportPage back-to-conversation links preserve the active case and session IDs.
- The app header includes navigation and a theme toggle.
- Light/dark theme support exists and uses only the `ai-psych-theme`
  localStorage key.
- Browser storage safety behavior is implemented: clinical message content,
  summaries, report text, crisis reasons, and case notes are not persisted to
  browser storage.
- `sessionStorage` may store only active case/session identifiers.
- Session metadata, preview text, titles, drafts, and clinical content are not
  persisted to browser storage.
- No title is stored in browser storage, no AI-generated titles exist, and the
  frontend does not derive titles from raw messages, summaries, key statements,
  themes, crisis reasons, previews, reports, notes, or other clinical content.
- Title drafts are counselor-entered operational metadata only and are not stored
  in `localStorage` or `sessionStorage`.
- Crisis UI uses backend `crisis_level` only; the red banner is shown only for
  `crisis_level == "high"`.
- The default/no-crisis wording is 「未偵測到危機」.
- If loaded summaries contain `crisis_flag` but no persisted `crisis_level`, the
  frontend shows safe counselor-review metadata such as
  「最新摘要有危機註記，請諮商師重新檢視」 and does not infer low/high risk from
  `summary.crisis_flag`.
- The high-risk modal/dialog opens only when a backend response includes
  `crisis.crisis_level === "high"`; dismissing it does not remove high-risk page
  metadata, and low/default crisis states do not open the modal.
- PDF export, session deletion/archive, title search/filter, richer session
  metadata, optional charting library integration, runtime/provider status
  endpoint if needed, and MCP integration remain future work.
- Any future runtime/provider status endpoint must avoid leaking secrets. Real
  provider settings UI remains out of scope unless explicitly designed.
- No persisted report drafts, persisted exact `crisis_level` on summaries, Report
  Schema v2, editable report fields, backend schema changes, LLM prompt changes,
  Recharts integration, or final report template mirroring has been implemented
  for the report workspace.

### Tests

Status: implemented backend and frontend deterministic testing foundations, with
optional broader end-to-end testing still pending.

Current facts:

- Deterministic pytest tests now exist under `backend/tests/` for routes, agents,
  and the SQLite data layer.
- `backend/tests/helpers.py` provides fake OpenAI-compatible LLM responses for
  deterministic agent tests.
- DB tests use temporary SQLite databases and preserve current WAL expectations.
- Route tests use temporary SQLite databases and mocked or monkeypatched LLM/agent
  behavior where provider calls would otherwise occur.
- Agent tests monkeypatch LLM clients and do not require API keys, network access,
  or live providers.
- Manual/live backend scripts live under `backend/manual_checks/` as `check_*.py`
  files to avoid pytest discovery.
- `backend/manual_checks/check_db_smoke.py` remains a legacy/manual smoke script
  outside the default deterministic pytest commands.
- Future automated tests should continue to be pytest-style and should mock LLM
  clients by default.
- Live provider scripts should remain manual checks, not required automated tests.
- Frontend testing foundation is implemented with Vitest, React Testing Library,
  and jsdom.
- Frontend tests mock API helpers and do not call the live backend, providers, or
  network.
- Backend DB and route tests cover session metadata, missing-case 404,
  existing-case empty-list behavior, and generic non-leaking session-listing
  failure handling.
- Backend tests cover session title normalization, response exposure,
  duplicate/idempotent behavior that does not overwrite existing titles, and
  legacy/backfilled session `title: null` behavior.
- Backend tests cover PATCH session title success, trimming, clear via null,
  clear via whitespace, over-length 422, missing case 404, missing session 404,
  generic non-leaking 500 behavior, timestamp behavior, legacy/backfilled session
  rename, and safe response shape.
- Backend DB tests cover sessions table creation, idempotent backfill,
  create/get/ensure/touch helpers, explicit empty sessions, legacy derived
  compatibility, sorting, no-leak metadata, and cascade behavior.
- Backend route tests cover POST session creation, idempotency, missing case, GET
  inclusion, conversation ensure/touch behavior, and generic non-leaking
  failures.
- Backend route-test DB isolation was improved to reduce Windows SQLite temp/WAL
  lock flakiness.
- Current frontend coverage includes header/theme toggle behavior, safe theme
  localStorage usage, the `createSession` API helper contract, ConversationPage
  input behavior, crisis modal/fallback behavior, create-case durable session
  flow, new-session durable flow, createSession failure handling, query-param
  resume no-create behavior, ReportPage missing `sessionId` handling, manual
  report generation, disclaimer display, transient report note,
  back-to-conversation link preservation, API helper path/payload contracts
  including `updateSessionTitle`, HistoryPage list/empty/error/session-expansion
  behavior, empty durable session rendering, HistoryPage title/fallback
  rendering, rename controls, save, clear, cancel, keyboard behavior, validation,
  error handling, single-row editing, resume/report link preservation,
  SettingsPage rendering, absence of secret/input controls, no API helper calls
  from SettingsPage, no clinical sentinel persistence, no new storage keys, and
  browser storage safety regressions.
- Browser storage safety tests confirm clinical message content, summaries,
  report text, crisis reasons, and case notes are not persisted to browser
  storage.
- Frontend storage expectations are explicit: `localStorage` is used only for
  `ai-psych-theme`, and `sessionStorage` may store only active case/session
  identifiers.
- Remaining future frontend testing work includes ReportPage error handling tests,
  optional Playwright/E2E later, and visual regression later if needed.
- GitHub Actions CI exists and runs deterministic backend tests under
  `backend/tests/` plus frontend `npm run test` and `npm run build`.
- CI does not run live provider/manual scripts under `backend/manual_checks/`.

## Task / Status Table

| Area / Task | Status | Notes |
|---|---|---|
| Task 01 project scaffold | implemented | Repo structure exists. |
| Task 02 SQLite data layer | implemented | Uses WAL and internal `round` columns. |
| Task 03 crisis agent | implemented | Includes fallback heuristic detection. |
| Task 04 summary agent | implemented | Reuses external crisis flag. |
| Task 05 conversation agent | implemented | Non-streaming, Gemini-based, safety fallback. |
| Task 06 analysis agent | implemented | Computes report metadata in code. |
| Task 07 MCP case query server | future | Still out of scope after Task 09; defer until API/data access behavior is stable. |
| Task 09 FastAPI routes | implemented | Routes mounted under `/api` with deterministic route tests, including durable session metadata creation/listing and backend-only manual session rename. |
| Task 11 conversation page | implemented | Integrated with backend conversation API; stabilized bounded chat layout, submit behavior, query-param resume, durable backend session creation for create-case/new-session flows, and backend-level-only crisis UI behavior. |
| Task 12 visualization components | partial | ReportPage has summary-derived review aids; optional Recharts/charts remain future work. |
| Task 13 report page | partial | Counselor review workspace exists with manual transient generation, prominent backend disclaimer, and transient-report note; persisted drafts, PDF export, editable fields, final template mirroring, and formal schema expansion remain future work. |
| Task 14 history page | partial | Lists backend cases and session metadata, including empty durable sessions returned by the backend; displays session titles when present with an untitled fallback, keeps session IDs visible as secondary metadata, and supports inline manual title rename/clear. Deletion, archive, title search/filter, labels, and richer session metadata remain future work. |
| Task 15 settings page | implemented / static | Static counselor-facing informational page covering purpose, safety boundaries, storage/privacy, theme behavior, backend-managed provider configuration, and counselor review reminders; no secrets, provider/model selection, API calls, storage writes, or second theme toggle. |
| Backend deterministic testing foundation | implemented | Route, DB, and agent tests exist under `backend/tests/` without live provider calls. |
| Frontend deterministic testing foundation | implemented | Vitest, React Testing Library, and jsdom tests cover core UI/API/storage contracts without live backend/provider/network calls. |
| CI deterministic validation | implemented | GitHub Actions runs `backend/tests`, frontend tests, and frontend build without provider keys or live/manual scripts. |
| Task 16 end-to-end tests | future | Optional Playwright/E2E coverage can be added later after remaining workflows stabilize. |
| Task 17 prompt iteration | future | Should continue to include safety regression tests. |

Status categories:

- implemented: meaningful code exists and can be reused.
- partial: some usable code exists, but the feature is not complete.
- placeholder: file or route exists but does not implement intended behavior.
- future: intended, but not yet a current implementation target.

## Known Documentation / Code Mismatches

- Older design notes said to use SQLite DELETE journal mode. Current code uses WAL.
  Preserve WAL for now.
- Older schema descriptions use `turn_number` as a database column. Current DB schema
  uses `round` internally and maps it to `turn_number` in returned dictionaries.
- Older notes said `get_latest_summaries()` clamps with `max(1, min(limit, 100))`.
  Current code raises `ValueError` for non-positive limits and clamps only the upper bound.
- Older model defaults mention `gemini-2.0-flash` and `gemini-1.5-pro`.
  Current `.env.example` uses `gemini-2.5-flash-lite` and `gemini-2.5-flash`.
- README still references the generic default provider path more than the current
  Groq/Gemini split.
- Deterministic backend tests now exist under `backend/tests/`, and deterministic
  frontend tests now cover core UI/API/storage behavior; legacy live-provider
  scripts live under `backend/manual_checks/` outside the default deterministic
  test suite.

## Recommended Implementation Order

1. Keep context documents accurate as work proceeds.
2. Keep deterministic backend tests current as route and agent behavior evolves.
3. Complete remaining frontend workflows: deletion, session deletion/archive,
   title search/filter, persisted report drafts, persisted exact `crisis_level`
   if exact crisis level should survive reload/navigation, PDF export, optional
   charts/Recharts, editable report review workflow, report status, and optional
   runtime/provider status if needed without leaking secrets.
4. Fill remaining frontend test gaps: ReportPage error handling.
5. Add optional Playwright/E2E coverage later, and visual regression later if
   needed.
6. Implement MCP Task 07 after HTTP and frontend behavior are stable.

## Confirmed Risks

- Live-provider scripts are not reliable automated tests.
- Gemini JSON `response_format` may not be supported consistently.
- Safety-sensitive behavior depends on prompts and fallback code; deterministic
  regression tests now cover core backend agents, but future prompt changes still
  need focused test updates.
- Database cascade deletion exists through case deletion and must be handled carefully in APIs.

## Suspected Risks

- Existing docs and README may lag behind source behavior.
- Frontend state shape may drift unless remaining workflows continue to follow
  the API contract.
- Manual tests may give false confidence because they depend on provider availability and model behavior.

## Current Reality Versus Future Intent

Current reality:

- DB and agents are the usable backend foundation.
- Active API includes `/health` and the Task 09 `/api` routes.
- Backend routers are implemented.
- A dedicated backend sessions table exists for safe operational metadata,
  supports durable empty sessions, backfills legacy message/summary-derived
  sessions idempotently, and cascades on case deletion.
- Session metadata responses include nullable `title`; title input on session
  creation is normalized by the backend, duplicate session creation is
  idempotent without title overwrite, and legacy/backfilled sessions return
  `title: null`.
- Backend-only manual session rename is implemented through
  `PATCH /api/cases/{case_id}/sessions/{session_id}`. It uses the shared title
  normalization rules, updates `sessions.updated_at`, does not update
  `last_activity_at`, supports legacy/backfilled session rename, returns safe
  session metadata with nullable `title`, and uses non-leaking error responses.
- Session listing includes explicit sessions plus legacy derived sessions while
  preserving backward-compatible empty-list behavior for existing cases with no
  sessions.
- Conversation turn persistence now ensures/touches session metadata without
  changing the conversation response shape or crisis logic.
- Backend deterministic route, agent, and DB tests exist under `backend/tests/`.
- Frontend conversation, manual report generation, ReportPage counselor review
  workspace, history case/session listing, query-param resume, app navigation,
  SettingsPage static informational guidance, and light/dark theme support are
  implemented.
- The frontend API layer exposes `updateSessionTitle(caseId, sessionId, payload)`,
  which calls `PATCH /api/cases/{case_id}/sessions/{session_id}` with
  `{ title: string | null }`.
- HistoryPage uses a returned session title as the primary session label when
  present, shows `未命名會談` for untitled sessions, keeps `session_id` visible as
  secondary metadata, supports inline manual title edit/save/cancel/clear, and
  leaves resume/report links unchanged.
- HistoryPage trims saved titles, sends `{ title: null }` when clearing, enforces
  the 80-character title limit before calling the API, saves on Enter, cancels on
  Escape, allows only one editing row at a time, and preserves the draft after a
  failed save while showing a friendly generic error.
- Frontend durable session creation/use is implemented for create-case and
  new-session flows through `createSession(caseId, payload = {})`, using backend
  generated `session_id` values for normal frontend-created sessions.
- Selecting an existing case clears the active session without creating a new
  session; the counselor starts a durable session explicitly through the
  new-session action.
- ConversationPage uses a bounded scrollable message log, keeps the latest
  message visible above the composer, supports Enter/Shift+Enter/IME-safe input
  behavior, keeps the textarea editable while submitting, locks the send button
  while submitting, and guards duplicate submits.
- Starting a new session preserves the selected case, creates a durable backend
  session, uses the backend returned `session_id`, and clears current message and
  summary UI only after creation succeeds.
- ReportPage generated reports are transient; report text is not persisted by the
  backend or browser storage and must be regenerated after leaving or reloading
  the page.
- Crisis UI uses the backend crisis level only. Loaded summaries that only expose
  `crisis_flag` produce safe counselor-review metadata instead of inferred
  low/high risk; high-risk modal behavior is limited to backend responses with
  `crisis.crisis_level === "high"`.
- ReportPage displays the backend disclaimer prominently and includes
  summary-derived review aids for intensity trend, emotion dimensions, theme
  frequency, micro-summary timeline, and crisis occurrence. These aids are not
  objective clinical measurements.
- SettingsPage explains system purpose, safety boundaries, browser
  storage/privacy, theme preference behavior, backend-managed model/service
  configuration, and counselor review reminders. It performs no storage writes,
  exposes no provider keys or `.env` values, provides no provider/model
  selection, and adds no theme toggle beyond the shared header toggle.
- Frontend deterministic tests are implemented with Vitest, React Testing
  Library, and jsdom, using mocked API helpers and no live backend/provider/network
  calls.
- Frontend does not persist clinical message content, summaries, session
  metadata, previews, report text, crisis reasons, case notes, titles, drafts, or
  other clinical content in browser storage.
- Titles are nullable operational metadata only. The system does not create
  AI-generated titles and must not derive titles from messages, summaries, key
  statements, themes, crisis reasons, previews, reports, notes, or other
  clinical content.
- Titles and title drafts are not stored in `localStorage` or `sessionStorage`;
  browser storage policy remains unchanged.
- `localStorage` is used only for `ai-psych-theme`; `sessionStorage` may store
  only active case/session identifiers.
- Session metadata, preview text, titles, drafts, and clinical content are not
  stored in browser storage.
- GitHub Actions CI runs deterministic backend tests plus frontend test/build
  validation without live provider checks.
- MCP is not implemented.

Future intent:

- Add session deletion/archive and title search/filter when prioritized.
- Report workflow future work remains: Report Schema v2 / formal report schema
  expansion, persisted report drafts, source/evidence traceability, final PDF
  export, optional Recharts/charts, and editable counselor review workflow.
- Add report status and persisted report drafts when prioritized.
- Persist exact `crisis_level` with summaries later if exact crisis level should
  survive reload/navigation; until then, do not infer low/high from summary-level
  `crisis_flag`.
- Smarter scroll behavior can be considered later as optional UX refinement.
- Frontend should add deletion, session archive/delete, title search/filter, and
  any richer session metadata workflows when prioritized.
  Runtime/provider status may be added later if needed, but must not expose
  secrets; real provider settings UI remains out of scope unless explicitly
  designed.
- Frontend testing should add ReportPage error handling tests, optional
  Playwright/E2E later, and visual regression later if needed.
- Report Schema v2, PDF export, charts/Recharts, MCP, session archive/delete,
  title search/filter, report status/drafts, exact persisted `crisis_level`, and
  real provider settings UI remain separate future work.

## Related Context Documents

- `backend/API_CONTRACT.md` defines implemented Task 09 HTTP route behavior.
- `backend/TESTING.md` defines the desired deterministic backend testing direction.
- `docs/SAFETY_REQUIREMENTS.md` defines detailed safety behavior for agents, routes,
  reports, frontend warnings, and tests.
