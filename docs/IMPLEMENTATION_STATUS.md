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
- `summaries.crisis_level` exists as nullable per-summary metadata. Allowed
  values are `none`, `low`, `high`, or null.
- Legacy summary rows keep `crisis_level: null`; old `crisis_flag` values are
  not backfilled into `none`, `low`, or `high`.
- `crisis_level` is stored beside the `TurnSummary` JSON, not injected into the
  `TurnSummary` payload itself, and `crisis.reason` is not persisted.
- A dedicated `sessions` table exists for safe operational metadata only:
  `case_id`, `session_id`, `created_at`, `updated_at`, `last_activity_at`,
  nullable `title`, and nullable `archived_at`.
- New and legacy databases support `sessions.archived_at` through idempotent
  schema initialization/migration behavior.
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
- Archiving a session sets `sessions.archived_at`, unarchiving clears it, and
  both operations update `sessions.updated_at` without updating
  `last_activity_at`.
- Archive/unarchive preserve messages and summaries. No hard-delete session
  endpoint exists.
- Legacy message/summary-derived sessions can be renamed because the backend
  backfills or ensures a durable `sessions` row before updating.
- Session rows are linked to cases and cascade when a case is deleted.
- Existing message/summary-derived sessions are backfilled idempotently.
- Empty sessions can now exist durably through backend session creation.
- A `report_drafts` table exists for Report Schema v2 manual-input draft
  persistence. It enforces one current draft per
  `(case_id, session_id, schema_version)`, with `schema_version` fixed to
  `report_schema_v2` and default status `manual_input_started`.
- `report_drafts.id` values are UUID-like. `manual_input_json` is persisted and
  validated through `ReportManualInputV2`.
- `ai_generated_json` is populated by the backend-only Report Schema v2 AI draft
  generation slice. `counselor_edits_json` and `final_report_json` may remain
  null until future counselor review and final-report slices.
- `source_summary_ids_json` stores pointer-only source references / source
  summary IDs for v2 AI draft generation. It must not store raw prompts, raw LLM
  responses, raw messages, or crisis detector reasons.
- `generated_at` is set when v2 AI draft generation persists
  `ai_generated_json`; `reviewed_at` and `exported_at` remain future-use fields.
- Archived sessions can create and update report drafts when explicitly addressed
  by case/session ID.
- Report draft DB helpers exist: `create_or_get_report_draft`,
  `get_current_report_draft`, `get_report_draft`, and
  `update_report_manual_input`.
- `update_report_ai_generated(draft_id, ai_generated, source_refs)` exists for
  the backend-only v2 AI draft slice. It validates and persists
  `ai_generated_json`, stores pointer-only source refs / source summary IDs,
  updates status to `ai_generated`, sets `generated_at` and `updated_at`,
  preserves `manual_input_json`, and leaves `final_report_json` null.
- Session metadata must not store or expose raw messages, summaries,
  `summary_json`, `key_statement`, themes, crisis reasons, report text,
  DB-internal `round`, or latest/peak `crisis_level` aggregates.

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
- `analysis_agent.py` also exposes `generate_report_v2_ai_draft(...)` beside the
  existing v1 `generate_report(...)`. Unset or blank
  `REPORT_V2_PROVIDER_MODE` defaults to deterministic mode, which remains
  conservative, returns schema-valid pending/missing fields, and does not call a
  provider.
- `REPORT_V2_PROVIDER_MODE` exists for Report v2 generation. Allowed values are
  `deterministic` and `provider`; invalid explicit values fail closed.
- `REPORT_V2_MODEL` exists and is used only in Report v2 provider mode. When it
  is unset, provider mode falls back to `ANALYSIS_MODEL`, then the existing
  default model.
- `REPORT_V2_PROMPT_VERSION = "report_v2_prompt_001"` exists for the backend
  Report Schema v2 prompt/input builder slice.
- Backend Report v2 prompt/input builder helpers now exist. They use fixed
  curated knowledge-base excerpts and safety instructions, shape persisted
  summaries into safe provider input, bound/truncate `key_statement`, and exclude
  raw messages, crisis detector reasons, DB-internal `round`, and session title.
- Backend Report v2 provider output parsing now exists. The parser accepts a
  JSON string or dict, rejects invalid JSON and non-object JSON, validates with
  `ReportAIGeneratedV2`, rejects unknown/manual-only fields through strict schema
  validation, and rejects unsafe evidence ref notes. Parser normalization handles
  provider `source_type` and `missing_reason` variants for known
  `ReportAIGeneratedV2` fields, while unknown/manual-only fields remain
  rejected. Evidence notes are limited to pointer-only labels such as
  `summary metadata`, `manual input`, and `persisted crisis level`.
