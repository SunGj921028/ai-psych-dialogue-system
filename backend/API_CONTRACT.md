# Backend API Contract

This document defines the HTTP API contract implemented by Task 09. Current
source code remains the implementation truth.

## Endpoint Status Labels

- current: implemented and active today.
- implemented: implemented as part of Task 09.
- future: intended later, not required for Task 09.

## Current API Status

| Method | Path | Status | Notes |
|---|---|---|---|
| GET | `/health` | current | Returns `{"status": "ok"}`. |
| POST | `/api/cases` | implemented | Creates a coded case record. |
| GET | `/api/cases` | implemented | Lists cases using DB helper ordering. |
| GET | `/api/cases/{case_id}` | implemented | Returns 404 when missing. |
| DELETE | `/api/cases/{case_id}` | implemented | Deletes one case; DB cascades related rows. |
| POST | `/api/cases/{case_id}/sessions` | implemented | Creates or returns durable safe session metadata. |
| PATCH | `/api/cases/{case_id}/sessions/{session_id}` | implemented | Updates nullable counselor-entered session title metadata. |
| POST | `/api/conversation/turn` | implemented | Runs conversation/crisis agents, persists messages and summary. |
| GET | `/api/cases/{case_id}/sessions` | implemented | Returns explicit session metadata plus legacy derived sessions for a case. |
| GET | `/api/cases/{case_id}/sessions/{session_id}/messages` | implemented | Returns messages with `turn_number`. |
| GET | `/api/cases/{case_id}/sessions/{session_id}/summaries` | implemented | Returns parsed summary data. |
| POST | `/api/reports/generate` | implemented | Generates a `ConceptualizationReport` for a case/session. |

Routers are mounted under `/api` in `backend/main.py`.

## Implemented Task 09 Endpoints

Task 09 uses route-level request/response Pydantic models where needed and reuses
existing agent models for nested agent data instead of duplicating them.

### Cases

#### Create Case

Status: implemented

`POST /api/cases`

Request:

```json
{
  "code_name": "A001",
  "note": "optional counselor note"
}
```

Response:

```json
{
  "id": "uuid",
  "code_name": "A001",
  "created_at": "ISO-8601 UTC",
  "note": "optional counselor note"
}
```

Implementation notes:

- Use `database.db.create_case()`.
- Do not accept or require real client names.

#### List Cases

Status: implemented

`GET /api/cases`

Response:

```json
[
  {
    "id": "uuid",
    "code_name": "A001",
    "created_at": "ISO-8601 UTC",
    "note": "optional counselor note"
  }
]
```

Implementation notes:

- Use `database.db.get_all_cases()`.
- Keep default ordering from the DB helper unless explicitly changed.

#### Get Case

Status: implemented

`GET /api/cases/{case_id}`

Response:

```json
{
  "id": "uuid",
  "code_name": "A001",
  "created_at": "ISO-8601 UTC",
  "note": "optional counselor note"
}
```

Implementation notes:

- Use `database.db.get_case()`.
- Return 404 if the case does not exist.

#### Delete Case

Status: implemented

`DELETE /api/cases/{case_id}`

Response:

```json
{
  "deleted": true
}
```

Implementation notes:

- Use `database.db.delete_case()`.
- Be explicit in API behavior because database foreign keys cascade messages and summaries.
- Return 404 if the case does not exist.

### Conversation

#### Send Conversation Turn

Status: implemented

`POST /api/conversation/turn`

Request:

```json
{
  "case_id": "uuid",
  "session_id": "session uuid",
  "turn_number": 1,
  "user_input": "案主本輪內容",
  "conversation_history": [
    {
      "role": "user",
      "content": "previous user message"
    },
    {
      "role": "assistant",
      "content": "previous assistant message"
    }
  ]
}
```

Response:

