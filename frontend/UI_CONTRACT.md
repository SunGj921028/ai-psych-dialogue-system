# Frontend UI Contract

This document defines current and intended frontend behavior. It should be kept
aligned with the implemented React app and the backend API contract.

Safety-sensitive UI behavior, especially crisis warnings and report disclaimers,
must follow `docs/SAFETY_REQUIREMENTS.md`.

## Current Frontend Status

Current reality:

- The frontend is a React + Vite application.
- React Router is configured in `frontend/src/App.jsx`.
- Pages exist for:
  - `/` via `ConversationPage`
  - `/report/:caseId` via `ReportPage`
  - `/history` via `HistoryPage`
  - `/settings` via `SettingsPage`
- ConversationPage is integrated with the backend API for case setup,
  conversation turns, assistant messages, summaries, and crisis status.
- `frontend/src/api/client.js` exposes `createSession(caseId, payload = {})`,
  which calls `POST /api/cases/{case_id}/sessions`.
- Normal frontend-created sessions omit `session_id` and use the backend returned
  `session_id`.
- `frontend/src/api/client.js` exposes
  `updateSessionTitle(caseId, sessionId, payload)`, which calls
  `PATCH /api/cases/{case_id}/sessions/{session_id}` with
  `{ title: string | null }`.
- The frontend API layer exposes archive/unarchive helpers that call
  `POST /api/cases/{case_id}/sessions/{session_id}/archive` and
  `POST /api/cases/{case_id}/sessions/{session_id}/unarchive`.
- `frontend/src/api/client.js` exposes
  `getCurrentReportDraft(caseId, sessionId)`,
  `createReportDraft(caseId, sessionId, payload = {})`, and
  `updateReportDraftManualInput(draftId, payload)`. These helpers call the
  backend Report v2 draft endpoints.
- `frontend/src/api/client.js` exposes `generateReportDraftV2(draftId)`, which
  calls `POST /api/report-drafts/{draft_id}/generate`, sends no payload, and
  returns the updated `ReportDraftV2`.
- ReportPage acts as a counselor review workspace integrated with the backend
  API. Report generation remains manual-only.
- ReportPage displays the backend-supplied fixed disclaimer prominently.
- ReportPage places `會談整理輔助` before the v2 report draft workflow and shows
  the guidance copy `建議先檢視本區整理，再建立或產生 v2 報告草稿。`.
- ReportPage includes summary review aids derived from loaded summaries: emotion
  intensity trend, emotion dimension average/latest snapshot, theme frequency
  chips, micro-summary timeline, and crisis occurrence indicator from existing
  backend data.
- The emotion dimension average review aid includes a compact Recharts radar
  chart. It uses the existing `getEmotionDimensionAverages(sortedSummaries)`
  derived data, renders average emotion dimension scores on a fixed `0-10`
  scale, and keeps the existing text/bar overview visible as fallback.
- The radar chart copy states
  `視覺化僅供諮商師審閱微摘要趨勢，非正式量表或診斷。`, and its accessible region
  label is `情緒面向雷達圖，顯示本會談微摘要的平均分布`.
- ReportPage review aids are counselor-facing context only and are not objective
  clinical measurements. The radar chart is a visual aid only and is not a
  formal assessment, scale, diagnosis, or risk evaluation.
- ReportPage groups the Report Schema v2 manual input panel, v2 generation
  action, and v2 preview under `v2 報告草稿`.
- The existing v1 transient report generation section appears lower on the page
  and is labeled `舊版 v1 暫存報告`.
- The v2 panel loads the current report draft when one exists. If no draft
  exists, it shows `尚未建立 v2 手動資料草稿` and requires explicit Create Draft.
- Drafts are not auto-created on page load.
- Manual input is saved only through backend `PATCH`.
- ReportPage includes a separate `v2 AI 草稿產生` action card between the manual
  input panel and the v2 preview. It is visually and behaviorally separate from
  v1 transient report generation, blocks generation when manual input has
  unsaved changes, disables generation while saving or generating, updates local
  `reportDraft` from the backend response, shows
  `至少需要一筆會談摘要才能產生 v2 AI 草稿` for insufficient-summary 422 responses, and
  provides a lightweight link back to the conversation workspace when
  case/session IDs are available.
- The first v2 manual input slice supports optional fields for `會談日期`,
  `會談次數`, `轉介來源`, `年齡／性別`, `職業／就學狀態`,
  `婚姻／家庭狀態`, `個案對問題的理解／主訴補充`,
  `心理測驗／衡鑑資料補充`, `正式風險評估備註`, and `安全計畫`.
- `frontend/src/components/ReportV2Preview.jsx` exists and renders a read-only
  simplified Report Schema v2 preview from loaded draft state, including inline
  `draft.ai_generated` fields when present.
- ReportPage mounts the v2 preview below the v2 generation card. If no draft
  exists, the preview shows `需先建立 v2 草稿後才可預覽`. The main preview focuses
  on demo-useful fields and intentionally hides `正式風險評估備註`, `晤談觀察`,
  `症狀與功能影響`, `防衛機制`, and `內在衝突`; this does not change schema, API,
  or backend behavior.
- The v2 preview maps current manual input fields into the template, displays
  missing manual fields as `待評估`, displays future AI/counselor-owned fields as
  `此欄位待未來 AI 草稿或諮商師補充`, and never displays missing risk fields as
  `無風險`.