- `_call_report_v2_provider(...)` exists as the Report v2 provider boundary. It
  uses the existing Gemini-style provider infrastructure only when
  `REPORT_V2_PROVIDER_MODE=provider`; deterministic mode remains the default.
- In provider mode, `generate_report_v2_ai_draft(...)` builds the v2
  prompt/messages, calls the provider boundary, parses provider output,
  validates it as `ReportAIGeneratedV2`, and returns only validated output.
  Provider failures, invalid provider output, and invalid mode values fail
  closed.
- Existing v1 `analysis_agent.generate_report()` remains unchanged.
- Gemini JSON mode via `response_format={"type": "json_object"}` is a known
  compatibility risk.

### Backend Models

Status: partially implemented for Report Schema v2 work.

Current facts:

- `backend/models/report_schema_v2.py` defines backend Pydantic models for the
  future Report Schema v2 workflow.
- Added models include `ReportDraftV2`, `ReportManualInputV2`,
  `ReportAIGeneratedV2`, `ReportCounselorEditsV2`, `ReportFinalV2`,
  `ReportField`, `ReportEvidenceRefV2` / `ReportSourceRefV2`, and
  `ReportSafetyFlagsV2`.
- Added enums cover draft status, source type, missing reason, and risk level.
- `schema_version` is fixed to `report_schema_v2`.
- Status, source type, missing reason, and risk level accept only strict allowed
  values.
- `ReportAIGeneratedV2` and `ReportField` reject unknown fields.
- `ReportAIGeneratedV2` accepts only AI-owned draft fields and rejects
  manual-only fields. AI output cannot silently include diagnosis, medication,
  legal issues, testing scores, safety plans, formal risk level, treatment
  decisions, trauma/family history, or other counselor-owned fields.
- Missing data can be represented as null, blank-compatible values, or `敺?隡躬,
  with structured missing reasons.
- Missing or unsupported AI draft fields remain null / `敺?隡躬 /
  `not_assessed`-compatible rather than being fabricated.
- AI-generated fields do not require manual-only diagnosis, medication, legal,
  testing, trauma, family-history, or safety-plan content when absent.
- Evidence references use safe pointers such as `turn_number`, `summary_id`, and
  `note`; they do not duplicate raw message text.
- Safety flags default conservatively.
- These models are wired into backend-side `report_drafts` manual input
  persistence, manual-input API responses, backend-only deterministic v2 AI
  draft generation, the backend Report v2 prompt/input builder and provider
  parser slice, and disabled-by-default provider mode.
- Existing v1 `ConceptualizationReport`, `analysis_agent.generate_report()`, and
  `POST /api/reports/generate` behavior remain unchanged.
- Frontend ReportPage v2 manual input UI/API helpers, the v2 AI generate action,
  and `ReportV2Preview` rendering of `ai_generated` fields are implemented.
  Manual local provider smoke testing for Report v2 provider mode has been
  completed with synthetic/local data: the generate endpoint returned
  `status = ai_generated`, set `generated_at`, persisted provider-generated
  `ai_generated_json`, left `final_report_json` null, and did not persist raw
  prompts or raw provider responses. A classroom demo runbook exists at
  `docs/DEMO_RUNBOOK.md`. Prompt quality refinement, prompt/version audit
  metadata, counselor review/final report workflow, print-friendly/PDF export,
  and synthetic demo data remain future work.
- Report v2 safety/privacy constraints remain unchanged: no browser storage of
  generated report text or `ai_generated` JSON, no persisted raw prompts or raw
  provider responses, no raw message use, no crisis detector reason use, no API
  keys/secrets in route responses, no diagnosis automation, no medication
  advice, no formal risk-level automation, no safety plan generation, no
  treatment plan automation, no PDF export, and v1 behavior remains unchanged.
  Fixed knowledge-base excerpts are reference and writing guidance only, not
  case facts.

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
- `POST /api/cases/{case_id}/sessions/{session_id}/archive` sets nullable
  operational `archived_at` metadata, updates `updated_at`, does not update
  `last_activity_at`, preserves messages and summaries, returns 404 for missing
  cases or sessions, returns generic non-leaking 500 responses on helper/DB
  failures, and returns the safe session metadata shape.
- `POST /api/cases/{case_id}/sessions/{session_id}/unarchive` clears
  `archived_at`, updates `updated_at`, does not update `last_activity_at`,
  preserves messages and summaries, returns 404 for missing cases or sessions,
  returns generic non-leaking 500 responses on helper/DB failures, and returns
  the safe session metadata shape.
- `GET /api/cases/{case_id}/sessions` remains backward-compatible and includes
  active explicit sessions plus active legacy sessions derived from existing
  messages and summaries. Legacy/backfilled sessions return `title: null`.
