# Frontend UI Contract

This document defines intended frontend behavior before future frontend integration
work. It does not describe current implementation completeness.

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
- These pages are currently mostly placeholders.
- `frontend/src/api/client.js` contains a basic axios client.
- Task 09 backend routes are implemented under `/api`; frontend integration should
  follow `backend/API_CONTRACT.md`.

Intended future behavior:

- The frontend should become the counselor-facing workspace for case creation,
  conversation entry, live summaries, crisis warning display, report review, and
  history navigation.

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
- Display emotion trend data from accumulated summaries.
- Display a red crisis banner only for `crisis_level == "high"`.
- Provide entry point to generate or view the report for the current case/session.

### ReportPage

Route: `/report/:caseId`

Responsibilities:

- Load or generate a report for a selected case/session.
- Display the fixed report disclaimer.
- Display report text sections from `ConceptualizationReport`.
- Display emotion intensity trend visualization from summaries/report data.
- Display emotion dimension visualization when enough summary data exists.
- Display crisis summary and `has_crisis` status in counselor-review language.
- Avoid presenting the report as diagnostic or final.

### HistoryPage

Route: `/history`

Responsibilities:

- Display available cases.
- Let the counselor open a case.
- Provide access to case sessions, summaries, or reports once backend support exists.
- Support deletion only with clear counselor intent because deleting a case cascades
  associated messages and summaries in the database.

### SettingsPage

Route: `/settings`

Responsibilities:

- Display non-secret configuration guidance or interface preferences.
- Do not expose provider API keys or `.env` values in the browser.
- Future prompt/knowledge-base management is optional and should be treated as P2
  unless a task explicitly prioritizes it.

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
- `GET /api/cases/{case_id}/sessions/{session_id}/summaries` for chart data.
- `POST /api/reports/generate` when generating or regenerating a report.

If `session_id` is not represented in the route yet, future UI work must decide
whether to pass it through query params, navigation state, or a dedicated session route.

### HistoryPage

Expected calls:

- `GET /api/cases` to list cases.
- `GET /api/cases/{case_id}` to inspect a selected case.
- `DELETE /api/cases/{case_id}` when deleting a case after confirmation.

Future calls may include session listing once implemented.

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

## Expected Report Visualization Data

Visualizations should be derived from summaries and report fields.

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

Expected chart data shape:

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

If multiple summaries exist, future UI work should decide whether to show latest
dimensions, averages, or peak values. That choice is not finalized here.

### Themes

Source:

- `summary.themes`
- report-level conceptualization fields

Themes should be displayed as counselor-review context, not as diagnostic labels.

## UX Constraints

Inherited constraints:

- The interface is for counselors, not clients.
- Do not use wording that presents AI output as diagnosis or final judgment.
- Keep the fixed disclaimer visible on report-related views.
- Preserve crisis warning behavior exactly.
- Do not expose provider secrets or backend environment values.
- Avoid storing sensitive text in browser logs.
- Use API data contracts rather than guessing backend internals.
- Do not reference DB-internal `round` in UI code.

## Current Placeholder State Versus Future Behavior

Current placeholder state:

- Pages render placeholder text.
- No page currently implements the full workflows above.
- No page currently depends on Task 09 endpoints.
- Task 09 backend endpoints are available for future integration.

Future behavior:

- Implement UI against the available Task 09 backend API routes, or against explicit
  mocks when a future task requests mocked UI integration.
- Keep UI state aligned with `backend/API_CONTRACT.md`.
- Add frontend-specific tests later when workflows stabilize.

## Open Decisions

- How `session_id` should reach `ReportPage`:
  - query parameter
  - route segment
  - navigation state
  - future session selector
- How report emotion-dimension radar data should be aggregated:
  - latest values
  - average values
  - peak values
  - another method