```json
{
  "case_id": "uuid",
  "session_id": "session uuid",
  "turn_number": 1,
  "assistant_response": {
    "content": "assistant reply",
    "is_safe": true,
    "warning": null
  },
  "crisis": {
    "crisis_flag": false,
    "crisis_level": "none",
    "reason": "..."
  },
  "summary": {
    "turn_number": 1,
    "emotion": {
      "primary": "焦慮",
      "intensity": 7
    },
    "emotion_dimensions": {
      "anxiety": 7,
      "sadness": 3,
      "anger": 1,
      "hopelessness": 4,
      "confusion": 3,
      "hope": 2
    },
    "themes": ["工作壓力"],
    "key_statement": "我覺得我什麼都做不好",
    "crisis_flag": false
  }
}
```

Implementation notes:

- Reuse `ConversationMessage` and `ConversationResponse` from `agents.conversation_agent`.
- Reuse `CrisisDetectionResult` from `agents.crisis_agent`.
- Reuse `TurnSummary` from `agents.summary_agent`.
- Run conversation generation and crisis detection concurrently with `asyncio.gather()`.
- Persist both user and assistant messages through `database.db.add_message()`.
- Generate summary after the assistant response and crisis result are available.
- Persist summary through `database.db.add_summary()`.
- Ensure/touch a durable session row for the case/session.
- `summary.crisis_flag` must use the crisis detector result.
- The request-provided `session_id` should be accepted for conversation turns;
  current frontend create-case and new-session flows normally obtain it first
  from `POST /api/cases/{case_id}/sessions`.
- Conversation response shape and crisis logic are unchanged.
- Exact `crisis_level` is not persisted in this milestone.

### Session Listing

#### Create Case Session

Status: implemented

`POST /api/cases/{case_id}/sessions`

Request body is optional:

```json
{
  "session_id": "optional-session-uuid",
  "title": "optional counselor-facing title"
}
```

Response:

```json
{
  "session_id": "session uuid",
  "title": "optional counselor-facing title",
  "created_at": "ISO-8601 UTC",
  "updated_at": "ISO-8601 UTC",
  "last_activity_at": "ISO-8601 UTC",
  "message_count": 0,
  "summary_count": 0,
  "last_turn_number": null,
  "last_updated": "ISO-8601 UTC",
  "has_crisis": false,
  "latest_summary_preview": null
}
```

Implementation notes:

- Use the sessions helper in `database.db` to create or return metadata.
- The backend may generate `session_id` when omitted.
- The optional `title` is nullable safe operational metadata. Omitted or
  whitespace-only titles are normalized to null, valid titles are trimmed, and
  over-length titles are rejected by request validation.
- Duplicate same-case/session creation is idempotent and returns existing
  metadata without overwriting an existing title.
- Return 404 if the case does not exist.
- Return 500 with a generic non-leaking message on helper failures.
- The response shape matches the current session metadata response.
- Session metadata is safe operational metadata only. It must not store or expose
  raw messages, summaries, raw `summary_json`, summary `key_statement`, themes,
  crisis reasons, report text, DB-internal `round`, or exact `crisis_level`.
- Titles must not be AI-generated or derived from raw messages, summaries, key
  statements, themes, crisis reasons, previews, or report text.

#### List Case Sessions

Status: implemented

`GET /api/cases/{case_id}/sessions`

Response:

```json
[
  {
    "session_id": "session uuid",
    "title": "optional counselor-facing title",
    "created_at": "ISO-8601 UTC",
    "updated_at": "ISO-8601 UTC",
    "last_activity_at": "ISO-8601 UTC",
    "message_count": 2,
    "summary_count": 1,
    "last_turn_number": 3,
    "last_updated": "ISO-8601 UTC",
    "has_crisis": false,
    "latest_summary_preview": "metadata-only summary preview"
  }
]
```

Response fields:

- `session_id`: backend-generated or frontend-provided session identifier.
- `title`: nullable counselor-facing title stored as safe operational metadata.
  Legacy/backfilled sessions return null.