- `GET /api/cases/{case_id}/sessions` excludes archived sessions by default.
  `GET /api/cases/{case_id}/sessions?include_archived=true` returns active plus
  archived sessions.
- Existing cases with no explicit or derived sessions still return `[]`.
- `POST /api/conversation/turn` ensures/touches a session row while preserving
  the existing conversation response shape and crisis logic.
- `POST /api/conversation/turn` persists the exact backend
  `crisis.crisis_level` value into the summary row.
- `GET /api/cases/{case_id}/sessions/{session_id}/summaries` exposes top-level
  nullable `crisis_level` on each returned summary row.
- `summaries.crisis_level` accepts only `none`, `low`, `high`, or null. Legacy
  rows remain null and are not inferred from old `crisis_flag` values.
- Session metadata responses expose only metadata fields and do not expose raw
  messages, summaries, raw `summary_json`, summary `key_statement`, themes,
  crisis reasons, report text, DB-internal `round`, or latest/peak
  `crisis_level` aggregates.
- `GET /api/cases/{case_id}/sessions` response shape is unchanged; no latest or
  peak `crisis_level` session aggregate was added.
- Report generation behavior is unchanged.
- Report draft endpoints return `ReportDraftV2`. They support loading the
  current draft, creating or returning the one current draft, updating
  `manual_input_json`, backend-only deterministic v2 AI draft generation, and
  disabled-by-default provider mode through backend configuration.
- `POST /api/report-drafts/{draft_id}/generate` loads the draft, requires at
  least one persisted session summary, returns 422 when no summaries exist,
  validates/generates `ReportAIGeneratedV2`, persists `ai_generated_json`,
  updates status to `ai_generated`, sets `generated_at` and `updated_at`,
  preserves `manual_input_json`, leaves `final_report_json` null, and returns
  `ReportDraftV2`.
- Report draft routes return 404 for missing case/session/draft, 422 for invalid
  manual input or missing summaries, and generic non-leaking 500 responses for
  invalid agent output or helper/DB failures.
- Report draft persistence is backend-side clinical content and must remain
  protected. It does not store raw provider prompts, raw LLM responses, API
  keys/secrets, raw message text, or crisis reasons.
- Existing `POST /api/report-drafts/{draft_id}/generate` default behavior
  remains deterministic and conservative. Provider mode is available only when
  explicitly enabled through `REPORT_V2_PROVIDER_MODE=provider`; provider
  failures or invalid provider output return generic non-leaking errors and do
  not overwrite existing `ai_generated_json`.

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
- The frontend API layer exposes
  `getCurrentReportDraft(caseId, sessionId)`,
  `createReportDraft(caseId, sessionId, payload = {})`, and
  `updateReportDraftManualInput(draftId, payload)`. These helpers call the
  backend Report v2 draft endpoints.
- The frontend API layer exposes `generateReportDraftV2(draftId)`, which calls
  `POST /api/report-drafts/{draft_id}/generate`, sends no payload, and returns
  the updated `ReportDraftV2`.
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
- ReportPage includes a Report Schema v2 manual input panel above the existing
  v1 transient report generation section. The v2 panel is for future
  five-section report manual data preparation; the v1 report generation section
  remains visually separate and behaviorally unchanged.
- The v2 panel loads the current report draft when one exists. If no draft
  exists, it shows `撠撱箇? v2 ??鞈??阮` and requires the counselor to
  explicitly create a draft. Drafts are not auto-created on page load.
- ReportPage saves v2 manual input only through backend `PATCH`; v2 save does
  not call `generateReport`, and the v1 generate button still calls only the
  existing v1 `generateReport`.
- ReportPage includes a separate `v2 AI ?阮?Ｙ?` action card between the manual
  input panel and the v2 preview. It is visually and behaviorally separate from
  v1 transient report generation, blocks generation when manual input has
  unsaved changes, disables generation while saving or generating, updates local
  `reportDraft` from the backend response, shows
  `?喳??閬?蝑?隢?閬??賜??v2 AI ?阮` for insufficient-summary 422 responses, and
  provides a lightweight link back to the conversation workspace when
  case/session IDs are available.
- The first frontend v2 manual input slice supports these optional fields:
  `???交?`, `??甈⊥`, `頧?靘?`, `撟湧翩嚗批`, `?瑟平嚗停摮貊??,
  `憍宏嚗振摨剔??, `??撠?憿??圾嚗蜓閮渲??,
  `敹?皜祇?嚗﹛?????, `甇??憸券閰摯?酉`, and `摰閮`.