- AI-generated fields are labeled `AI 草稿，需諮商師審閱`. Manual fields remain
  counselor-owned and are not overwritten. Manual `client_understanding` remains
  primary; AI client understanding appears only as supplemental draft text
  requiring counselor review. `crisis_language_summary` remains visible.
  Manual `safety_plan` renders only when provided and is labeled
  counselor/manual. Evidence refs, when shown, are turn-number-only. The preview
  does not render raw summaries, raw messages, key statements, crisis reasons,
  provider output, AI formal risk level, or AI safety plan.
- The v2 preview does not call APIs, does not call `generateReport`, and does
  not generate content.
- v1/v2 report behavior is intentionally separate: v2 save does not call
  `generateReport`, v2 generate calls only `generateReportDraftV2`, v2 generated
  data does not populate v1 report state, v1 report generation does not alter
  `reportDraft`, the v2 preview does not call `generateReport`, and the v1
  generate button still only calls existing v1 `generateReport`.
- HistoryPage lists cases from the backend and can lazily expand multiple cases
  to show backend session metadata.
- HistoryPage displays `session.title` as the primary session label when present.
  Untitled sessions display `未命名會談`, and `session_id` remains visible as
  secondary metadata.
- HistoryPage supports inline session title editing on one session row at a time.
  A session row includes an edit control, input, Save, Cancel, and Clear title
  action while editing.
- Save sends the trimmed title, Clear title sends `{ title: null }`, Enter saves,
  and Escape cancels.
- Session titles are limited to 80 characters. Over-length titles show validation
  and do not call the API.
- Failed saves show a friendly generic error and preserve the draft.
- HistoryPage hides archived sessions by default.
- HistoryPage provides an archive control with confirmation.
- HistoryPage provides a `顯示已封存會談` toggle.
- Archived sessions display an `已封存` badge when shown.
- Archived sessions can be unarchived.
- Archived sessions remain resumable and reportable when explicitly shown.
- Rename/clear remains available for visible archived sessions.
- No hard delete UI exists for sessions.
- HistoryPage resume links use `/?caseId={caseId}&sessionId={sessionId}`.
- HistoryPage report links use `/report/{caseId}?sessionId={sessionId}`.
- SettingsPage is implemented as a static counselor-facing informational page.
  It explains system purpose, safety boundaries, browser storage/privacy, theme
  preference behavior, backend-managed model/service configuration, and
  counselor review reminders.
- SettingsPage states that the system is counseling documentation support only,
  does not provide diagnosis, does not generate formal treatment plans, does not
  provide medication or dosage advice, is not an emergency service replacement,
  and leaves the counselor as final reviewer and decision-maker.
- SettingsPage performs no storage writes, exposes no API keys or `.env` values,
  includes no provider/model selection controls, and does not add a second theme
  toggle.
- ConversationPage supports query-param resume, and query params take precedence
  over stale `sessionStorage` identifiers and do not create a new session.
- ConversationPage create-case flow calls `createCase`, then
  `createSession(newCase.id)`, and uses the backend returned `session_id`.
- The new-session action calls `createSession(activeCaseId)` and uses the
  backend returned `session_id`.
- Old messages and summaries are cleared only after durable session creation
  succeeds.
- Selecting an existing case does not automatically create a session; it clears
  the active session and waits for the counselor to click the new-session action.
- Send-turn payload shape is unchanged, and the backend ensures/touches session
  rows.
- ConversationPage uses a bounded, scrollable message log. The message area
  should not grow the whole page awkwardly with each turn, and the latest message
  should remain visible above the composer.
- ConversationPage input behavior is stabilized: Enter submits, Shift+Enter
  inserts a newline, IME composing Enter does not submit, the textarea remains
  editable while submitting, the send button is locked while submitting, and
  duplicate submits are guarded.
- ReportPage back-to-conversation links preserve active case/session IDs.
- The shared header includes navigation and a theme toggle.
- Light/dark theme support exists and stores only the theme preference under the
  `ai-psych-theme` localStorage key.
- The frontend does not store clinical message content, summaries, session
  metadata, previews, report text, report drafts, manual input, crisis levels,
  crisis reasons, case notes, titles, drafts, or other clinical content in
  browser storage.
- Session titles are nullable operational metadata only. The frontend does not
  generate titles with AI and must not derive titles from raw messages,
  summaries, key statements, themes, crisis reasons, previews, reports, notes,
  or other clinical content.
- Titles and title drafts are counselor-entered operational metadata only and are
  not stored in `localStorage` or `sessionStorage`.
- `localStorage` is used only for `ai-psych-theme`.
- `sessionStorage` may store only active case/session identifiers.
- Session metadata, session preview text, titles, drafts, and clinical content
  are not stored in browser storage.
- Archive state and other session metadata are not stored in browser storage.
- Crisis UI uses backend `crisis_level` only and shows the red banner only when
  `crisis_level === 'high'`.
- ConversationPage reads top-level nullable `crisis_level` from loaded session
  summary rows to restore persisted crisis display.
- Restored persisted `high` restores high-risk page metadata/banner, restored
  persisted `low` restores ordinary low-risk metadata, restored persisted
  `none` restores the default no-crisis wording, and precedence is
  `high > low > none`.
- The default/no-crisis wording is 「未偵測到危機」.
- Loaded summaries that contain `crisis_flag` but no persisted `crisis_level`
  show safe counselor-review metadata such as
  「最新摘要有危機註記，請諮商師重新檢視」.
- The frontend must not infer low/high crisis level from `summary.crisis_flag`.
- The high-risk modal/dialog appears only when a backend response has
  `crisis.crisis_level === 'high'`; dismissing the modal does not remove
  high-risk page metadata, and low/default crisis states do not open the modal.
