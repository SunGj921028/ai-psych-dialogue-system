# Report Schema v2 Planning Document

This document plans the next-generation report workflow for the counseling
documentation system. It began as a planning artifact. Backend Pydantic models
for Report Schema v2 now exist under `backend/models/report_schema_v2.py`.
Backend-side `report_drafts` persistence and manual input API endpoints also
exist. Backend-only deterministic AI draft generation also exists through
`generate_report_v2_ai_draft(...)` and
`POST /api/report-drafts/{draft_id}/generate`. The first frontend ReportPage v2
manual input slice, frontend draft API helpers, and read-only five-section
preview also exist. Real provider/prompt integration, frontend generation UI,
ReportV2Preview rendering of generated fields, counselor review/final report
workflow, and PDF export are not implemented yet.

## 1. Purpose and Scope

Report Schema v2 will turn the uploaded five-section case conceptualization
template into a structured workflow for counselor-facing reports.

This plan covers:

- manual counselor input before generation
- AI-generated draft sections grounded in session data
- counselor review and editing
- backend persistence for report drafts
- future PDF export from reviewed drafts

This document is documentation only. It does not itself change backend behavior,
frontend behavior, prompts, database schema, tests, MCP work, or PDF export.

Current implementation status:

- Backend Pydantic models for Report Schema v2 are implemented in
  `backend/models/report_schema_v2.py`.
- Backend-side `report_drafts` persistence and manual input API endpoints are
  implemented.
- Frontend API helpers for loading, creating, and updating Report Schema v2
  manual input drafts are implemented.
- ReportPage includes a v2 manual input panel for the first manual-input slice.
- `frontend/src/components/ReportV2Preview.jsx` renders a read-only v2
  five-section template preview from loaded `draft.manual_input`. It does not
  call APIs, does not call `generateReport`, and does not generate content.
- Backend-only deterministic v2 AI draft generation is implemented. It does not
  call a live provider, uses `ReportAIGeneratedV2`, persists
  `ai_generated_json`, and keeps missing/unsupported fields pending for
  counselor review.
- Existing v1 `ConceptualizationReport`, `analysis_agent.generate_report()`, and
  `POST /api/reports/generate` behavior remain unchanged.
- No real v2 LLM prompt changes, live provider integration, frontend v2 generate
  button, ReportV2Preview rendering of `ai_generated` fields, counselor review
  workflow, final-report workflow, or PDF export have been implemented.

## 2. Source Materials

Source materials:

- `個案概念化報告模板.md`
- `心理學知識庫.md`
- `AGENTS.md`
- `docs/SAFETY_REQUIREMENTS.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `backend/API_CONTRACT.md`
- `frontend/UI_CONTRACT.md`

The uploaded report template is the authoritative v2 output structure for now.
Report Schema v2 should not automatically expand the report with extra
knowledge-base chapters.

The psychology knowledge base is a clinical writing and conceptualization
reference. It is not a source of case facts. Any knowledge-base concept used by
the agent must be grounded in provided case data, session summaries, persisted
crisis metadata, or counselor manual input.

## 3. Current Report System Reality

Current implementation facts:

- `POST /api/reports/generate` is the active report-generation endpoint.
- The backend currently returns the smaller `ConceptualizationReport` model.
- Current report fields include chief complaint, emotion pattern,
  cognitive-behavioral analysis, initial conceptualization, suggested
  directions, crisis summary, disclaimer, and `has_crisis`.
- `analysis_agent.generate_report()` computes the fixed disclaimer,
  `has_crisis`, and `peak_turn` in code.
- Current ReportPage is a counselor review workspace with manual-only
  generation.
- Generated reports are transient and are not persisted.
- Backend Pydantic models for the future Report Schema v2 workflow now exist in
  `backend/models/report_schema_v2.py`.
- Backend `report_drafts` persistence and manual input API endpoints now exist.
  They persist counselor manual input and backend-only deterministic v2 AI draft
  content.
- `analysis_agent.generate_report_v2_ai_draft(...)` exists beside the existing
  v1 `analysis_agent.generate_report(...)`. The v2 function is conservative and
  deterministic for now and does not call a live provider.
- `POST /api/report-drafts/{draft_id}/generate` loads a draft, requires at least
  one persisted session summary, validates/generates `ReportAIGeneratedV2`,
  persists `ai_generated_json`, updates status to `ai_generated`, sets
  `generated_at` and `updated_at`, preserves `manual_input_json`, leaves
  `final_report_json` null, and returns `ReportDraftV2`.
- ReportPage now includes a v2 manual input panel above the existing v1
  transient report generation section. The panel is for future five-section
  report manual data preparation.
- The v2 panel loads the current report draft when it exists. If no draft exists,
  it shows `尚未建立 v2 手動資料草稿` and requires explicit Create Draft.
- Drafts are not auto-created on page load. Manual input is saved only through
  backend `PATCH`.
- v1 report generation remains visually separate and behaviorally unchanged.
  v2 save does not call `generateReport`, and the v1 generate button still only
  calls existing v1 `generateReport`.
- PDF export is not implemented.
- Browser storage must not store report text, report drafts, manual clinical
  input, summaries, crisis levels, crisis reasons, case notes, titles, or other
  clinical content.

The existing `POST /api/reports/generate` endpoint should remain unchanged until
v2 is explicitly integrated into frontend workflows. The backend-only v2 draft
generation endpoint exists beside it and does not change v1 behavior.

## 4. Report Template v2 Structure

The authoritative v2 template has five sections.

### 一、基本資料與主訴

Major fields:

- 個案代號
- 年齡／性別
- 職業／就學狀態
- 婚姻／家庭狀態
- 轉介來源
- 會談次數／日期
- 1.1 主訴摘要
- 1.2 問題起始與演變
- 1.3 個案對問題的理解

Table-like structures:

- basic-information table
- problem onset/course table with 起始時間, 觸發／惡化事件, 問題發展歷程

Sensitive fields:

- demographics
- family and marital status
- referral source
- client-stated concerns and expectations

Likely manual-only fields:

- 年齡／性別
- 職業／就學狀態
- 婚姻／家庭狀態
- 轉介來源
- formal 會談次數／日期

Likely AI-draft fields:

- 主訴摘要 draft based on summaries and manually supplied context

Likely mixed fields:

- 問題起始與演變
- 個案對問題的理解

### 二、現況評估與觀察

Major fields:

- 2.1 症狀與功能影響
- 2.2 情緒模式
- 2.3 認知模式
- 2.4 行為與因應模式

Table-like structures:

- symptom/function table by domain:
  - 情緒
  - 認知
  - 行為
  - 生理
  - 人際
  - 學業／工作
  - 日常生活功能
- automatic-thought table:
  - 情境
  - 自動化思考
  - 情緒
  - 行為

Sensitive fields:

- symptoms
- functional impairment
- substance-related behavior
- sleep, appetite, and physical discomfort
- cognitive beliefs and self-critical statements

Likely manual-only fields:

- formal severity ratings if counselor-assessed
- observations not present in session summaries
- physical or substance-use details unless explicitly provided

Likely AI-draft fields:

- emotion pattern from summaries
- tentative cognitive and behavioral hypotheses
- possible automatic-thought rows when supported by session data

Likely mixed fields:

- symptom/function impact
- 誘發情境
- 強度與持續時間
- 調節方式
- 中間信念
- 核心信念
- 問題行為
- 因應策略
- 人際互動風格

### 三、心理評估

Major fields:

- 氣質／人格特質
- 防衛機制
- 內在衝突

Table-like structures:

- none in the current template

Sensitive fields:

- personality traits
- defense mechanisms
- psychodynamic interpretation
- internal conflict

Likely manual-only fields:

- formal assessment findings
- psychometric or structured interview results

Likely AI-draft fields:

- cautious hypotheses only when strongly grounded in summaries or manual input

Likely mixed fields:

- 氣質／人格特質
- 防衛機制
- 內在衝突

### 四、理論取向與個案概念化

Major fields:

- 4.1 主要理論取向
- 4.2 概念化敘述
- 形成因素
- 誘發因素
- 維持因素
- 保護因素

Table-like structures:

- checkbox-like theory orientation list:
  - 認知行為（CBT）
  - 接納與承諾（ACT）
  - 辯證行為（DBT）
  - 心理動力／精神分析
  - 人本／存在
  - 依附理論
  - 系統／家庭
  - 創傷知情
  - 其他

Sensitive fields:

- theoretical formulation
- trauma-informed framing
- family/system interpretation
- inferred causes and maintaining factors

Likely manual-only fields:

- counselor-selected theory orientation when required by practice context
- supervision-confirmed formulation choices

Likely AI-draft fields:

- tentative theory recommendations
- draft formation, precipitating, maintaining, and protective factors

Likely mixed fields:

- theory orientation
- integrated conceptualization paragraphs
- all four conceptualization-factor fields

### 五、風險評估

Major fields:

- 自殺意念
- 自殺計畫／意圖
- 自傷行為
- 他傷風險
- 物質濫用
- 精神病性症狀
- 整體風險等級
- 安全計畫／危機處置

Table-like structures:

- risk table with assessment and explanation columns
- overall risk-level checkbox
- safety-plan free-text area

Sensitive fields:

- suicide ideation, plan, intent, and behavior
- self-harm
- harm-to-others
- substance misuse
- psychotic symptoms
- overall risk level
- safety plan and crisis response

Likely manual-only fields:

- formal risk assessment
- overall risk level
- safety plan
- crisis disposition or action taken
- psychotic symptoms unless explicitly provided
- substance misuse unless explicitly provided

Likely AI-draft fields:

- summary of persisted crisis-language indicators from backend data

Likely mixed fields:

- risk explanation fields when the AI draft clearly distinguishes backend
  detected language from counselor-confirmed risk assessment

## 5. Field Ownership Policy

Each v2 field should have explicit ownership. Ownership controls who may fill the
field and how the UI should present it.

### `manual_only`

Fields that should be entered or confirmed by the counselor. The AI must not fill
these from inference.

Examples:

- demographics
- referral source
- session date/count
- testing data
- formal diagnosis notes
- formal risk level
- safety plan
- medication history
- legal issues
- trauma history
- family history

### `ai_draft`

Fields that the AI may draft from provided summaries, persisted metadata, and
manual input. These are never final until counselor-reviewed.

Examples:

- chief complaint draft
- emotion pattern
- cognitive hypotheses
- behavioral hypotheses
- conceptualization factors based on summaries
- crisis-language summary from persisted backend data

### `mixed_ai_plus_counselor_review`

Fields where an AI draft may help, but counselor review and correction are
expected before final use.

Examples:

- problem development
- symptom/function impact
- beliefs
- coping and interpersonal style
- theoretical orientation
- conceptualization narrative

### `system_owned`

Fields owned by application code, not the LLM.

Examples:

- fixed report disclaimer
- `schema_version`
- source summary IDs
- generated timestamp
- reviewed timestamp
- exported timestamp
- draft status
- computed crisis metadata

### `unsupported_until_provided`

Fields that must remain blank, null, or `待評估` unless explicitly provided by
manual input or structured source data.

Examples:

- test scores
- psychotic symptoms
- substance use
- medication
- legal issues
- trauma history
- family history
- formal treatment history
- formal diagnosis

## 6. Missing Data Policy

Missing data must be representable without forcing the AI to fill unsupported
fields.

Allowed missing representations:

- `null`
- blank string
- `待評估`

Recommended `missing_reason` values:

- `no_data`
- `not_assessed`
- `not_applicable`
- `legacy_data`

The AI must not fabricate symptoms, history, diagnosis, testing results,
medication details, legal issues, risk details, trauma history, family history,
or treatment plans.

Hypotheses require cautious wording such as:

- `可能`
- `推測`
- `尚待確認`
- `需由諮商師進一步評估`

## 7. Knowledge Base Usage Policy

The psychology knowledge base may be used for:

- clinical framing
- report-writing structure
- Traditional Chinese professional wording
- cautious conceptualization language
- theory-selection framing
- safety and privacy reminders
- distinguishing fact, inference, and recommendation

The psychology knowledge base must not be used as a source of client facts.

The agent must not:

- invent DSM diagnoses
- invent test scores
- invent treatment history
- invent medication, legal, family, or trauma history
- infer unsupported psychotic symptoms or substance use
- convert knowledge-base examples into case facts

The report must distinguish facts from inference. It should use Traditional
Chinese that is professional but readable, and it should follow de-identification
and confidentiality principles.

## 8. Proposed Report Schema v2 Direction

The backend Pydantic model slice for this direction now exists in
`backend/models/report_schema_v2.py`. The models are connected to backend-side
manual input draft persistence, API responses, the first frontend ReportPage v2
manual input slice, a read-only frontend template preview, and backend-only
deterministic v2 AI draft generation. They are not yet connected to real LLM
prompts, live provider calls, frontend generation controls, counselor
review/final report workflow, or PDF export.

Implemented model names:

- `ReportDraftV2`
- `ReportManualInputV2`
- `ReportAIGeneratedV2`
- `ReportCounselorEditsV2`
- `ReportFinalV2`
- `ReportField`
- `ReportEvidenceRefV2` / `ReportSourceRefV2`
- `ReportSafetyFlagsV2`
- draft status enum
- source type enum
- missing reason enum
- risk level enum

Recommended top-level shape:

```text
schema_version
draft_id
case_id
session_id
status
manual_input
ai_generated
counselor_edits
final_report
source_refs
safety_flags
disclaimer
timestamps
```

Recommended `status` values:

- `manual_input_started`
- `ai_generated`
- `counselor_editing`
- `reviewed`
- `exported`

Recommended field-level object metadata:

```text
label_zh
value
source_type
missing_reason
needs_review
evidence_refs
```

Recommended `source_type` values:

- `manual`
- `ai`
- `mixed`
- `system`
- `unavailable`

Recommended `evidence_refs` should prefer references such as summary IDs and
turn numbers. Duplicating raw messages should be avoided unless separately
approved.

Implemented validation and safety behavior:

- `schema_version` is fixed to `report_schema_v2`.
- `status`, `source_type`, `missing_reason`, and `risk_level` accept only strict
  allowed values.
- `ReportAIGeneratedV2` and `ReportField` reject unknown fields.
- `ReportAIGeneratedV2` rejects unknown/manual-only fields, so AI output cannot
  silently include diagnosis, medication, legal issues, testing scores, safety
  plans, formal risk level, treatment decisions, trauma/family history, or other
  counselor-owned fields.
- Missing data can be represented as null, blank-compatible values, or `待評估`.
- Missing/unsupported generated fields must remain null / `待評估` /
  `not_assessed`-compatible.
- Manual-only fields are not required in `ai_generated`.
- Evidence references use safe pointers such as `turn_number`, `summary_id`, and
  `note`.
- Evidence references do not duplicate raw message text.
- Safety flags default conservatively.
- Models do not force diagnosis, medication, legal, testing, trauma,
  family-history, or safety-plan fields when absent.
- `ReportDraftV2` can represent not-yet-generated sections as null for persisted
  drafts. `ai_generated` is populated by the backend-only generation slice;
  `counselor_edits` and `final_report` may remain null until their future
  workflow slices run.

## 9. Manual Input Workflow

ReportPage v2 is beginning as an intake and review workspace.

Recommended flow:

1. Counselor opens the report workspace for a case/session.
2. Counselor explicitly creates a v2 draft when none exists.
3. Counselor enters or updates manual input.
4. Counselor explicitly saves manual input to the backend.
5. Counselor manually generates the AI draft after a future frontend generate
   button is implemented.
6. Counselor reviews, edits, and marks the draft reviewed after future workflow
   slices exist.
7. PDF export becomes available only after future reviewed-draft support exists.

Implemented first-slice behavior:

- The v2 panel is shown above the existing v1 transient report generation
  section.
- The v2 panel loads the current report draft when one exists.
- When no draft exists, the panel shows `尚未建立 v2 手動資料草稿`.
- Drafts are created only through an explicit Create Draft action.
- Drafts are not auto-created on page load.
- Manual input is saved only through backend `PATCH`.
- v2 save does not call `generateReport`.
- The v1 generate button still only calls existing v1 `generateReport`.
- Backend-only v2 AI draft generation exists, but there is no frontend v2
  generate button yet.

Implemented optional manual fields in the first frontend slice:

- 會談日期
- 會談次數
- 轉介來源
- 年齡／性別
- 職業／就學狀態
- 婚姻／家庭狀態
- 個案對問題的理解／主訴補充
- 心理測驗／衡鑑資料補充
- 正式風險評估備註
- 安全計畫

Future intended flow:

1. Counselor opens the report workspace for a case/session.
2. Counselor creates or loads a draft.
3. Counselor enters or updates manual input.
4. Counselor explicitly saves manual input to the backend.
5. Counselor manually generates the AI draft.
6. Counselor reviews, edits, and marks the draft reviewed.
7. PDF export becomes available only after review.

Manual input should be persisted backend-side, not browser-side.

Likely manual fields needed before generation:

- report date or session date when needed for the report
- session count when needed for the report
- referral source if known
- any demographics that should appear in the report
- any counselor-owned risk notes that should constrain the draft

Optional manual fields:

- occupation or school status
- marital or family status
- testing or assessment notes
- diagnosis-related notes
- treatment or referral context
- manual risk notes
- safety-plan notes

Privacy guidance:

- Do not store manual clinical input in browser storage.
- Manual input may contain clinical content and is saved backend-side only.
- Do not store report drafts, report text, summaries, crisis reasons, case
  notes, or other clinical content in `localStorage` or `sessionStorage`.
- Browser storage policy remains unchanged: `localStorage` stores only the
  theme preference, and `sessionStorage` stores only active case/session IDs.
- Do not derive manual fields from session titles or metadata previews.
- Do not auto-fill sensitive fields unless explicitly provided by backend data or
  manual input.
- Use de-identified case codes rather than real names.

## 10. Report Draft Persistence Plan

Report draft persistence has begun and should remain the foundation before PDF
export.

Implemented table: `report_drafts`

Implemented columns:

- `id`
- `case_id`
- `session_id`
- `schema_version`
- `status`
- `manual_input_json`
- `ai_generated_json`
- `counselor_edits_json`
- `final_report_json`
- `source_summary_ids_json`
- `created_at`
- `updated_at`
- `generated_at`
- `reviewed_at`
- `exported_at`

Implemented persistence behavior:

- One current draft is enforced per `(case_id, session_id, schema_version)`.
- `schema_version` is fixed to `report_schema_v2`.
- New drafts default to status `manual_input_started`.
- Draft IDs are UUID-like.
- `manual_input_json` is persisted and validated through `ReportManualInputV2`.
- `ai_generated_json`, `counselor_edits_json`, and `final_report_json` may remain
  null until generation, counselor review, and final-report workflow slices.
- `ai_generated_json` is populated by `update_report_ai_generated(...)` during
  backend-only v2 AI draft generation.
- `source_summary_ids_json` stores pointer-only source refs / source summary IDs.
- `generated_at` is set when the backend persists v2 AI draft output.
- `reviewed_at` and `exported_at` remain future-use fields.
- Archived sessions can create and update drafts when explicitly addressed by
  case/session ID.

Implemented DB helpers:

- `create_or_get_report_draft(case_id, session_id, manual_input=None)`
- `get_current_report_draft(case_id, session_id)`
- `get_report_draft(draft_id)`
- `update_report_manual_input(draft_id, manual_input)`
- `update_report_ai_generated(draft_id, ai_generated, source_refs)`

`update_report_ai_generated(...)` validates and persists `ai_generated_json`,
stores pointer-only source refs / source summary IDs, updates status to
`ai_generated`, sets `generated_at` and `updated_at`, preserves
`manual_input_json`, and leaves `final_report_json` null.

Implemented frontend API helpers:

- `getCurrentReportDraft(caseId, sessionId)`
- `createReportDraft(caseId, sessionId, payload = {})`
- `updateReportDraftManualInput(draftId, payload)`

These helpers call the backend Report v2 draft endpoints and are used by
ReportPage's manual input panel.

Data that should not be stored:

- raw provider prompts
- raw LLM responses
- API keys or secrets
- duplicated raw messages unless separately approved
- crisis reasons unless separately designed
- raw crisis detector reasons
- provider debug output

Report persistence increases privacy responsibility. The future implementation
should keep generic non-leaking errors, avoid sensitive logs, and preserve the
existing browser-storage prohibition.

## 11. Agent / Prompt Strategy

Initial strategy:

- Keep the v1 report endpoint unchanged.
- Add Report Schema v2 beside v1.
- Keep the current backend-only v2 generation deterministic and conservative
  until real provider/prompt integration is designed.
- Do not rewrite the current prompt as part of this backend-only slice.

Current backend-only `analysis_agent` v2 behavior:

- `generate_report_v2_ai_draft(...)` accepts session summaries and manual input.
- It returns `ReportAIGeneratedV2`.
- It does not call a live provider.
- It returns schema-valid pending/missing fields rather than fabricated content.

Future real-provider `analysis_agent` v2 should accept:

- session summaries
- persisted `crisis_level` metadata
- manual input
- template/schema instructions
- curated knowledge-base excerpts

The LLM should fill only AI-owned fields. Manual-only and system-owned fields
must remain outside LLM control.

Code should own:

- fixed disclaimer
- timestamps
- status
- source IDs
- schema validation
- derived crisis metadata

Invalid, incomplete, or unsafe LLM output must not become fabricated content.
Parsing and validation failures should produce safe missing-data fields or a
fallback draft.

Future tests should use mocked LLM outputs and should not call live providers.

## 12. API Roadmap

Implemented v2 draft endpoints:

- `GET /api/cases/{case_id}/sessions/{session_id}/report-drafts/current`
- `POST /api/cases/{case_id}/sessions/{session_id}/report-drafts`

  Optional request body:

  ```json
  {
    "manual_input": {}
  }
  ```

- `PATCH /api/report-drafts/{draft_id}/manual-input`

  Request body:

  ```json
  {
    "manual_input": {}
  }
  ```

- `POST /api/report-drafts/{draft_id}/generate`

  Behavior:

  - loads the report draft
  - requires at least one persisted session summary
  - returns 422 if no summaries exist
  - calls deterministic/conservative `generate_report_v2_ai_draft(...)`
  - validates/generates `ReportAIGeneratedV2`
  - persists `ai_generated_json`
  - stores pointer-only source refs / source summary IDs
  - updates status to `ai_generated`
  - sets `generated_at` and `updated_at`
  - preserves `manual_input_json`
  - leaves `final_report_json` null
  - returns `ReportDraftV2`

Each endpoint returns `ReportDraftV2`. Missing case/session/draft states return
404, invalid manual input or no-summary generation requests return 422, and
unexpected helper/DB failures or invalid agent output return generic non-leaking
500 responses.

Future endpoints:

- `PATCH /api/report-drafts/{draft_id}`
- `POST /api/report-drafts/{draft_id}/review`
- `POST /api/report-drafts/{draft_id}/export-pdf`

The existing `POST /api/reports/generate` endpoint remains unchanged.

Future endpoint behavior should include:

- schema versioning
- generic non-leaking errors
- explicit status transitions
- no browser-storage dependency
- no raw prompt or raw provider response exposure
- validation that manual-only fields are not overwritten by AI generation

## 13. Frontend ReportPage v2 Roadmap

ReportPage v2 has added the first manual-input and read-only preview slices:

- manual input form/panel
- current draft load
- missing-draft Create Draft state
- explicit Create Draft flow
- manual input PATCH save flow
- `ReportV2Preview` component at `frontend/src/components/ReportV2Preview.jsx`
- read-only five-section preview from loaded `draft.manual_input`
- missing-draft preview prerequisite state: `需先建立 v2 草稿後才可預覽`
- template sections: `一、基本資料與主訴`, `二、現況評估與觀察`, `三、心理評估`,
  `四、理論取向與個案概念化`, and `五、風險評估`
- manual field mapping into the template, including session date/count,
  referral source, age/gender, occupation/school status, marital/family status,
  client understanding, assessment/testing data, overall risk notes, and safety
  plan
- missing manual fields displayed as `待評估`
- future AI/counselor-owned fields displayed as
  `此欄位待未來 AI 草稿或諮商師補充`
- missing risk fields never displayed as `無風險`
- v1/v2 visual and behavioral separation

The preview is client-side rendering from already loaded draft state. It does
not call APIs, does not call `generateReport`, does not call `analysis_agent`,
and does not generate or infer report content.

Still future:

- frontend generate and regenerate draft button
- ReportV2Preview rendering of `ai_generated` field population
- source/evidence display
- counselor edit and review controls
- reviewed/export-ready status display
- PDF export button disabled until reviewed

ReportPage v2 must not store report drafts, report preview text, report text,
manual input, source snippets, summaries, crisis levels, crisis reasons, case
notes, or clinical content in browser storage.

Regeneration should clearly communicate what will be replaced and what will be
preserved. A safe default is to preserve manual input and counselor edits unless
the counselor explicitly chooses otherwise.

## 14. PDF Export Strategy

PDF export should wait until persisted reviewed report drafts exist.

Recommended approach:

- generate PDF backend-side
- export only from a reviewed draft
- place the fixed disclaimer prominently
- use Traditional Chinese capable fonts
- use de-identified filenames
- keep report layout aligned with the five-section template
- avoid including real client names unless a future policy explicitly allows it

Possible filename pattern:

```text
case-{case_code}_session-{session_date}_report-v2.pdf
```

PDF tests and visual QA should be added later after the HTML/report rendering
and draft persistence are stable.

## 15. Testing Strategy

Backend tests should cover:

- schema validation
- manual input validation
- report draft CRUD
- deterministic v2 AI draft fallback
- mocked LLM/provider parsing when real provider integration is added later
- missing data behavior
- no fabricated manual-only fields
- generic non-leaking errors
- future PDF export behavior after export is implemented

Current backend model tests cover:

- valid minimal drafts
- fixed schema version
- missing data behavior
- enum validation
- evidence references
- manual-only separation from AI-generated fields
- unknown/manual-only field rejection in `ReportAIGeneratedV2`
- conservative safety-flag defaults
- JSON-compatible serialization
- invalid values
- persisted drafts can represent not-yet-generated sections as null

Current backend draft persistence and route tests cover:

- `report_drafts` table creation
- create/get current draft
- one-current-draft behavior
- UUID-like draft IDs
- default `manual_input_started` status
- fixed `report_schema_v2` schema version
- manual input validation through `ReportManualInputV2`
- partial/empty manual input
- invalid manual input
- timestamp updates
- deterministic v2 agent fallback
- v2 generate route success
- missing draft 404
- no summaries 422
- invalid agent output
- DB/helper failure
- persistence of `ai_generated_json`
- status transition to `ai_generated`
- `generated_at`
- manual input preservation
- `final_report_json` remaining null
- safe pointer-only source refs / source summary IDs
- archived session support
- route 404/422/500 behavior
- v1 report route preservation

Frontend tests should cover:

- API helper contracts for current draft load, draft creation, and manual input
  update
- current draft load
- missing-draft create state
- Create Draft flow
- manual input form editing and saving
- save success/error behavior
- v1/v2 separation
- missing session behavior
- storage safety
- generation workflow
- missing data display
- review/edit workflow
- no browser storage of report text or drafts
- PDF disabled until reviewed

Current frontend tests cover the implemented first slices: API helper contracts,
current draft load, missing-draft create state, Create Draft flow,
editing/saving manual input, save success/error behavior, read-only preview
prerequisite state, five-section headings, manual field mapping, missing-data
placeholders, future placeholder wording, risk missing behavior, save-to-preview
updates, v1/v2 separation, missing session behavior, and storage safety.

All tests should remain deterministic and should not call live LLM providers.

## 16. Staged Implementation Roadmap

Recommended implementation slices:

1. Docs/schema planning artifact. Completed.
2. Backend Pydantic models for Report Schema v2. Completed.
3. Backend `report_drafts` persistence and manual input API. Completed.
4. Frontend ReportPage v2 manual input form and frontend API helpers. Completed
   for the first manual-input slice.
5. ReportPage v2 read-only rendering. Completed for the first manual-input
   preview slice.
6. Backend-only deterministic `analysis_agent` v2 draft generation. Completed.
7. Backend v2 generate route and `ai_generated_json` persistence. Completed.
8. Real provider/prompt integration for v2. Future work.
9. Frontend v2 generate button. Future work.
10. ReportV2Preview rendering of `ai_generated` fields. Future work.
11. Counselor edit/review status flow. Future work.
12. PDF export planning and implementation. Future work.

Each implementation slice should be small, testable, and reviewable. Safety and
browser-storage regression tests should accompany behavior changes.

## 17. Explicitly Out of Scope

Out of scope for this planning slice:

- immediate PDF implementation
- immediate prompt rewrite
- live provider integration for v2
- frontend v2 generate button
- ReportV2Preview rendering of generated fields
- diagnosis automation
- medication advice
- emergency workflow automation
- treatment plan automation
- browser storage of report drafts
- charts/Recharts
- MCP
- provider/API key settings
- hard delete

## 18. Open Questions / Human Decisions

Human decisions needed before coding:

- Which manual fields are required before generation?
- Should there be one active draft per session or versioned drafts?
- Should counselor edits overwrite generated fields, or layer on top?
- What status is required before PDF export?
- Should evidence references show turn numbers only, or also summary snippets?
- Does a formal treatment plan belong in v2, or should it remain a later
  expansion?
- Should any diagnosis-related section remain limited to `診斷性思考` only?
- Should regeneration preserve counselor edits by default?
- Should report drafts support archive or lock behavior after export?