- `frontend/src/components/ReportV2Preview.jsx` renders a read-only Report
  Schema v2 five-section preview from the already loaded draft state, including
  inline `draft.ai_generated` fields when present. It does not call APIs, does
  not call `generateReport`, and does not generate new content.
- ReportPage mounts `ReportV2Preview` below the v2 manual input panel. If no
  draft exists, it shows `??遣蝡?v2 ?阮敺??舫?閬窯. If a draft exists, it
  renders all five authoritative sections: `銝??祈???銝餉迄`,
  `鈭瘜?隡啗?閫撖, `銝???隡躬, `??隢?????璁艙?, and
  `鈭◢?芾?隡躬.
- The v2 preview maps current manual input fields into the template, displays
  missing manual fields as `敺?隡躬, displays future AI/counselor-owned fields as
  `甇斗?雿??芯? AI ?阮?垣?葦鋆?`, and never displays missing risk fields as
  `?⊿◢?注.
- AI-generated fields are labeled `AI ?阮嚗?隢桀?撣怠祟?常. Manual fields remain
  counselor-owned and are not overwritten. Manual `client_understanding` takes
  precedence; when manual text exists, AI client understanding appears as
  `AI 鋆??阮`. Evidence refs, when shown, are turn-number-only. The preview
  does not render raw summaries, raw messages, key statements, crisis reasons,
  provider output, AI formal risk level, or AI safety plan.
- HistoryPage lists cases from the backend and can lazily expand multiple cases
  to show backend session metadata, including empty durable sessions when the
  backend returns them, plus resume links and report links.