- Restored persisted high-risk state from loaded summaries does not auto-open or
  replay the high-risk modal.
- Live high-risk responses still open the high-risk modal, but live page-level
  inline backend reason/detail is not shown. Restored persisted high-risk state
  shows only a short page-level banner and does not show backend reason inline.
- Generated reports are currently transient. `POST /api/reports/generate`
  returns a report response but does not persist it, and ReportPage displays a
  note that draft reports are only temporarily shown on the page and must be
  regenerated after leaving or reloading.
- ReportPage v2 manual input may contain clinical content and is saved
  backend-side only.
- ReportPage v2 preview is client-side rendering from already loaded draft state
  only. It does not write report preview text, generated report text,
  `ai_generated` JSON, manual input, report drafts, or clinical content to
  `localStorage` or `sessionStorage`.
- PDF export, hard delete/session data-retention workflow, title search/filter,
  richer session metadata, reviewed status/counselor final report workflow,
  optional additional visualization work, production deployment/testing,
  runtime/provider status endpoint if needed, and MCP integration are not
  implemented yet.
- Runtime/provider status must not leak secrets if added later. Real provider
  settings UI remains out of scope unless explicitly designed.
- Frontend v2 AI generation integration exists through the separate
  `v2 AI 草稿產生` action card and `generateReportDraftV2(draftId)`. No counselor
  final report workflow, reviewed status, PDF export, editable report fields,
  emotion intensity line chart, theme frequency chart, or additional chart
  polish has been implemented.
- `frontend/src/api/client.js` contains the shared axios client for backend calls.
- Task 09 backend routes are implemented under `/api`; frontend work should
  continue to follow `backend/API_CONTRACT.md`.
- Frontend testing foundation is implemented with Vitest, React Testing Library,
  and jsdom.
- Frontend tests mock API helpers and do not call the live backend, providers, or
  network.

Remaining future behavior:

- Complete hard delete/session data-retention policy, title search/filter, richer
  session metadata, optional latest/peak session crisis aggregate display,
  optional HistoryPage crisis-level display, Settings backend integration, and
  MCP-related UI only when the corresponding tasks are prioritized.
- Complete report workflow future work: counselor final report workflow,
  reviewed status, final PDF export, optional additional visualizations and
  chart polish, production deployment/testing, and docs after future slices.
- Smarter scroll behavior can be considered later as an optional UX refinement.
- Add future frontend tests for counselor final report workflow, reviewed
  status, PDF export, additional visualizations, and production
  deployment-specific behavior as those features are implemented. Optional
  Playwright/E2E and visual regression can be added later if needed.

## Current Frontend Test Coverage

Current frontend tests use Vitest, React Testing Library, and jsdom.

Coverage includes:

- Header navigation and theme toggle behavior.
- Safe theme localStorage usage.
- ConversationPage input behavior.
- ConversationPage crisis modal and fallback behavior.
- ConversationPage restored persisted crisis display for high, low, none, legacy
  fallback, high-over-low, and low-over-none precedence.
- ConversationPage live high-risk modal behavior.
- ConversationPage create-case durable session flow, new-session durable flow,
  createSession failure handling, query-param resume no-create behavior, and
  storage safety.
- ReportPage missing `sessionId` handling, manual generation, and disclaimer
  display.
- ReportPage transient report note.
- ReportPage v2 current draft load, missing-draft create state, Create Draft
  flow, editing/saving manual input, save success/error behavior, v2 action card
  behavior, unsaved-input blocking, 422/generic generation errors, regeneration
  label, ReportPage layout order, v1/v2 separation, read-only preview
  prerequisite state, simplified preview field visibility, manual field mapping,
  preview AI mapping, visible `crisis_language_summary`, conditional manual
  safety-plan rendering, safe turn-number-only evidence refs, forbidden AI
  risk/safety fields, missing-data placeholders, future placeholder wording,
  risk missing behavior, save-to-preview updates, missing session behavior, and
  storage safety.
- API helper path and payload contract tests, including `updateSessionTitle`,
  `getCurrentReportDraft`, `createReportDraft`, and
  `updateReportDraftManualInput`, and `generateReportDraftV2`.
- HistoryPage list, empty, error, lazy session expansion, empty durable session
  rendering, title/fallback rendering, rename controls, save, clear, cancel,
  keyboard behavior, validation, error handling, single-row editing, and
  session navigation link behavior.
- HistoryPage archive confirmation, show-archived toggle, archived badge,
  unarchive behavior, archived-session resume/report links, rename compatibility
  for visible archived sessions, archive/unarchive error handling, and storage
  safety.
- ReportPage back-to-conversation link preservation.
- SettingsPage rendering, absence of secret/input controls, no API helper calls,
  no clinical sentinel persistence, and no new storage keys.
- Browser storage safety regression coverage.

Test boundaries:

- Tests mock API helpers.
- Tests do not call the live backend, LLM providers, or network.
- Storage safety tests confirm clinical message content, summaries, generated
  report text, `ai_generated` JSON, report drafts, manual input, crisis levels,
  crisis reasons, case notes, session metadata, previews, titles, drafts, and
  other clinical content are not persisted to browser storage.
- `localStorage` is used only for `ai-psych-theme`.
- `sessionStorage` may store only active case/session identifiers.
- Session metadata, preview text, titles, drafts, and clinical content are not
  persisted to browser storage.

Remaining future testing work:

- Future ReportPage tests for counselor final report workflow and PDF export as
  those features are added.
- Future ReportPage tests for reviewed status, additional visualizations, and
  production deployment-specific behavior as those features are added.
- Optional Playwright/E2E later.
- Visual regression later if needed.

## Intended Page Responsibilities

### ConversationPage

Route: `/`

Responsibilities:

- Let the counselor select or create a case context.
- Maintain an active backend session identifier.
- Create a durable backend session after creating a case by calling
  `createSession(newCase.id)` and using the backend returned `session_id`.
- Create a durable backend session for the selected case when the counselor
  starts a new session.
- Resume a session from `caseId` and `sessionId` query parameters.
- Treat query parameters as higher priority than stale `sessionStorage`
  identifiers, and do not create a new session during query-param resume.
- Selecting an existing case must clear the active session and wait for the
  counselor to start a new session.
- Starting a new session must keep the selected case, use the backend returned
  `session_id`, and clear the visible message and summary state only after
  durable session creation succeeds.
- Let the counselor enter client-provided text.
- Submit with Enter, insert a newline with Shift+Enter, and ignore Enter while an
  IME composition is active.
- Keep the textarea editable while a turn is submitting.
- Lock the send button while submitting and guard duplicate submit attempts.
- Send each conversation turn to the backend.
- Display user and assistant messages.
- Display messages in a bounded scrollable log so the page does not grow
  awkwardly with each turn and the latest message is not hidden behind the
  composer.
- Display the latest JSON micro-summary.
- Display summary and crisis context returned by the backend.
- Display a red crisis banner only for `crisis_level == "high"`.
- For live high-risk turns, open the high-risk modal but do not show backend
  reason/detail as inline page-level text. For restored persisted high-risk
  state, show a short page-level banner only and do not replay the modal.
- Provide entry point to generate or view the report for the current case/session.

Not currently implemented:

- Emotion trend charts.

### ReportPage

Route: `/report/:caseId`

Responsibilities:

- Load report workspace context for a selected case/session.
- Show `會談整理輔助` before the v2 report draft workflow with the guidance copy
  `建議先檢視本區整理，再建立或產生 v2 報告草稿。`.
- Load the current Report Schema v2 draft when one exists.
- Show `尚未建立 v2 手動資料草稿` and require explicit Create Draft when no v2
  draft exists.
- Avoid auto-creating v2 drafts on page load.
- Let the counselor create a v2 manual input draft explicitly.
- Let the counselor edit and save the first v2 manual input slice through
  backend `PATCH` only.
- Group v2 manual input, v2 generation, and v2 preview under `v2 報告草稿`.
- Keep existing v1 transient report generation lower on the page as
  `舊版 v1 暫存報告`.
- Generate or regenerate v1 and v2 reports only when the counselor manually
  requests it.
- Treat v1 generated report data as transient. Treat v2 generated draft data as
  backend-persisted `ReportDraftV2` state.
- Display a note that draft reports are temporarily shown on the page and must be
  regenerated after leaving or reloading.
- Display the backend-supplied fixed report disclaimer prominently.
- Display report text sections from `ConceptualizationReport`.
- Display crisis summary and `has_crisis` status in counselor-review language.
- Display summary-derived review aids:
  - emotion intensity trend
  - emotion dimension average/latest snapshot
  - theme frequency chips
  - micro-summary timeline
  - crisis occurrence indicator from existing backend data
- Present review aids as contextual counselor supports, not objective clinical
  measurements.
- Avoid presenting the report as diagnostic or final.
- Preserve case/session IDs in the back-to-conversation link.
- Do not store generated report text, `ai_generated` JSON, report drafts, manual
  input, summaries, crisis reasons, case notes, or clinical content in browser
  storage.
- Keep v1/v2 behavior separate: v2 save must not call `generateReport`, v2
  generate must call only `generateReportDraftV2`, v2 generated data must not
  populate v1 report state, v1 report generation must not alter `reportDraft`,
  and the v1 generate button must only call existing v1 `generateReport`.
- Render a read-only simplified v2 preview from loaded draft state without
  calling APIs, calling `generateReport`, generating content, inferring facts
  from summaries, or inferring risk/crisis status.
- Show `需先建立 v2 草稿後才可預覽` when no v2 draft exists.
- Keep the main v2 preview focused on demo-useful fields; hide
  `正式風險評估備註`, `晤談觀察`, `症狀與功能影響`, `防衛機制`, and `內在衝突` without
  changing schema/API/backend behavior.
- Keep `crisis_language_summary` visible.
- Render manual `safety_plan` only when provided and label it counselor/manual.
- In the v2 preview, show missing manual fields as `待評估`, future
  AI/counselor-owned fields as `此欄位待未來 AI 草稿或諮商師補充`, and missing
  risk fields as `待評估` rather than `無風險`.

- Render `draft.ai_generated` fields inline with `AI 草稿，需諮商師審閱` labels,
  preserve manual-field ownership, keep manual `client_understanding` primary,
  show AI client understanding only as supplemental draft text requiring review,
  and show evidence refs only as turn numbers.
- Never render raw summaries, raw messages, key statements, crisis reasons,
  provider output, AI formal risk level, or AI safety plan in the v2 preview.

Not currently implemented:

- Counselor edits/final report workflow.
- Reviewed status.
- PDF export.
- Editable report fields.
- Emotion intensity line chart, theme frequency chart, and additional chart
  polish beyond the first Recharts emotion dimension radar chart.
- Production deployment/testing.

### HistoryPage

Route: `/history`