- `created_at`, `updated_at`, `last_activity_at`: safe operational timestamps
  from the durable session row when available.
- `message_count`: number of persisted messages in the session.
- `summary_count`: number of persisted summaries in the session.
- `last_turn_number`: highest public turn number from available messages or summaries.
- `last_updated`: latest message or summary timestamp.
- `has_crisis`: true when persisted summary metadata indicates a crisis flag.
- `latest_summary_preview`: metadata-only preview derived from turn, emotion, and
  intensity when available.

Implementation notes:

- Use `database.db.get_session_metadata_by_case()`.
- A dedicated `sessions` table exists for safe operational metadata only:
  `case_id`, `session_id`, `created_at`, `updated_at`, `last_activity_at`, and
  nullable `title`.
- Session rows are linked to cases and cascade when a case is deleted.
- Existing message/summary-derived sessions are backfilled idempotently.
- Legacy/backfilled sessions return `title: null`.
- Session listing remains backward-compatible and includes explicit sessions plus
  legacy sessions derived from existing messages and summaries.
- Return 404 if the case does not exist.
- Return `[]` for an existing case with no explicit or derived sessions.
- On helper failures, return 500 with a generic non-leaking message.
- Do not expose DB-internal `round`.
- Do not expose raw `summary_json`.
- Do not expose raw messages.
- Do not expose full parsed summaries.
- Do not expose summary `key_statement`.
- Do not expose themes.
- Do not expose crisis reasons.
- Do not expose report text.
- Do not expose exact `crisis_level`.
- `latest_summary_preview` must remain metadata-only and should be derived only
  from turn, emotion, and intensity when available.

#### Update Case Session Title

Status: implemented

`PATCH /api/cases/{case_id}/sessions/{session_id}`

Request:

```json
{
  "title": "nullable counselor-facing title"
}
```

Response:

```json
{
  "session_id": "session uuid",
  "title": "trimmed counselor-facing title or null",
  "created_at": "ISO-8601 UTC",
  "updated_at": "ISO-8601 UTC",
  "last_activity_at": "ISO-8601 UTC",
  "message_count": 0,
  "summary_count": 0,
  "last_turn_number": null,
  "last_updated": "ISO-8601 UTC",
  "has_crisis": false,
  "latest_summary_preview": null
}
```

Implementation notes:

- Use `database.db.update_session_title(case_id, session_id, title)`.
- The request body must include the `title` field, but the value may be null.
- Null clears the title.
- Empty or whitespace-only strings clear the title to null.
- Valid strings are trimmed before storage.
- Titles longer than 80 characters return 422.
- Title normalization is shared with session creation behavior.
- Rename updates `sessions.updated_at`.
- Rename does not update `sessions.last_activity_at`.
- Legacy message/summary-derived sessions can be renamed because the backend
  backfills or ensures a durable `sessions` row before updating.
- Return 404 if the case does not exist.
- Return 404 if the session does not exist.
- Return 500 with a generic non-leaking message on helper/DB failures.
- The response shape matches the safe session metadata response and includes
  nullable `title`.
- Session titles remain counselor-entered operational metadata only. They must
  not be AI-generated or derived from raw messages, summaries, key statements,
  themes, crisis reasons, previews, reports, notes, or other clinical content.

### Session Messages

#### Get Session Messages

Status: implemented

`GET /api/cases/{case_id}/sessions/{session_id}/messages`

Response:

```json
[
  {
    "id": "uuid",
    "case_id": "uuid",
    "session_id": "session uuid",
    "turn_number": 1,
    "role": "user",
    "content": "message content",
    "created_at": "ISO-8601 UTC"
  }
]
```

Implementation notes:

- Use `database.db.get_messages_by_session()`.
- Public response uses `turn_number`, not DB-internal `round`.

### Session Summaries

#### Get Session Summaries

Status: implemented