- HistoryPage displays `session.title` as the primary session label when present.
  Untitled sessions display the fallback `?芸??隢, while `session_id` remains
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
- HistoryPage hides archived sessions by default, provides an archive control
  with confirmation, provides a `憿舐內撌脣?摮?隢 toggle, shows an `撌脣?摮 badge
  for archived sessions, allows visible archived sessions to be unarchived, and
  keeps visible archived sessions resumable/reportable and renameable.
- No hard delete UI exists for sessions.
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
  summaries, report text, report drafts, manual input, crisis levels, crisis
  reasons, and case notes are not persisted to browser storage.
- `sessionStorage` may store only active case/session identifiers.
- Session metadata, preview text, titles, drafts, and clinical content are not
  persisted to browser storage.
- Archive state and other session metadata are not persisted to browser storage.
- No title is stored in browser storage, no AI-generated titles exist, and the
  frontend does not derive titles from raw messages, summaries, key statements,
  themes, crisis reasons, previews, reports, notes, or other clinical content.
- Title drafts are counselor-entered operational metadata only and are not stored
  in `localStorage` or `sessionStorage`.
- Crisis UI uses backend `crisis_level` only; the red banner is shown only for
  `crisis_level == "high"`.
- ConversationPage restores persisted crisis display from loaded session summary
  rows by reading each row's top-level nullable `crisis_level`.
- Restored persisted `high` sets high-risk page metadata/banner, restored
  persisted `low` sets ordinary low-risk metadata, restored persisted `none`
  sets the default no-crisis wording, and precedence is `high > low > none`.
- The default/no-crisis wording is ??菜葫?啣璈?
- If loaded summaries contain `crisis_flag` but no persisted `crisis_level`, the
  frontend shows safe counselor-review metadata such as
  ???唳?閬??望?閮餉?嚗?隢桀?撣恍??唳炎閬?and does not infer low/high risk from
  `summary.crisis_flag`.
- The high-risk modal/dialog opens only when a backend response includes
  `crisis.crisis_level === "high"`; dismissing it does not remove high-risk page
  metadata, and low/default crisis states do not open the modal.
- Restored persisted high-risk state from loaded summaries does not auto-open or
  replay the high-risk modal.
- PDF export, hard delete/session data-retention workflow, title search/filter, richer session
  metadata, optional charting library integration, runtime/provider status
  endpoint if needed, and MCP integration remain future work.
- Any future runtime/provider status endpoint must avoid leaking secrets. Real
  provider settings UI remains out of scope unless explicitly designed.
- Frontend v2 AI draft generation integration now exists through the separate
  `v2 AI ?阮?Ｙ?` action card and `generateReportDraftV2(draftId)`.
  Manual local provider smoke testing has been completed for Report v2 provider
  mode. Prompt quality refinement, editable counselor final report workflow,
  Recharts integration, and PDF export have not been implemented for the report
  workspace.

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
  compatibility, archive/unarchive schema and migration behavior,
  archive/unarchive helper behavior, sorting, no-leak metadata, message/summary
  preservation, and cascade behavior.
- Backend route tests cover POST session creation, idempotency, missing case, GET
  inclusion, default archived-session exclusion, `include_archived=true`
  inclusion, archive/unarchive behavior, safe metadata, conversation
  ensure/touch behavior, and generic non-leaking failures.
- Backend tests cover persisted summary `crisis_level` schema creation, legacy
  migration, allowed values, null old rows, invalid level rejection, persistence
  from a mocked crisis detector, and summary API exposure.
- Backend tests also confirm crisis reasons and internal fields are not exposed
  through summary metadata.
- Backend tests cover Report Schema v2 models, including valid minimal drafts,
  fixed schema version, missing data behavior, enum validation, evidence
  references, manual-only separation from AI-generated fields, conservative
  safety-flag defaults, JSON-compatible serialization, invalid values, unknown
  field rejection, and rejection of manual-only fields in `ReportAIGeneratedV2`.
- Backend tests cover Report Schema v2 draft persistence, including table
  creation, create/get current draft, one-current-draft behavior, UUID-like IDs,
  default status, fixed schema version, manual input validation, partial/empty
  manual input, invalid manual input, timestamp updates, v2 AI generated JSON
  persistence, status transition to `ai_generated`, `generated_at`, manual input
  preservation, final report remaining null, safe pointer-only source refs,
  archived session support, route 404/422/500 behavior, invalid v2 agent output,
  helper/DB failure behavior, and v1 report route preservation.
- Backend tests cover the Report v2 prompt payload safety/source shaping, message
  safety instructions, valid provider parser output,
  invalid/manual-only/unsafe parser rejection, provider boundary behavior,
  unset/default deterministic mode, explicit deterministic mode, provider mode
  with monkeypatched provider, model fallback behavior, provider exception,
  invalid mode, route-level provider success/failure behavior, no overwrite on
  provider failure, no-summary provider non-call behavior, v1 report
  preservation, and deterministic v2 generation preservation.
- Backend route-test DB isolation was improved to reduce Windows SQLite temp/WAL
  lock flakiness.
- Current frontend coverage includes header/theme toggle behavior, safe theme
  localStorage usage, the `createSession` API helper contract, ConversationPage
  input behavior, crisis modal/fallback behavior, create-case durable session
  flow, new-session durable flow, createSession failure handling, query-param
  resume no-create behavior, restored persisted crisis display for high, low,
  none, legacy fallback, high-over-low, and low-over-none precedence, live high
  modal behavior, ReportPage missing `sessionId` handling, manual report
  generation, disclaimer display, transient report note, ReportPage v2 current
  draft load, missing-draft create state, Create Draft flow, editing/saving
  manual input, save success/error behavior, read-only v2 preview prerequisite
  state, five-section headings, manual field mapping, missing-data placeholders,
  future placeholder wording, risk missing behavior, save-to-preview updates,
  v1/v2 separation, v2 action card behavior, unsaved-input blocking, v2 422 and
  generic generation errors, regeneration label behavior, preview AI mapping,
  safe turn-number-only evidence refs, forbidden AI risk/safety fields, storage
  safety, back-to-conversation link preservation, API helper path/payload
  contracts including `updateSessionTitle`, `getCurrentReportDraft`,
  `createReportDraft`, `updateReportDraftManualInput`, and
  `generateReportDraftV2`, HistoryPage
  list/empty/error/session-expansion
  behavior, empty durable session rendering, HistoryPage title/fallback
  rendering, rename controls, save, clear, cancel, keyboard behavior, validation,
  error handling, single-row editing, archive confirmation, show-archived toggle,
  archived badge, unarchive behavior, archived-session link preservation,
  rename compatibility for visible archived sessions, resume/report link preservation,
  SettingsPage rendering, absence of secret/input controls, no API helper calls
  from SettingsPage, no clinical sentinel persistence, no new storage keys, and
  browser storage safety regressions.
- Browser storage safety tests confirm clinical message content, summaries,
  generated report text, `ai_generated` JSON, report drafts, manual input,
  crisis levels, crisis reasons, case notes, and other clinical content are not
  persisted to browser storage.
- Frontend storage expectations are explicit: `localStorage` is used only for
  `ai-psych-theme`, and `sessionStorage` may store only active case/session
  identifiers.
- Remaining future frontend testing work includes counselor final report
  workflow and PDF export coverage when those features are implemented, plus
  optional Playwright/E2E and visual regression later if needed.
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
| Task 11 conversation page | implemented | Integrated with backend conversation API; stabilized bounded chat layout, submit behavior, query-param resume, durable backend session creation for create-case/new-session flows, backend-level-only crisis UI behavior, and restored persisted `crisis_level` display from loaded summaries. |
| Task 12 visualization components | partial | ReportPage has summary-derived review aids; optional Recharts/charts remain future work. |
| Task 13 report page | partial | Counselor review workspace exists with manual transient v1 generation, prominent backend disclaimer, transient-report note, summary-derived review aids, a visually separate Report Schema v2 manual input panel, a separate v2 AI draft generation action card, and a read-only v2 five-section preview that renders manual input plus `ai_generated` fields. Backend Report Schema v2 models, backend `report_drafts` persistence, backend manual input API, backend-only deterministic v2 AI draft generation endpoint, backend v2 prompt/input builder, backend v2 provider parser, disabled-by-default provider mode, frontend draft API helpers including `generateReportDraftV2`, completed manual local provider smoke testing, and the classroom demo runbook exist. Synthetic demo data, prompt quality refinement, prompt/version audit metadata, counselor review/final report workflow, print-friendly/PDF export, and frontend provider-mode behavior changes remain future work. |
| Task 14 history page | partial | Lists backend cases and session metadata, including empty durable sessions returned by the backend; displays session titles when present with an untitled fallback, keeps session IDs visible as secondary metadata, supports inline manual title rename/clear, and implements archive-only session lifecycle controls. Hard delete, title search/filter, labels, and richer session metadata remain future work. |
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
  Current `backend/.env.example` uses `gemini-2.5-flash-lite` and
  `gemini-2.5-flash`, keeps `REPORT_V2_PROVIDER_MODE=deterministic` by default,
  and documents optional `REPORT_V2_MODEL` fallback behavior for provider mode.
- README still references the generic default provider path more than the current
  Groq/Gemini split.
- Deterministic backend tests now exist under `backend/tests/`, and deterministic
  frontend tests now cover core UI/API/storage behavior; legacy live-provider
  scripts live under `backend/manual_checks/` outside the default deterministic
  test suite.

## Recommended Implementation Order

1. Keep context documents accurate as work proceeds.
2. Keep deterministic backend tests current as route and agent behavior evolves.
3. Complete remaining frontend workflows: hard delete/data-retention policy,
   title search/filter, PDF export, optional charts/Recharts, editable/final
   report review workflow, report status, optional HistoryPage crisis-level
   display, and optional runtime/provider status if needed without leaking
   secrets.
4. Keep ReportPage frontend tests current as final-report and export workflows
   are added.
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
- Backend archive-only session lifecycle is implemented through
  `POST /api/cases/{case_id}/sessions/{session_id}/archive` and
  `POST /api/cases/{case_id}/sessions/{session_id}/unarchive`. The sessions
  table includes nullable `archived_at`; archive sets it, unarchive clears it,
  both operations update `updated_at` without touching `last_activity_at`, and
  messages/summaries are preserved. No hard-delete session endpoint exists.
- Session listing includes explicit sessions plus legacy derived sessions while
  preserving backward-compatible empty-list behavior for existing cases with no
  sessions. Archived sessions are excluded by default and included only when
  `include_archived=true`.
- Conversation turn persistence now ensures/touches session metadata without
  changing the conversation response shape or crisis logic, and persists the
  exact backend `crisis.crisis_level` into each summary row as nullable
  metadata.
- Summary rows expose top-level nullable `crisis_level`; allowed values are
  `none`, `low`, `high`, or null. Legacy rows remain null and are not backfilled
  from old `crisis_flag` values.
- `crisis_level` is not injected into `TurnSummary` JSON, and `crisis.reason` is
  not persisted.
- Backend deterministic route, agent, DB, and Report Schema v2 model tests exist
  under `backend/tests/`.
- Backend-side Report Schema v2 `report_drafts` manual input persistence and API
  endpoints exist. One current draft is enforced per
  `(case_id, session_id, schema_version)`, manual input is validated through
  `ReportManualInputV2`, and not-yet-generated sections may remain null.
- Backend-only Report Schema v2 AI draft generation exists through
  `generate_report_v2_ai_draft(...)` and
  `POST /api/report-drafts/{draft_id}/generate`. Its default deterministic mode
  is conservative, does not call a provider, requires at least one persisted
  summary, persists validated `ReportAIGeneratedV2` to `ai_generated_json`,
  stores pointer-only source refs / source summary IDs, updates status to
  `ai_generated`, sets `generated_at` and `updated_at`, preserves
  `manual_input_json`, and leaves `final_report_json` null.
- Disabled-by-default Report v2 provider mode exists. `REPORT_V2_PROVIDER_MODE`
  allows `deterministic` or `provider`; unset or blank defaults to
  `deterministic`, and invalid explicit values fail closed. `REPORT_V2_MODEL` is
  used only in provider mode and falls back to `ANALYSIS_MODEL`, then the
  existing default model.
- Backend Report Schema v2 prompt/input builder helpers exist with
  `REPORT_V2_PROMPT_VERSION = "report_v2_prompt_001"`. They use fixed curated
  knowledge-base excerpts and safety instructions, shape summaries into safe
  provider input, bound/truncate `key_statement`, and exclude raw messages,
  crisis detector reasons, DB-internal `round`, and session title.
- Backend Report Schema v2 provider output parsing exists for provider mode. It
  accepts JSON strings or dicts; rejects invalid JSON, non-object JSON,
  manual-only/unknown fields, and unsafe evidence notes; validates with
  `ReportAIGeneratedV2`; normalizes provider `source_type` and
  `missing_reason` variants for known `ReportAIGeneratedV2` fields; and limits
  evidence notes to pointer-only labels such as `summary metadata`,
  `manual input`, and `persisted crisis level`. Unknown/manual-only fields
  remain rejected.
- `_call_report_v2_provider(...)` exists as a Gemini-style boundary used only
  when provider mode is explicitly enabled. In provider mode,
  `generate_report_v2_ai_draft(...)` builds v2 prompt/messages, calls the
  boundary, parses provider output, validates it as `ReportAIGeneratedV2`, and
  returns only validated output. Provider failures, invalid provider output, and
  invalid mode values fail closed; provider failures do not persist a
  conservative empty fallback as success and do not overwrite existing
  `ai_generated_json`. Raw prompts and raw provider responses are not persisted.
- Local Report v2 provider smoke testing has passed with synthetic data after
  provider field metadata normalization. The observed successful checks included
  `POST /api/report-drafts/{draft_id}/generate` returning
  `status = ai_generated`, `generated_at` being set, provider-generated draft
  fields appearing in `ai_generated`, SQLite returning `ai_generated|1|1|1`,
  `report_drafts` containing `ai_generated_json`, `final_report_json` remaining
  null, no raw prompt/raw response/provider-response columns existing on
  `report_drafts`, and frontend/browser rendering Chinese correctly despite
  possible PowerShell mojibake.
- `ReportAIGeneratedV2` and `ReportField` reject unknown fields, so AI output
  cannot silently include manual-only diagnosis, medication, legal, testing,
  safety-plan, formal-risk, treatment-decision, trauma/family-history, or
  similar counselor-owned fields.
- Frontend conversation, manual report generation, ReportPage counselor review
  workspace, history case/session listing, query-param resume, app navigation,
  SettingsPage static informational guidance, and light/dark theme support are
  implemented.
- The frontend API layer exposes `updateSessionTitle(caseId, sessionId, payload)`,
  which calls `PATCH /api/cases/{case_id}/sessions/{session_id}` with
  `{ title: string | null }`.
- The frontend API layer exposes
  `getCurrentReportDraft(caseId, sessionId)`,
  `createReportDraft(caseId, sessionId, payload = {})`, and
  `updateReportDraftManualInput(draftId, payload)` for the backend Report v2
  draft endpoints.
- HistoryPage uses a returned session title as the primary session label when
  present, shows `?芸??隢 for untitled sessions, keeps `session_id` visible as
  secondary metadata, supports inline manual title edit/save/cancel/clear, and
  leaves resume/report links unchanged.