Responsibilities:

- Display available cases.
- Lazily expand cases to list backend session metadata.
- Allow multiple cases to remain expanded.
- Display `session.title` as the primary session label when present.
- Display `未命名會談` for untitled sessions.
- Keep `session_id` visible as secondary metadata.
- Hide archived sessions by default.
- Provide a `顯示已封存會談` toggle that reloads or displays active plus archived
  sessions.
- Display an `已封存` badge for archived sessions.
- Archive a session only after counselor confirmation.
- Unarchive archived sessions.
- Keep archived sessions resumable and reportable when explicitly shown.
- Support inline manual title editing on one row at a time.
- Provide an edit control, input, Save, Cancel, and Clear title action for the
  edited session row.
- Save trimmed titles through `updateSessionTitle(caseId, sessionId, { title })`.
- Clear titles through `updateSessionTitle(caseId, sessionId, { title: null })`.
- Validate the 80-character title limit before calling the API.
- Save on Enter and cancel on Escape.
- Show a friendly generic error on failed save while preserving the draft.
- Let the counselor resume a conversation through
  `/?caseId={caseId}&sessionId={sessionId}`.
- Let the counselor open a report workspace through
  `/report/{caseId}?sessionId={sessionId}`.

Not currently implemented:

- Case deletion.
- Session hard delete.
- Title search/filter.
- Labels, report status, and richer session metadata.

### SettingsPage

Route: `/settings`

Responsibilities:

- Display static counselor-facing informational guidance.
- Explain that the system supports counseling documentation only and is not a
  diagnosis, formal treatment plan generator, medication/dosage adviser, or
  emergency service replacement.
- Remind counselors that they remain the final reviewer and decision-maker.
- Explain browser storage/privacy behavior: `localStorage` stores only
  `ai-psych-theme`, and `sessionStorage` stores only active case/session IDs.
- State that clinical messages, summaries, reports, crisis levels, crisis
  reasons, case notes, titles, drafts, previews, session metadata, provider
  keys, and secrets are not stored in browser storage.
- Explain that model/service/API key configuration is backend environment-managed.
- Explain theme behavior without adding another theme toggle.
- Perform no storage writes.
- Do not expose provider API keys or `.env` values in the browser.
- Do not expose provider/model selection controls unless a future task explicitly
  designs a real settings workflow.

Not currently implemented:

- Runtime/provider status endpoint integration.
- Real provider settings UI.

## Expected API Calls Per Page

Use the axios client in `frontend/src/api/client.js`.

### ConversationPage

Expected calls:

- `POST /api/cases` when creating a new case.
- `POST /api/cases/{case_id}/sessions` through `createSession(caseId, payload = {})`
  after creating a new case and when the counselor starts a new session.
- `GET /api/cases` when selecting existing cases.
- `POST /api/conversation/turn` for each submitted turn.
- `GET /api/cases/{case_id}/sessions/{session_id}/messages` when reloading a session.
- `GET /api/cases/{case_id}/sessions/{session_id}/summaries` when reloading summaries.
- `POST /api/reports/generate` when generating a report.

### ReportPage

Expected calls:

- `GET /api/cases/{case_id}` to validate/display case context.
- `GET /api/cases/{case_id}/sessions/{session_id}/summaries` for
  summary-derived review aids.
- `GET /api/cases/{case_id}/sessions/{session_id}/report-drafts/current`
  through `getCurrentReportDraft(caseId, sessionId)` to load an existing v2
  draft.
- `POST /api/cases/{case_id}/sessions/{session_id}/report-drafts` through
  `createReportDraft(caseId, sessionId, payload = {})` only when the counselor
  explicitly creates a v2 draft.
- `PATCH /api/report-drafts/{draft_id}/manual-input` through
  `updateReportDraftManualInput(draftId, payload)` only when saving v2 manual
  input.
- `POST /api/report-drafts/{draft_id}/generate` through
  `generateReportDraftV2(draftId)` only when the counselor manually generates
  the v2 AI draft. It sends no payload and returns the updated `ReportDraftV2`.
- `POST /api/reports/generate` only when the counselor manually generates or
  regenerates a v1 transient report.

`sessionId` is represented as a query parameter on the report route.

### HistoryPage

Expected calls:

- `GET /api/cases` to list cases.
- `GET /api/cases/{case_id}/sessions` when a case is expanded.
- `GET /api/cases/{case_id}/sessions?include_archived=true` when the counselor
  enables the archived-session toggle.
- `GET /api/cases/{case_id}` to inspect a selected case when the UI needs case
  detail.
- `PATCH /api/cases/{case_id}/sessions/{session_id}` through
  `updateSessionTitle(caseId, sessionId, payload)` with
  `{ title: string | null }` when saving or clearing a session title.
- `POST /api/cases/{case_id}/sessions/{session_id}/archive` when archiving after
  confirmation.
- `POST /api/cases/{case_id}/sessions/{session_id}/unarchive` when restoring an
  archived session.

Future calls may include case deletion, session hard delete, title search/filter,
label, and report-status endpoints once implemented.

### SettingsPage

Expected calls:

- No Task 09 calls.
- No API helper calls for the current static informational page.
- Do not call endpoints that expose secrets.

## Required State Shapes

These are frontend state shapes, not backend model definitions. Keep them aligned
with `backend/API_CONTRACT.md`.

### Messages

```js
{
  id: 'uuid-or-temporary-id',
  case_id: 'case uuid',
  session_id: 'session uuid',
  turn_number: 1,
  role: 'user' | 'assistant',
  content: 'message text',
  created_at: 'ISO-8601 UTC'
}
```