`GET /api/cases/{case_id}/sessions/{session_id}/summaries`

Response:

```json
[
  {
    "id": "uuid",
    "case_id": "uuid",
    "session_id": "session uuid",
    "turn_number": 1,
    "summary": {
      "turn_number": 1,
      "emotion": {
        "primary": "焦慮",
        "intensity": 7
      },
      "emotion_dimensions": {
        "anxiety": 7,
        "sadness": 3,
        "anger": 1,
        "hopelessness": 4,
        "confusion": 3,
        "hope": 2
      },
      "themes": ["工作壓力"],
      "key_statement": "我覺得我什麼都做不好",
      "crisis_flag": false
    },
    "crisis_flag": false,
    "created_at": "ISO-8601 UTC"
  }
]
```

Implementation notes:

- Use `database.db.get_summaries_by_session()`.
- DB helper returns parsed `summary` data.
- Do not expose raw `summary_json` unless a future task explicitly asks for it.

### Reports

#### Generate Report

Status: implemented

`POST /api/reports/generate`

Request:

```json
{
  "case_id": "uuid",
  "session_id": "session uuid"
}
```

Response:

```json
{
  "case_id": "uuid",
  "session_id": "session uuid",
  "generated_at": "ISO-8601 UTC",
  "chief_complaint": "...",
  "emotion_pattern": {
    "description": "...",
    "dominant_emotions": ["焦慮"],
    "intensity_trend": "stable",
    "peak_turn": 1
  },
  "cognitive_behavioral_analysis": "...",
  "initial_conceptualization": "...",
  "suggested_directions": ["認知行為治療（CBT）"],
  "crisis_summary": "...",
  "disclaimer": "本報告為 AI 草稿，僅供諮商師參考，非診斷文件。\n所有判斷與決策須由專業諮商師負責審核。",
  "has_crisis": false
}
```

Implementation notes:

- Use `database.db.get_summaries_by_session()`.
- Convert parsed summary dictionaries into `TurnSummary` models before calling
  `agents.analysis_agent.generate_report()`.
- Reuse `ConceptualizationReport` from `agents.analysis_agent`.
- Do not let the LLM generate or override the fixed disclaimer.

## Future Endpoints / Integrations

These are not required for Task 09 or remain frontend integration work:

- Latest summaries endpoint for dashboards.
- Frontend API helper and UI integration for the implemented PATCH session title
  endpoint.
- PDF export endpoint.
- Prompt/settings management endpoints.
- MCP-related HTTP bridge endpoints.

## Frontend Session Navigation Contract

- The frontend API helper `createSession(caseId, payload = {})` calls
  `POST /api/cases/{case_id}/sessions`.
- Normal frontend-created sessions omit `session_id` and use the backend returned
  `session_id`.
- Backend report generation receives `session_id` in the
  `POST /api/reports/generate` request body.
- Frontend resume links use `/?caseId={caseId}&sessionId={sessionId}`.
- Frontend report links use `/report/{caseId}?sessionId={sessionId}`.
- Conversation query params take precedence over stale `sessionStorage`
  identifiers and do not create a new session.
- Selecting an existing case clears active session state and waits for the
  counselor to start a new session.
- ReportPage back-to-conversation links preserve the active case and session IDs.

## Expected Backend Data Flow

### Conversation Turn Flow

1. Validate request and confirm `case_id` exists.
2. Ensure/touch the durable session row for `case_id` and `session_id`.
3. Convert `conversation_history` into existing `ConversationMessage` models.
4. Run `generate_response()` and `detect_crisis()` concurrently.
5. Persist user message with role `user`.
6. Persist assistant message with role `assistant`.
7. Generate `TurnSummary` with the crisis detector's `crisis_flag`.
8. Persist summary JSON and crisis flag.
9. Return assistant response, crisis result, and summary.

### Session Creation Flow

