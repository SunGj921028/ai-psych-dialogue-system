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
- ReportPage acts as a counselor review workspace integrated with the backend
  API. Report generation remains manual-only.
- ReportPage displays the backend-supplied fixed disclaimer prominently.
- ReportPage includes summary review aids derived from loaded summaries: emotion
  intensity trend, emotion dimension average/latest snapshot, theme frequency
  chips, micro-summary timeline, and crisis occurrence indicator from existing
  backend data.
- ReportPage review aids are counselor-facing context only and are not objective
  clinical measurements.
- HistoryPage lists cases from the backend.
- The shared header includes navigation and a theme toggle.
- Light/dark theme support exists and stores only the theme preference under the
  `ai-psych-theme` localStorage key.
- The frontend does not store clinical message content, summaries, report text,
  crisis reasons, or case notes in browser storage.
- `localStorage` is used only for `ai-psych-theme`.
- `sessionStorage` may store only active case/session identifiers.
- Crisis UI uses backend `crisis_level` only and shows the red banner only when
  `crisis_level === 'high'`.
- Frontend deletion, PDF export, session browser, optional charts/Recharts,
  Settings backend integration, and MCP integration are not implemented yet.
- Editable report fields, backend schema changes, LLM prompt changes, Recharts
  integration, and final report template mirroring have not been implemented.
- `frontend/src/api/client.js` contains the shared axios client for backend calls.
- Task 09 backend routes are implemented under `/api`; frontend work should
  continue to follow `backend/API_CONTRACT.md`.
- Frontend testing foundation is implemented with Vitest, React Testing Library,
  and jsdom.
- Frontend tests mock API helpers and do not call the live backend, providers, or
  network.

Remaining future behavior:

- Complete deletion, session browsing, Settings backend integration, and
  MCP-related UI only when the corresponding tasks are prioritized.
- Complete report workflow future work: formal report schema expansion,
  source/evidence traceability, final PDF export, optional Recharts/charts, and
  editable counselor review workflow.
- Complete remaining frontend testing gaps: ReportPage error handling tests,
  ConversationPage submit edge cases, optional Playwright/E2E later, and visual
  regression later if needed.

## Current Frontend Test Coverage

Current frontend tests use Vitest, React Testing Library, and jsdom.

Coverage includes:

- Header navigation and theme toggle behavior.
- Safe theme localStorage usage.
- ConversationPage crisis UI behavior.
- ReportPage missing `sessionId` handling, manual generation, and disclaimer
  display.
- API helper path and payload contract tests.
- HistoryPage list, empty, error, and no-future-controls behavior.
- Browser storage safety regression coverage.

Test boundaries:

- Tests mock API helpers.
- Tests do not call the live backend, LLM providers, or network.
- Storage safety tests confirm clinical message content, summaries, report text,
  crisis reasons, and case notes are not persisted to browser storage.
- `localStorage` is used only for `ai-psych-theme`.
- `sessionStorage` may store only active case/session identifiers.

Remaining future testing work:

- ReportPage error handling tests.
- ConversationPage submit edge cases.
- Optional Playwright/E2E later.
- Visual regression later if needed.

## Intended Page Responsibilities

### ConversationPage

Route: `/`

Responsibilities:

- Let the counselor select or create a case context.
- Maintain or create a frontend-generated `session_id`.
- Let the counselor enter client-provided text.
- Send each conversation turn to the backend.
- Display user and assistant messages.
- Display the latest JSON micro-summary.
- Display summary and crisis context returned by the backend.
- Display a red crisis banner only for `crisis_level == "high"`.
- Provide entry point to generate or view the report for the current case/session.

Not currently implemented:

- Session browser.
- Emotion trend charts.

### ReportPage

Route: `/report/:caseId`

Responsibilities:

- Load report workspace context for a selected case/session.
- Generate or regenerate a report only when the counselor manually requests it.
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

Not currently implemented:

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
- Let the counselor open a case.

Not currently implemented:

- Case deletion.
- Session browser.
- Direct access to stored session summaries or reports from history.

### SettingsPage

Route: `/settings`

Responsibilities:

- Display non-secret configuration guidance or interface preferences.
- Do not expose provider API keys or `.env` values in the browser.
- Future prompt/knowledge-base management is optional and should be treated as P2
  unless a task explicitly prioritizes it.

Not currently implemented:

- Backend integration.

## Expected API Calls Per Page

Use the axios client in `frontend/src/api/client.js`.

### ConversationPage

Expected calls:

- `POST /api/cases` when creating a new case.
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

If `session_id` is not represented in the route yet, future UI work must decide
whether to pass it through query params, navigation state, or a dedicated session route.

### HistoryPage

Expected calls:

- `GET /api/cases` to list cases.
- `GET /api/cases/{case_id}` to inspect a selected case when the UI needs case
  detail.

Future calls may include deletion and session listing once implemented.

### SettingsPage

Expected calls:

- No required Task 09 calls.
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
- Do not hide a `high` result because assistant response generation succeeded.
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

## UX Constraints

Inherited constraints:

- The interface is for counselors, not clients.
- Do not use wording that presents AI output as diagnosis or final judgment.
- Keep the fixed disclaimer visible on report-related views.
- Preserve crisis warning behavior exactly.
- Do not expose provider secrets or backend environment values.
- Avoid storing sensitive text in browser logs.
- Do not store clinical message content, summaries, report text, crisis reasons,
  or case notes in browser storage.
- Browser `localStorage` is used only for the `ai-psych-theme` preference.
- Browser `sessionStorage` may store only active case/session identifiers.
- Use API data contracts rather than guessing backend internals.
- Do not reference DB-internal `round` in UI code.

## Current Implemented State Versus Future Behavior

Current implemented state:

- ConversationPage is wired to backend case, conversation, message, summary, and
  crisis data flows.
- ReportPage is a counselor review workspace wired to backend report generation,
  supports manual-only report generation, displays the backend disclaimer
  prominently, and includes summary-derived review aids.
- ReportPage review aids are not objective clinical measurements.
- HistoryPage lists backend cases.
- Header navigation and light/dark theme toggle are implemented.
- Theme preference is stored with the `ai-psych-theme` localStorage key.
- Clinical message content, summaries, report text, crisis reasons, and case
  notes are not stored in browser storage.
- Frontend tests are implemented with Vitest, React Testing Library, and jsdom,
  using mocked API helpers and no live backend/provider/network calls.

Future behavior:

- Keep UI state aligned with `backend/API_CONTRACT.md`.
- Add deletion, session browser, Settings backend integration, and MCP-related UI
  when prioritized.
- Complete future report work: formal report schema expansion, source/evidence
  traceability, final PDF export, optional Recharts/charts, and editable
  counselor review workflow.
- Add remaining frontend tests for ReportPage error handling and ConversationPage
  submit edge cases.
- Add optional Playwright/E2E later, and visual regression later if needed.

## Open Decisions

- How `session_id` should reach `ReportPage`:
  - query parameter
  - route segment
  - navigation state
  - future session selector
- Whether future report visuals should add Recharts or another charting library.
- How a future formal report schema should support source/evidence traceability
  and editable counselor review.