Notes:

- Public UI state uses `turn_number`, never DB-internal `round`.
- Temporary client-side IDs are acceptable before backend response reconciliation.

### Summaries

```js
{
  id: 'uuid',
  case_id: 'case uuid',
  session_id: 'session uuid',
  turn_number: 1,
  summary: {
    turn_number: 1,
    emotion: {
      primary: '焦慮',
      intensity: 7
    },
    emotion_dimensions: {
      anxiety: 7,
      sadness: 3,
      anger: 1,
      hopelessness: 4,
      confusion: 3,
      hope: 2
    },
    themes: ['工作壓力'],
    key_statement: '我覺得我什麼都做不好',
    crisis_flag: false
  },
  crisis_flag: false,
  crisis_level: 'none' | 'low' | 'high' | null,
  created_at: 'ISO-8601 UTC'
}
```

Notes:

- `crisis_level` is top-level nullable backend metadata, not part of
  `summary`.
- Old rows may return `crisis_level: null`; the frontend must not infer low/high
  from `summary.crisis_flag`.

### Session Metadata

```js
{
  session_id: 'session uuid',
  title: 'optional counselor-facing title or null',
  archived_at: 'ISO-8601 UTC' | null,
  created_at: 'ISO-8601 UTC',
  updated_at: 'ISO-8601 UTC',
  last_activity_at: 'ISO-8601 UTC',
  message_count: 2,
  summary_count: 1,
  last_turn_number: 3,
  last_updated: 'ISO-8601 UTC',
  has_crisis: false,
  latest_summary_preview: 'metadata-only preview'
}
```

Notes:

- Backend session metadata now includes explicit sessions plus legacy sessions
  derived from persisted messages and summaries.
- Empty sessions can exist durably through backend session creation and can
  appear in HistoryPage when returned by the backend.
- `title` is nullable safe operational metadata. Legacy/backfilled sessions
  return null, and HistoryPage falls back to `未命名會談` when no title is present.
- `archived_at` is nullable safe operational metadata. `null` means active;
  non-null means archived.
- UI state must not include DB-internal `round`, raw `summary_json`, raw
  messages, full summaries, `key_statement`, themes, crisis reasons, report
  text, or latest/peak `crisis_level` aggregates.
- `latest_summary_preview` is metadata-only and should be treated as a compact
  scan aid, not clinical content for browser storage.

### Crisis Status

```js
{
  crisis_flag: false,
  crisis_level: 'none' | 'low' | 'high',
  reason: 'short explanation'
}
```

Notes:

- Red banner only when `crisis_level === 'high'`.
- The frontend should not reinterpret or recalculate crisis level.
- Loaded summary rows may include top-level nullable `crisis_level`; the
  frontend must not infer `low` or `high` from `summary.crisis_flag`.
- ConversationPage restores persisted crisis display from loaded session summary
  rows by reading top-level nullable `crisis_level`.
- Restored persisted `high` restores high-risk page metadata/banner, restored
  persisted `low` restores ordinary low-risk metadata, restored persisted
  `none` restores default no-crisis wording, and precedence is
  `high > low > none`.
- If loaded summaries contain `crisis_flag` but no persisted `crisis_level`, show
  safe metadata such as 「最新摘要有危機註記，請諮商師重新檢視」.
- Restored persisted high-risk state from loaded summaries does not auto-open or
  replay the high-risk modal.

### Report Data

```js
{
  case_id: 'case uuid',
  session_id: 'session uuid',
  generated_at: 'ISO-8601 UTC',
  chief_complaint: '...',
  emotion_pattern: {
    description: '...',
    dominant_emotions: ['焦慮'],
    intensity_trend: 'ascending' | 'descending' | 'fluctuating' | 'stable',
    peak_turn: 1
  },
  cognitive_behavioral_analysis: '...',
  initial_conceptualization: '...',
  suggested_directions: ['認知行為治療（CBT）'],
  crisis_summary: '...',
  disclaimer: '本報告為 AI 草稿，僅供諮商師參考，非診斷文件。\n所有判斷與決策須由專業諮商師負責審核。',
  has_crisis: false
}
```

### Report Draft Manual Input V2

```js
{
  id: 'draft uuid',
  case_id: 'case uuid',
  session_id: 'session uuid',
  schema_version: 'report_schema_v2',
  status: 'manual_input_started',
  manual_input: {
    session_date: 'optional',
    session_count: 'optional',
    referral_source: 'optional',
    age_gender: 'optional',
    occupation_school_status: 'optional',
    marital_family_status: 'optional',
    client_problem_understanding: 'optional',
    assessment_data_supplement: 'optional',
    formal_risk_assessment_note: 'optional',
    safety_plan: 'optional'
  },
  ai_generated: null | {
    // AI-owned draft fields only; rendered as review-needed draft text.
  },
  counselor_edits: null,
  final_report: null,
  created_at: 'ISO-8601 UTC',
  updated_at: 'ISO-8601 UTC'
}
```

Notes:

- Manual input may contain clinical content and is saved backend-side only.
- Drafts are loaded, created, updated, or generated only through explicit
  backend API calls.
- Drafts must not be stored in browser storage.
- v2 manual input save does not call v1 report generation.
- v2 AI generation calls only `generateReportDraftV2(draftId)` and stores the
  updated draft in React state only.
- `ai_generated` JSON must not be stored in browser storage.

## Crisis Banner Behavior

