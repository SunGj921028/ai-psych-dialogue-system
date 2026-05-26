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
- ReportPage acts as a counselor review workspace integrated with the backend
  API. Report generation remains manual-only.
- ReportPage displays the backend-supplied fixed disclaimer prominently.
- ReportPage includes summary review aids derived from loaded summaries: emotion
  intensity trend, emotion dimension average/latest snapshot, theme frequency
  chips, micro-summary timeline, and crisis occurrence indicator from existing
  backend data.
- ReportPage review aids are counselor-facing context only and are not objective
  clinical measurements.
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
  metadata, previews, report text, crisis reasons, case notes, titles, drafts, or
  other clinical content in browser storage.
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
- Crisis UI uses backend `crisis_level` only and shows the red banner only when
  `crisis_level === 'high'`.
- The default/no-crisis wording is 「未偵測到危機」.
- Loaded summaries that contain `crisis_flag` but no persisted `crisis_level`
  show safe counselor-review metadata such as
  「最新摘要有危機註記，請諮商師重新檢視」.
- The frontend must not infer low/high crisis level from `summary.crisis_flag`.
- The high-risk modal/dialog appears only when a backend response has
  `crisis.crisis_level === 'high'`; dismissing the modal does not remove
  high-risk page metadata, and low/default crisis states do not open the modal.
- Generated reports are currently transient. `POST /api/reports/generate`
  returns a report response but does not persist it, and ReportPage displays a
  note that draft reports are only temporarily shown on the page and must be
  regenerated after leaving or reloading.
- Deletion, PDF export, session deletion/archive, title search/filter, richer
  session metadata, optional charts/Recharts, runtime/provider status endpoint
  if needed, and MCP integration are not implemented yet.
- Runtime/provider status must not leak secrets if added later. Real provider
  settings UI remains out of scope unless explicitly designed.
- Persisted report drafts, persisted exact `crisis_level` for summaries, Report
  Schema v2, editable report fields, LLM prompt changes, Recharts integration,
  and final report template mirroring have not been implemented.
- `frontend/src/api/client.js` contains the shared axios client for backend calls.
- Task 09 backend routes are implemented under `/api`; frontend work should
  continue to follow `backend/API_CONTRACT.md`.
- Frontend testing foundation is implemented with Vitest, React Testing Library,
  and jsdom.
- Frontend tests mock API helpers and do not call the live backend, providers, or
  network.

Remaining future behavior:

- Complete deletion, session deletion/archive, title search/filter, richer
  session metadata, persisted exact `crisis_level` if exact crisis level should
  survive reload/navigation, Settings backend integration, and MCP-related UI
  only when the corresponding tasks are prioritized.
- Complete report workflow future work: formal Report Schema v2 after the
  template stabilizes, persisted report drafts, source/evidence traceability,
  final PDF export, optional Recharts/charts, and editable counselor review
  workflow.
- Smarter scroll behavior can be considered later as an optional UX refinement.
- Complete remaining frontend testing gaps: ReportPage error handling tests,
  optional Playwright/E2E later, and visual regression later if needed.

## Current Frontend Test Coverage

Current frontend tests use Vitest, React Testing Library, and jsdom.

Coverage includes:

- Header navigation and theme toggle behavior.
- Safe theme localStorage usage.
- ConversationPage input behavior.
- ConversationPage crisis modal and fallback behavior.
- ConversationPage create-case durable session flow, new-session durable flow,
  createSession failure handling, query-param resume no-create behavior, and
  storage safety.
- ReportPage missing `sessionId` handling, manual generation, and disclaimer
  display.
- ReportPage transient report note.
- API helper path and payload contract tests, including `updateSessionTitle`.
- HistoryPage list, empty, error, lazy session expansion, empty durable session
  rendering, title/fallback rendering, rename controls, save, clear, cancel,
  keyboard behavior, validation, error handling, single-row editing, and
  session navigation link behavior.
- ReportPage back-to-conversation link preservation.
- SettingsPage rendering, absence of secret/input controls, no API helper calls,
  no clinical sentinel persistence, and no new storage keys.
- Browser storage safety regression coverage.

Test boundaries:

- Tests mock API helpers.
- Tests do not call the live backend, LLM providers, or network.
- Storage safety tests confirm clinical message content, summaries, report text,
  crisis reasons, case notes, session metadata, previews, titles, drafts, and
  other clinical content are not persisted to browser storage.
- `localStorage` is used only for `ai-psych-theme`.
- `sessionStorage` may store only active case/session identifiers.
- Session metadata, preview text, titles, drafts, and clinical content are not
  persisted to browser storage.

Remaining future testing work:

- ReportPage error handling tests.
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
- Provide entry point to generate or view the report for the current case/session.

Not currently implemented:

- Emotion trend charts.

### ReportPage

Route: `/report/:caseId`

Responsibilities:

- Load report workspace context for a selected case/session.
- Generate or regenerate a report only when the counselor manually requests it.
- Treat generated report data as transient unless/until a backend persistence
  feature is implemented.
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
- Do not store report text in browser storage.

Not currently implemented:

- Persisted report drafts.
- PDF export.
- Editable report fields.
- Backend schema changes.
- LLM prompt changes.
- Recharts or other chart library integration.
- Final report template mirroring.

### HistoryPage

Route: `/history`

Responsibilities:

- Display available cases.
- Lazily expand cases to list backend session metadata.
- Allow multiple cases to remain expanded.
- Display `session.title` as the primary session label when present.
- Display `未命名會談` for untitled sessions.
- Keep `session_id` visible as secondary metadata.
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
- Session deletion/archive.
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
- State that clinical messages, summaries, reports, crisis reasons, case notes,
  titles, drafts, previews, session metadata, provider keys, and secrets are not
  stored in browser storage.
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
- `POST /api/reports/generate` only when the counselor manually generates or
  regenerates a report.

`sessionId` is represented as a query parameter on the report route.

### HistoryPage

Expected calls:

- `GET /api/cases` to list cases.
- `GET /api/cases/{case_id}/sessions` when a case is expanded.
- `GET /api/cases/{case_id}` to inspect a selected case when the UI needs case
  detail.
- `PATCH /api/cases/{case_id}/sessions/{session_id}` through
  `updateSessionTitle(caseId, sessionId, payload)` with
  `{ title: string | null }` when saving or clearing a session title.

Future calls may include case deletion, session deletion/archive, title
search/filter, label, and report-status endpoints once implemented.

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
  created_at: 'ISO-8601 UTC'
}
```

### Session Metadata

```js
{
  session_id: 'session uuid',
  title: 'optional counselor-facing title or null',
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
- UI state must not include DB-internal `round`, raw `summary_json`, raw
  messages, full summaries, `key_statement`, themes, crisis reasons, report
  text, or exact `crisis_level`.
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
- Loaded summary rows may only include `summary.crisis_flag`; the frontend must
  not infer `low` or `high` from that flag.
- If loaded summaries contain `crisis_flag` but no persisted `crisis_level`, show
  safe metadata such as 「最新摘要有危機註記，請諮商師重新檢視」.
- Persisting exact summary-level `crisis_level` remains future work if exact
  crisis level should survive reload/navigation.

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

When multiple summaries exist, the current review workspace may show both average
and latest values as contextual review aids. Formal charting and alternate
aggregation choices remain future work.

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

When loaded summaries only include `crisis_flag` without a persisted
`crisis_level`, the indicator should show safe counselor-review metadata rather
than an inferred low/high level.

## UX Constraints

Inherited constraints:

- The interface is for counselors, not clients.
- Do not use wording that presents AI output as diagnosis or final judgment.
- Keep the fixed disclaimer visible on report-related views.
- Preserve crisis warning behavior exactly.
- Do not expose provider secrets or backend environment values.
- Avoid storing sensitive text in browser logs.
- Do not store clinical message content, summaries, session metadata, previews,
  report text, crisis reasons, case notes, titles, drafts, or other clinical
  content in browser storage.
- Browser `localStorage` is used only for the `ai-psych-theme` preference.
- Browser `sessionStorage` may store only active case/session identifiers.
- Session metadata, preview text, titles, drafts, and clinical content must not
  be written to browser storage.
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
  prominently, and includes summary-derived review aids.
- ReportPage generated reports are transient, displays a temporary-report note,
  and does not store report text in browser storage.
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
- Clinical message content, summaries, report text, crisis reasons, and case
  notes are not stored in browser storage.
- Session metadata, preview text, titles, drafts, and clinical content are not
  stored in browser storage.
- No title is stored in browser storage, generated by AI, or derived from raw
  messages, summaries, key statements, themes, crisis reasons, previews, or
  reports, notes, or other clinical content.
- Title drafts are not stored in browser storage; browser storage behavior
  remains limited to `ai-psych-theme` in `localStorage` and active case/session
  identifiers in `sessionStorage`.
- Crisis UI uses backend `crisis_level` only. Summary-only `crisis_flag` fallback
  metadata is counselor-review wording, not a low/high inference.
- Frontend tests are implemented with Vitest, React Testing Library, and jsdom,
  using mocked API helpers and no live backend/provider/network calls.

Future behavior:

- Keep UI state aligned with `backend/API_CONTRACT.md`.
- Add deletion, session deletion/archive, title search/filter, labels, report
  status, richer session metadata, optional runtime/provider status, and
  MCP-related UI when prioritized.
- Keep any future runtime/provider status endpoint secret-safe. Real provider
  settings UI remains out of scope unless explicitly designed.
- Add persisted exact `crisis_level` later if exact crisis level should survive
  reload/navigation.
- Complete future report work after the report template stabilizes: formal Report
  Schema v2, persisted report drafts, source/evidence traceability, final PDF
  export, optional Recharts/charts, and editable counselor review workflow.
- Smarter scroll behavior remains optional future UX work.
- Add remaining frontend tests for ReportPage error handling.
- Add optional Playwright/E2E later, and visual regression later if needed.

## Open Decisions

- Whether future report visuals should add Recharts or another charting library.
- How a future formal report schema should support source/evidence traceability
  and editable counselor review.
- Whether and where to persist report drafts.
- Whether summary rows should persist exact `crisis_level` for reload/navigation
  fidelity.