- HistoryPage trims saved titles, sends `{ title: null }` when clearing, enforces
  the 80-character title limit before calling the API, saves on Enter, cancels on
  Escape, allows only one editing row at a time, and preserves the draft after a
  failed save while showing a friendly generic error.
- HistoryPage hides archived sessions by default, archives only after
  confirmation, can show archived sessions through the `憿舐內撌脣?摮?隢 toggle,
  marks archived sessions with an `撌脣?摮 badge, can unarchive them, keeps
  visible archived sessions resumable/reportable, and allows rename/clear on
  visible archived sessions.
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
- Current v1 ReportPage generated reports are transient; v1 report text is not
  persisted by the browser storage and must be regenerated after leaving or
  reloading the page. ReportPage also includes a v2 manual input panel above the
  v1 section. The v2 panel loads an existing current draft, requires explicit
  Create Draft when none exists, does not auto-create drafts on page load, and
  saves manual input only through backend `PATCH`.
- Crisis UI uses backend crisis level only. ConversationPage restores persisted
  high, low, and none states from loaded summary rows' top-level nullable
  `crisis_level`, using precedence `high > low > none`. Loaded summaries that
  only expose `crisis_flag` produce safe counselor-review metadata instead of
  inferred low/high risk. High-risk modal behavior is limited to live backend
  responses with `crisis.crisis_level === "high"`; restored persisted high-risk
  state does not auto-open or replay the modal, and dismissing the live modal
  does not remove page metadata.