The crisis banner is safety-specific UI and must follow `docs/SAFETY_REQUIREMENTS.md`.

Rules:

- Show a prominent red warning only for `crisis_level === 'high'`.
- Do not show the red banner for `none`.
- Do not upgrade `low` to `high` in frontend code.
- Do not infer `low` or `high` from `summary.crisis_flag`.
- Do not hide a `high` result because assistant response generation succeeded.
- Use 「未偵測到危機」 for the default/no-crisis state.
- Open the high-risk modal/dialog only when a backend response has
  `crisis.crisis_level === 'high'`.
- Do not show backend high-risk reason/detail as live inline page-level text.
- Restored persisted high-risk state from loaded summaries must not auto-open or
  replay the high-risk modal/dialog.
- Restored persisted high-risk state should show only a short page-level banner.
- Dismissing the high-risk modal/dialog must not remove high-risk page metadata.
- Low/default crisis states must not open the modal/dialog.
- Keep banner language counselor-facing and review-oriented.

The banner should communicate that the system detected high-risk language and that
the counselor must review and respond according to professional protocols. It should
not give medical instructions to the client.

## Expected Report Review Aid Data

Report review aids should be derived from loaded summaries and existing backend
report fields. They are counselor-facing context only and are not objective
clinical measurements.

### Emotion Intensity Trend

Source:

- `summary.turn_number`
- `summary.emotion.intensity`
- optionally `summary.emotion.primary`

Expected chart data shape:

```js
{
  turn_number: 1,
  intensity: 7,
  primary: '焦慮'
}
```

### Emotion Dimensions

Source:

- `summary.emotion_dimensions`

Expected average/latest snapshot data shape:

```js
[
  { dimension: 'anxiety', value: 7 },
  { dimension: 'sadness', value: 3 },
  { dimension: 'anger', value: 1 },
  { dimension: 'hopelessness', value: 4 },
  { dimension: 'confusion', value: 3 },
  { dimension: 'hope', value: 2 }
]
```

When multiple summaries exist, the current review workspace shows average and
latest values as contextual review aids. The first Recharts chart slice renders
the average values as a compact radar chart on a fixed `0-10` scale while
preserving the text/bar fallback. It must not visualize raw messages, raw
summaries, key statements, report text, or clinical free text.

### Themes

Source:

- `summary.themes`
- report-level conceptualization fields

Themes should be displayed as counselor-review context, not as diagnostic labels.

### Micro-Summary Timeline

Source:

- `summary.turn_number`
- `summary.emotion.primary`
- `summary.emotion.intensity`
- `summary.key_statement`
- `summary.crisis_flag`

The timeline should help the counselor scan summary progression without treating
the summaries as final clinical findings.

### Crisis Occurrence Indicator

Source:

- existing backend summary/report crisis fields, including `crisis_flag`,
  `crisis_level`, and/or `has_crisis` when available

The indicator should reflect existing backend data only. The frontend must not
recalculate crisis level or upgrade risk.

When loaded summaries include top-level nullable `crisis_level`, the indicator
may use it only as backend/persisted data. When summaries only include
`crisis_flag` without a persisted `crisis_level`, the indicator should show safe
counselor-review metadata rather than an inferred low/high level.

## UX Constraints

Inherited constraints:

- The interface is for counselors, not clients.
- Do not use wording that presents AI output as diagnosis or final judgment.
- Keep the fixed disclaimer visible on report-related views.
- Preserve crisis warning behavior exactly.
- Do not expose provider secrets or backend environment values.
- Avoid storing sensitive text in browser logs.
- Do not store clinical message content, summaries, session metadata, previews,
  generated report text, `ai_generated` JSON, report drafts, manual input,
  crisis levels, crisis reasons, case notes, titles, drafts, or other clinical
  content in browser storage.
- Browser `localStorage` is used only for the `ai-psych-theme` preference.
- Browser `sessionStorage` may store only active case/session identifiers.
- Session metadata, preview text, titles, drafts, and clinical content must not
  be written to browser storage.
- Archive state must not be written to browser storage.
- Use API data contracts rather than guessing backend internals.
- Do not reference DB-internal `round` in UI code.

## Current Implemented State Versus Future Behavior

Current implemented state:

- ConversationPage is wired to backend case, conversation, message, summary, and
  crisis data flows.
- ConversationPage uses a bounded scrollable message log, keeps the latest
  message visible above the composer, supports Enter/Shift+Enter/IME-safe input,
  keeps the textarea editable while submitting, locks the send button while
  submitting, and guards duplicate submits.
- Starting a new session from a resumed session preserves the selected case,
  creates a durable backend session, uses the backend returned `session_id`, and
  clears message/summary UI only after session creation succeeds.
- Selecting an existing case clears the active session and does not create a
  session until the counselor starts one.
- ReportPage is a counselor review workspace wired to backend report generation,
  supports manual-only report generation, displays the backend disclaimer
  prominently, and places summary-derived `會談整理輔助` before the v2 workflow.
- ReportPage generated reports are transient, displays a temporary-report note,
  and does not store report text in browser storage.
- ReportPage groups v2 manual input, v2 generation, and v2 preview under
  `v2 報告草稿`, while v1 transient generation appears lower as
  `舊版 v1 暫存報告`. The v2 panel loads an existing current draft, shows
  `尚未建立 v2 手動資料草稿` when no draft exists, requires explicit Create Draft,
  does not auto-create drafts on page load, and saves manual input only through
  backend `PATCH`.