1. Validate request and confirm `case_id` exists.
2. Accept optional `session_id` and `title`.
3. Normalize omitted or whitespace-only `title` to null, trim valid titles, and
   reject over-length titles.
4. Generate a `session_id` when omitted.
5. Create a durable session row or return the existing same-case/session row
   idempotently without overwriting an existing title.
6. Return the current session metadata response shape, including nullable
   `title`.

### Session Title Rename Flow

1. Validate request shape; `title` is required but may be null.
2. Confirm `case_id` exists.
3. Confirm the session exists, including legacy message/summary-derived sessions
   that can be backfilled into a durable session row before update.
4. Normalize null, empty, or whitespace-only `title` to null; trim valid strings;
   reject titles longer than 80 characters with 422.
5. Update the session title and `sessions.updated_at` without touching
   `sessions.last_activity_at`.
6. Return the safe session metadata response shape, including nullable `title`.

### Report Generation Flow

1. Validate request and confirm `case_id` exists.
2. Load session summaries from the DB.
3. Convert each parsed `summary` dict into `TurnSummary`.
4. Call `generate_report()`.
5. Return `ConceptualizationReport`.

### Session Listing Flow

1. Validate request and confirm `case_id` exists.
2. Load explicit session metadata and legacy metadata derived from persisted
   messages and summaries.
3. Return one safe metadata object per explicit or derived session.
4. Return `[]` when the case exists but has no explicit or derived sessions.

## DB / API Mapping Rules

- Public API uses `turn_number`.
- DB internally stores turn order in `round`.
- Do not leak DB-internal `round` in HTTP responses.
- DB summary rows contain raw `summary_json`, but DB helper return values expose parsed
  `summary`.
- When persisting a summary, serialize the `TurnSummary` model to JSON.
- The `sessions` table stores safe operational metadata only: `case_id`,
  `session_id`, `created_at`, `updated_at`, `last_activity_at`, and nullable
  `title`.
- Titles are nullable operational metadata only. They are counselor-provided on
  session creation when present, never AI-generated, and must not be derived from
  raw messages, summaries, key statements, themes, crisis reasons, previews, or
  report text.
- Session rows are linked to cases and cascade on case delete.
- Existing message/summary-derived sessions are backfilled idempotently.
- `update_session_title(case_id, session_id, title)` updates nullable session
  title metadata with the shared normalization rules, updates `sessions.updated_at`,
  and does not update `sessions.last_activity_at`.
- Session metadata responses must not expose raw messages, summaries, raw
  `summary_json`, `key_statement`, themes, crisis reasons, report text,
  DB-internal `round`, or exact `crisis_level`.
- Exact `crisis_level` is not persisted in this milestone.

## Error Handling Expectations

- Missing case: return 404.
- Missing session for title rename: return 404.
- Session creation for an existing same-case/session pair is idempotent and
  returns existing metadata without overwriting title.
- Over-length session title: reject with a validation error.
- PATCH session title requires a `title` field; invalid request shape returns 422.
- PATCH session title normalizes null or whitespace-only title to null and trims
  valid title strings.
- Session listing for an existing case with no explicit or derived sessions:
  return `[]`.
- Session creation/listing/title-update helper failure: return 500 with a generic
  message that does not leak clinical content or implementation details.
- Missing session data for report generation: return a valid insufficient-data report
  if the analysis agent supports that path, or return 404 only if the case/session is
  clearly invalid. Prefer preserving existing `analysis_agent.generate_report()` behavior.
- Invalid request shape: let FastAPI/Pydantic return 422.
- Database write failure: return 500 with a generic message; avoid leaking sensitive content.
- Agent failures: preserve current agent fallback behavior rather than failing the whole route
  unless persistence itself fails.

## Safety Reference

Keep route behavior consistent with `AGENTS.md` top-level project rules and
`docs/SAFETY_REQUIREMENTS.md` detailed safety behavior. This contract intentionally
does not duplicate long clinical safety wording.