- ReportPage displays the backend disclaimer prominently and includes
  summary-derived review aids for intensity trend, emotion dimensions, theme
  frequency, micro-summary timeline, and crisis occurrence. These aids are not
  objective clinical measurements.
- The v2 manual input panel currently supports optional fields for session date,
  session count, referral source, age/gender, occupation/school status,
  marital/family status, client understanding/chief-complaint supplement,
  testing/assessment supplement, formal risk assessment notes, and safety plan.
- ReportPage includes `ReportV2Preview`, a read-only client-side preview from
  loaded draft state. It renders all five authoritative sections,
  shows `??遣蝡?v2 ?阮敺??舫?閬窯 when no draft exists, uses `敺?隡躬 for
  missing manual fields, uses `甇斗?雿??芯? AI ?阮?垣?葦鋆?` for future
  AI/counselor-owned fields, renders `draft.ai_generated` fields inline with
  `AI ?阮嚗?隢桀?撣怠祟?常 labels, and does not infer facts, risk, or crisis
  status.
- v1/v2 report behavior coexists: v2 save does not call `generateReport`, the
  v1 generate button calls only existing v1 `generateReport`, v2 generate calls
  only `generateReportDraftV2`, v2 generated data does not populate v1 report
  state, and v1 report generation does not alter `reportDraft`. No counselor
  final report workflow or PDF export exists yet. The v2 preview does not call
  `generateReport`.
- SettingsPage explains system purpose, safety boundaries, browser
  storage/privacy, theme preference behavior, backend-managed model/service
  configuration, and counselor review reminders. It performs no storage writes,
  exposes no provider keys or `.env` values, provides no provider/model
  selection, and adds no theme toggle beyond the shared header toggle.
- Frontend deterministic tests are implemented with Vitest, React Testing
  Library, and jsdom, using mocked API helpers and no live backend/provider/network
  calls.
- Frontend does not persist clinical message content, summaries, session
  metadata, previews, generated report text, `ai_generated` JSON, report drafts,
  manual input, crisis levels, crisis reasons, case notes, titles, drafts, or
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
- Archive state is not stored in browser storage.
- GitHub Actions CI runs deterministic backend tests plus frontend test/build
  validation without live provider checks.
- MCP is not implemented.

Future intent:

- Hard delete remains future work and requires a separate data-retention/privacy
  policy. Bulk archive/delete remains out of scope.
- Add title search/filter when prioritized.
- Report Schema v2 backend Pydantic models now exist under
  `backend/models/report_schema_v2.py`, and a planning artifact exists at
  `docs/REPORT_SCHEMA_V2_PLAN.md`. Backend manual input API,
  `report_drafts` persistence, and backend-only deterministic v2 AI draft
  generation now exist. Backend v2 prompt/input builder helpers, provider output
  parser, disabled-by-default provider mode, and a provider boundary also exist.
  The frontend ReportPage v2 manual input,
  `generateReportDraftV2`, separate v2 generation action card, and preview
  rendering of `ai_generated` fields are implemented and unchanged. Manual local
  provider smoke testing has been completed with synthetic/local data. A
  classroom demo runbook exists at `docs/DEMO_RUNBOOK.md`. Remaining report
  workflow future work includes synthetic demo data, prompt quality refinement,
  prompt/version audit metadata, counselor review/final report workflow,
  print-friendly/PDF export, and optional Recharts/charts.
- Add report status UI and counselor review/final-report workflow when
  prioritized.
- Optional latest/peak session `crisis_level` aggregate remains future work.
- HistoryPage crisis-level display remains future work, if desired.
- Smarter scroll behavior can be considered later as optional UX refinement.
- Frontend should add hard delete only after a separate data-retention/privacy
  policy, plus title search/filter and any richer session metadata workflows
  when prioritized.
  Runtime/provider status may be added later if needed, but must not expose
  secrets; real provider settings UI remains out of scope unless explicitly
  designed.
- Frontend testing should add coverage for counselor final report workflow and
  PDF export when those features are implemented, plus optional Playwright/E2E
  later and visual regression later if needed.
- Synthetic demo data, prompt quality refinement, prompt/version storage or
  audit metadata, print-friendly/PDF export, charts/Recharts, MCP, hard delete,
  title search/filter, report status UI, counselor
  review/final-report workflow, latest/peak crisis aggregates, and real provider
  settings UI remain separate future work. Frontend behavior changes are not
  part of the completed backend provider-mode slice.

## Related Context Documents

- `backend/API_CONTRACT.md` defines implemented Task 09 HTTP route behavior.
- `backend/TESTING.md` defines the desired deterministic backend testing direction.
- `docs/SAFETY_REQUIREMENTS.md` defines detailed safety behavior for agents, routes,
  reports, frontend warnings, and tests.