- The v2 manual input panel supports optional fields for session date, session
  count, referral source, age/gender, occupation/school status,
  marital/family status, client understanding/chief-complaint supplement,
  testing/assessment supplement, formal risk assessment notes, and safety plan.
- ReportPage includes a read-only simplified v2 preview from loaded draft
  state. It shows `需先建立 v2 草稿後才可預覽` when no draft exists, maps current
  manual input fields into the template, uses `待評估` for missing manual fields,
  keeps `crisis_language_summary` visible, hides `正式風險評估備註`, `晤談觀察`,
  `症狀與功能影響`, `防衛機制`, and `內在衝突` in the main preview, conditionally
  renders counselor/manual `safety_plan` only when provided, and renders
  `draft.ai_generated` fields inline with review-needed AI labels.
- ReportPage includes a separate `v2 AI 草稿產生` action card between manual input
  and preview. It blocks unsaved manual input, disables generation while saving
  or generating, updates local `reportDraft` from the backend response, and
  shows `至少需要一筆會談摘要才能產生 v2 AI 草稿` for no-summary 422 responses.
- v2 save and v2 preview do not call `generateReport`; v2 generate calls only
  `generateReportDraftV2`, the v1 generate button calls only the existing v1
  `generateReport`, v2 generated data does not populate v1 report state, and v1
  report generation does not alter `reportDraft`.
- ReportPage review aids are not objective clinical measurements.
- HistoryPage lists backend cases and lazily expands cases to show backend
  session metadata.
- HistoryPage displays session titles when present, `未命名會談` for untitled
  sessions, and session IDs as secondary metadata; resume and report links are
  unchanged.
- HistoryPage supports inline manual title rename/clear with edit controls,
  trimmed saves, `{ title: null }` clearing, 80-character validation, Enter save,
  Escape cancel, single-row editing, friendly generic save errors, and draft
  preservation after failed saves.
- HistoryPage hides archived sessions by default, archives only after
  confirmation, provides the `顯示已封存會談` toggle, displays `已封存` badges for
  archived sessions, supports unarchive, keeps visible archived sessions
  resumable/reportable, and allows rename/clear for visible archived sessions.
- No hard delete UI exists for sessions.
- SettingsPage is a static counselor-facing informational page covering system
  purpose, safety boundaries, storage/privacy behavior, theme preference behavior,
  backend-managed model/service configuration, and counselor review reminders.
- SettingsPage performs no storage writes, exposes no provider keys or `.env`
  values, includes no provider/model selection, and adds no theme toggle beyond
  the shared header toggle.
- ConversationPage supports query-param resume, and query params take precedence
  over stale `sessionStorage` identifiers.
- ReportPage back-to-conversation links preserve case/session IDs.
- Header navigation and light/dark theme toggle are implemented.
- Theme preference is stored with the `ai-psych-theme` localStorage key.
- Clinical message content, summaries, generated report text, `ai_generated`
  JSON, crisis levels, crisis reasons, case notes, report drafts, and manual
  input are not stored in browser storage.
- Session metadata, preview text, titles, drafts, and clinical content are not
  stored in browser storage.
- Archive state is not stored in browser storage.
- No title is stored in browser storage, generated by AI, or derived from raw
  messages, summaries, key statements, themes, crisis reasons, previews, or
  reports, notes, or other clinical content.
- Title drafts are not stored in browser storage; browser storage behavior
  remains limited to `ai-psych-theme` in `localStorage` and active case/session
  identifiers in `sessionStorage`.
- Crisis UI uses backend `crisis_level` only. ConversationPage restores
  persisted high, low, and none states from loaded summary rows' top-level
  nullable `crisis_level`, using precedence `high > low > none`. Summary-only
  `crisis_flag` fallback metadata is counselor-review wording, not a low/high
  inference, live high-risk responses open the high-risk modal without showing
  backend reason/detail inline, and restored persisted high-risk state shows only
  a short page-level banner without auto-opening or replaying the modal.
- Frontend tests are implemented with Vitest, React Testing Library, and jsdom,
  using mocked API helpers and no live backend/provider/network calls.

Future behavior:

- Keep UI state aligned with `backend/API_CONTRACT.md`.
- Add hard delete only after a separate data-retention/privacy policy. Add title
  search/filter, labels, report status, richer session metadata, optional
  runtime/provider status, and
  MCP-related UI when prioritized.
- Keep any future runtime/provider status endpoint secret-safe. Real provider
  settings UI remains out of scope unless explicitly designed.
- Optional latest/peak session crisis aggregate display remains future work.
- HistoryPage crisis-level display remains future work, if desired.
- Complete future report work after the report template stabilizes: Report
  Schema v2 counselor final report workflow, reviewed status, final PDF export,
  optional additional visualizations and chart polish, production
  deployment/testing, and docs after future slices.
- Smarter scroll behavior remains optional future UX work.
- Add future frontend tests for counselor final report workflow, reviewed
  status, PDF export, additional visualizations, and production
  deployment-specific behavior as those features are implemented.
- Add optional Playwright/E2E later, and visual regression later if needed.

## Open Decisions

- Which future report visualizations, if any, should follow the first Recharts
  radar chart slice; possible candidates include emotion intensity line chart,
  theme frequency chart, and additional chart polish. Crisis charting should
  remain cautious and must not imply formal risk assessment.
- How a future formal report schema should support source/evidence traceability
  and editable counselor review.
- How future v2 AI generation should combine summaries with backend-persisted
  manual input.
- Whether a future frontend should display latest or peak persisted
  `crisis_level` at the session level.
