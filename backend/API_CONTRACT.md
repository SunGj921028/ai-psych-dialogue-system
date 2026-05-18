# Backend API Contract

This document defines the planned HTTP API contract for Task 09. It describes
target behavior before router implementation. Current source code is still the
implementation truth.

## Endpoint Status Labels

- current: implemented and active today.
- Task 09 target: should be implemented during the HTTP API route task.
- future: intended later, not required for Task 09.

## Current API Status

| Method | Path | Status | Notes |
|---|---|---|---|
| GET | `/health` | current | Returns `{"status": "ok"}`. |

Router files currently contain placeholders and are not mounted in `backend/main.py`.

## Planned Task 09 Endpoints

Task 09 may introduce route-level request/response Pydantic models when needed.
Reuse existing agent models for nested agent data instead of duplicating them.

### Cases

#### Create Case

Status: Task 09 target

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

Status: Task 09 target

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

Status: Task 09 target

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

Status: Task 09 target

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

Status: Task 09 target

`POST /api/conversation/turn`

Request:

```json
{
  "case_id": "uuid",
  "session_id": "frontend-generated-uuid",
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
  "session_id": "frontend-generated-uuid",
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
- `summary.crisis_flag` must use the crisis detector result.
- The frontend-generated `session_id` should be accepted; the backend does not generate it.

### Session Messages

#### Get Session Messages

Status: Task 09 target

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

Status: Task 09 target

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

Status: Task 09 target

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

## Future Endpoints

These are not required for Task 09:

- Session listing and session metadata endpoints.
- Latest summaries endpoint for dashboards.
- PDF export endpoint.
- Prompt/settings management endpoints.
- MCP-related HTTP bridge endpoints.

## Open Decisions

- Session/report coordination: decide how `session_id` should reach report generation
  and frontend report views. Options include a query parameter, route segment,
  navigation state, or a future session selector.

## Expected Backend Data Flow

### Conversation Turn Flow

1. Validate request and confirm `case_id` exists.
2. Convert `conversation_history` into existing `ConversationMessage` models.
3. Run `generate_response()` and `detect_crisis()` concurrently.
4. Persist user message with role `user`.
5. Persist assistant message with role `assistant`.
6. Generate `TurnSummary` with the crisis detector's `crisis_flag`.
7. Persist summary JSON and crisis flag.
8. Return assistant response, crisis result, and summary.

### Report Generation Flow

1. Validate request and confirm `case_id` exists.
2. Load session summaries from the DB.
3. Convert each parsed `summary` dict into `TurnSummary`.
4. Call `generate_report()`.
5. Return `ConceptualizationReport`.

## DB / API Mapping Rules

- Public API uses `turn_number`.
- DB internally stores turn order in `round`.
- Do not leak DB-internal `round` in HTTP responses.
- DB summary rows contain raw `summary_json`, but DB helper return values expose parsed
  `summary`.
- When persisting a summary, serialize the `TurnSummary` model to JSON.

## Error Handling Expectations

- Missing case: return 404.
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
