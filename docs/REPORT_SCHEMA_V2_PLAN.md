# Report Schema v2 Planning Document

This document plans the next-generation report workflow for the counseling
documentation system. It began as a planning artifact. Backend Pydantic models
for Report Schema v2 now exist under `backend/models/report_schema_v2.py`.
Backend-side `report_drafts` persistence and manual input API endpoints also
exist. Backend-only deterministic AI draft generation also exists through
`generate_report_v2_ai_draft(...)` and
`POST /api/report-drafts/{draft_id}/generate`. The frontend ReportPage manual
input slice, frontend draft API helpers including
`generateReportDraftV2(draftId)`, the separate AI draft generation action,
read-only simplified preview rendering, product-facing user-visible report
labels, and `ReportV2PrintView` browser print-friendly view also exist. Backend
Report v2 prompt/input builder helpers and provider output parser now exist,
disabled-by-default provider mode is implemented, and the post-demo
prompt/preview refinement batch is complete. Counselor review/final report
workflow, reviewed status, charts/Recharts planning, production
deployment/testing, and true PDF export are not implemented yet.

## 1. Purpose and Scope

Report Schema v2 will turn the uploaded five-section case conceptualization
template into a structured workflow for counselor-facing reports.

This plan covers:

- manual counselor input before generation
- AI-generated draft sections grounded in session data
- counselor review and editing
- backend persistence for report drafts
- future true PDF export from reviewed drafts

This document is documentation only. It does not itself change backend behavior,
frontend behavior, prompts, database schema, tests, MCP work, or true PDF
export.

Current implementation status:

- Backend Pydantic models for Report Schema v2 are implemented in
  `backend/models/report_schema_v2.py`.
- Backend-side `report_drafts` persistence and manual input API endpoints are
  implemented.
- Frontend API helpers for loading, creating, updating, and generating Report
  Schema v2 drafts are implemented. `generateReportDraftV2(draftId)` calls
  `POST /api/report-drafts/{draft_id}/generate`, sends no payload, and returns
  the updated `ReportDraftV2`.
- ReportPage includes a report manual input panel for the first manual-input
  slice. User-facing labels use product-facing wording such as
  `個案概念化報告草稿`, `報告手動資料`, `AI 草稿產生`,
  `個案概念化報告預覽`, and `需先建立報告草稿後才可預覽`; internal Report Schema
  v2 code/API/schema names remain unchanged.
- `frontend/src/components/ReportV2Preview.jsx` renders a read-only simplified
  v2 preview from loaded draft state, including inline `draft.ai_generated`
  fields when present. It does not call APIs, does not call `generateReport`,
  and does not generate content.
- `frontend/src/components/ReportV2PrintView.jsx` renders a clean
  browser-print-friendly report document opened through `列印友善檢視`. It uses
  the print title `個案概念化報告`, supports browser print / save-as-PDF through
  `window.print()`, keeps the Traditional Chinese global review/safety
  disclaimer, hides per-field AI draft labels and turn-number evidence refs, and
  excludes workflow controls, charts, raw IDs, raw clinical/provider/debug
  content, and v1 legacy UI. This is not true PDF export.
- Backend-only deterministic v2 AI draft generation is implemented as the
  default mode. It does not call a provider, uses `ReportAIGeneratedV2`,
  persists `ai_generated_json`, and keeps missing/unsupported fields pending for
  counselor review.
- Backend Report v2 prompt/input builder helpers are implemented with
  `REPORT_V2_PROMPT_VERSION = "report_v2_prompt_001"`.
- Backend Report v2 provider output parsing is implemented for provider mode.
- Disabled-by-default Report v2 provider mode is implemented. Unset or blank
  `REPORT_V2_PROVIDER_MODE` defaults to `deterministic`; allowed values are
  `deterministic` and `provider`; invalid explicit values fail closed.
- `REPORT_V2_MODEL` is implemented for provider mode only. If unset, it falls
  back to `ANALYSIS_MODEL`, then the existing default model.
- Existing v1 `ConceptualizationReport`, `analysis_agent.generate_report()`, and
  `POST /api/reports/generate` behavior remain unchanged.
- Manual local provider smoke testing has passed with synthetic data after
  provider field metadata normalization. Post-demo refinements are implemented:
  risk-language screening prompt guidance, client-understanding draft guidance,
  theoretical-orientation rationale wording, preview simplification, and
  ReportPage layout order, print-friendly view, and user-facing version-label
  cleanup. Counselor review workflow, final-report workflow, reviewed status,
  charts/Recharts planning, production deployment/testing, documentation after
  future slices, and true PDF export remain future work.

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
  v1 `analysis_agent.generate_report(...)`. The v2 function defaults to
  conservative deterministic mode and does not call a provider unless
  `REPORT_V2_PROVIDER_MODE=provider` is explicitly set.
- `REPORT_V2_PROMPT_VERSION = "report_v2_prompt_001"` exists.
- Backend Report v2 prompt/input builder helpers use fixed curated knowledge-base
  excerpts and safety instructions, shape summaries into safe provider input,
  bound/truncate `key_statement`, and exclude raw messages, crisis detector
  reasons, DB-internal `round`, and session title.
- Post-demo Report v2 prompt refinements are implemented. The
  `crisis_language_summary` prompt instructs dialogue-based risk-language
  screening from structured summaries and persisted `crisis_level` metadata
  only. It covers suicide ideation, plan/intent, self-harm, harm-to-others,
  substance use, psychotic symptoms, and overall screening impression;
  distinguishes explicit denial from absent data; and remains non-formal and
  counselor-review-only.
- `client_understanding_draft` guidance is clarified: manual client
  understanding remains counselor-owned and primary, and AI client
  understanding is only supplemental draft text requiring review.
- `theoretical_orientation_rationale` guidance now requires the generated text
  to begin with `初步建議取向：...` and uses evidence-based multi-orientation
  prompting. CBT is one possible option, not the default or only supported
  answer. The prompt asks the provider to consider structured summaries,
  persisted manual input, and curated psychology orientation cues, including
  CBT, humanistic / person-centered, psychodynamic, attachment, interpersonal,
  family systems, solution-focused brief counseling, narrative, trauma-informed,
  and integrative orientations. `待與督導確認` is reserved for insufficient, mixed,
  or indistinguishable evidence. No schema field was added.
- Backend Report v2 provider output parsing accepts JSON string or dict input,
  rejects invalid JSON and non-object JSON, validates with
  `ReportAIGeneratedV2`, rejects unknown/manual-only fields through strict schema
  validation, and rejects unsafe evidence ref notes. Parser normalization handles
  provider `source_type` and `missing_reason` variants for known
  `ReportAIGeneratedV2` fields, while unknown/manual-only fields remain
  rejected. Evidence notes are limited to pointer-only labels such as
  `summary metadata`, `manual input`, and `persisted crisis level`.
- `_call_report_v2_provider(...)` exists as a Gemini-style provider boundary
  used only when provider mode is explicitly enabled. Provider mode builds v2
  prompt/messages, calls the boundary, parses provider output, validates it as
  `ReportAIGeneratedV2`, and returns only validated output.
- Provider failures, invalid provider output, and invalid provider mode fail
  closed. Provider failures do not persist a conservative empty fallback as
  successful AI generation and do not overwrite existing `ai_generated_json`.
- Report v2 provider/generation errors are classified internally as
  `missing_summaries`, `provider_config`, `provider_api_failure`,
  `invalid_provider_json`, `schema_validation_failed`, `unsafe_evidence_refs`,
  `db_persistence_failed`, or `unknown_generation_failure`. Public route
  responses remain generic and non-leaking. Route diagnostics log only the
  category plus IDs and do not expose raw prompts, raw provider responses,
  secrets, provider exception text, clinical text, or traces.
- `POST /api/report-drafts/{draft_id}/generate` loads a draft, requires at least
  one persisted session summary, validates/generates `ReportAIGeneratedV2`,
  persists `ai_generated_json`, updates status to `ai_generated`, sets
  `generated_at` and `updated_at`, preserves `manual_input_json`, leaves
  `final_report_json` null, and returns `ReportDraftV2`.
- ReportPage now includes a report manual input panel above the existing v1
  transient report generation section. The panel is for five-section report
  manual data preparation, while visible labels avoid implementation/version
  wording such as `v2`.
- The report panel loads the current report draft when it exists. If no draft
  exists, it shows product-facing prerequisite copy such as
  `需先建立報告草稿後才可預覽` and requires explicit Create Draft.
- Drafts are not auto-created on page load. Manual input is saved only through
  backend `PATCH`.
- v1 report generation remains visually separate and behaviorally unchanged.
  v2 save does not call `generateReport`, and the v1 generate button still only
  calls existing v1 `generateReport`.
- ReportPage includes a separate `AI 草稿產生` action card between the manual
  input panel and the report preview. It blocks generation when manual input has
  unsaved changes, disables generation while saving or generating, updates local
  `reportDraft` from the backend response, shows
  insufficient-summary 422 guidance without user-facing `v2` wording, and
  links back to the conversation workspace when case/session IDs are available.
- v2 generation calls only `generateReportDraftV2`; v1 generation calls only
  `generateReport`. v2 generated data does not populate v1 report state, and v1
  report generation does not alter `reportDraft`.
- Browser print / save-as-PDF through the print-friendly report view is
  implemented. True PDF export is not implemented.
- Browser storage must not store generated report text, `ai_generated` JSON,
  report drafts, manual clinical input, summaries, crisis levels, crisis
  reasons, case notes, titles, or other clinical content.

The existing `POST /api/reports/generate` endpoint remains unchanged. The
backend-only v2 draft generation endpoint exists beside it, keeps its
deterministic/conservative default behavior, and does not change v1 or
ReportPage frontend behavior.

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

Manual `safety_plan` is counselor/manual content only. The preview may render it
only when the counselor has provided it, and it must be labeled as manual rather
than AI-generated.

### `ai_draft`

Fields that the AI may draft from provided summaries, persisted metadata, and
manual input. These are never final until counselor-reviewed.

Examples:

- chief complaint draft
- emotion pattern
- cognitive hypotheses
- behavioral hypotheses
- conceptualization factors based on summaries
- crisis-language summary from structured summaries and persisted backend
  `crisis_level` metadata only
- supplemental client-understanding draft, clearly secondary to counselor-owned
  manual client understanding

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

`theoretical_orientation_rationale` may include a cautious AI suggestion, but it
must begin with `初步建議取向：...` and remain a draft rationale for counselor
review. It should select a tentative orientation from the available evidence and
curated orientation cues rather than defaulting to CBT. `待與督導確認` remains
appropriate when data are insufficient, mixed, or not enough to distinguish
among plausible orientations.

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
manual input draft persistence, API responses, the first frontend ReportPage
manual input slice, a read-only frontend template preview that renders
`ai_generated` fields, frontend AI generation controls, and backend-only
deterministic v2 AI draft generation. Backend prompt/input builder helpers and
provider output parser now exist, and disabled-by-default provider mode is
implemented. Manual local provider smoke testing and the post-demo prompt and
preview refinement batch are complete. Counselor review/final report workflow,
reviewed status, true PDF export, charts/Recharts planning, production
deployment/testing, and docs after future slices remain future work.

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

ReportPage is an intake and review workspace for the Report Schema v2 draft
model. The visible UI now presents this as the product-facing
`個案概念化報告` workflow rather than exposing version labels.

Recommended flow:

1. Counselor opens the report workspace for a case/session.
2. Counselor explicitly creates a report draft when none exists.
3. Counselor enters or updates manual input.
4. Counselor explicitly saves manual input to the backend.
5. Counselor manually generates the AI draft through the separate generation
   action.
6. Counselor reviews, edits, and marks the draft reviewed after future workflow
   slices exist.
7. True PDF export becomes available only after future reviewed-draft support
   exists.

Implemented first-slice behavior:

- The report panel is shown above the existing v1 transient report generation
  section.
- The report panel loads the current report draft when one exists.
- When no draft exists, the UI uses product-facing empty/prerequisite wording.
- Drafts are created only through an explicit Create Draft action.
- Drafts are not auto-created on page load.
- Manual input is saved only through backend `PATCH`.
- v2 save does not call `generateReport`.
- The v1 generate button still only calls existing v1 `generateReport`.
- The separate `AI 草稿產生` card calls internal `generateReportDraftV2(draftId)`,
  blocks generation while manual input has unsaved changes, disables generation
  while saving or generating, updates local `reportDraft` from the backend
  response, and shows no-summary 422 guidance without user-facing `v2` wording.
- The v2 generate action is separate from v1 transient report generation. v2
  generation does not populate v1 report state, and v1 generation does not alter
  `reportDraft`.

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
7. True PDF export becomes available only after review.

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
- `generateReportDraftV2(draftId)`

These helpers call the backend Report v2 draft endpoints and are used by
ReportPage's manual input panel and separate v2 generation action card.
`generateReportDraftV2(draftId)` calls
`POST /api/report-drafts/{draft_id}/generate`, sends no payload, and returns the
updated `ReportDraftV2`.

Data that should not be stored:

- raw provider prompts
- raw LLM responses
- API keys or secrets
- duplicated raw messages unless separately approved
- crisis reasons unless separately designed
- raw crisis detector reasons
- provider debug output

Current prompt/provider-parser slice behavior:

- raw prompts and raw provider responses are not persisted
- raw messages are not used
- crisis detector reasons are not used
- session titles are not used as provider input
- knowledge-base excerpts are reference/writing guidance only, not case facts
- API keys and provider secrets are not exposed in route responses
- provider-mode failures do not overwrite existing `ai_generated_json`

Report persistence increases privacy responsibility. The future implementation
should keep generic non-leaking errors, avoid sensitive logs, and preserve the
existing browser-storage prohibition.

## 11. Agent / Prompt Strategy

Initial strategy:

- Keep the v1 report endpoint unchanged.
- Add Report Schema v2 beside v1.
- Keep v2 generation deterministic and conservative by default.
- Keep provider prompt/input preparation and provider output parsing behind
  backend boundaries; route defaults do not call a provider.
- Enable provider behavior only through explicit backend configuration.

Current backend-only `analysis_agent` v2 behavior:

- `generate_report_v2_ai_draft(...)` accepts session summaries and manual input.
- It returns `ReportAIGeneratedV2`.
- In unset, blank, or explicit deterministic mode, it does not call a provider
  and returns schema-valid pending/missing fields rather than fabricated content.
- In provider mode, it builds v2 prompt/messages, calls the Report v2 provider
  boundary, parses provider output, validates it as `ReportAIGeneratedV2`, and
  returns only validated output.
- `REPORT_V2_PROVIDER_MODE` accepts `deterministic` or `provider`; unset or
  blank defaults to `deterministic`, and invalid explicit values fail closed.
- `REPORT_V2_MODEL` is used only in provider mode. If unset, it falls back to
  `ANALYSIS_MODEL`, then the existing default model.

Current prompt/input builder behavior:

- `REPORT_V2_PROMPT_VERSION = "report_v2_prompt_001"` identifies the prompt
  payload contract.
- Builder helpers use fixed curated knowledge-base excerpts and safety
  instructions.
- Summaries are shaped into safe provider input with `turn_number`, summary
  metadata, persisted `crisis_level`, and bounded/truncated `key_statement`.
- Raw messages, crisis detector reasons, DB-internal `round`, and session title
  are excluded.
- Knowledge-base excerpts are writing/reference guidance only and are not case
  facts.
- `crisis_language_summary` is instructed as dialogue-based risk-language
  screening, not a formal risk assessment. It uses only structured summaries and
  persisted `crisis_level` metadata, covers suicide ideation, plan/intent,
  self-harm, harm-to-others, substance use, psychotic symptoms, and overall
  screening impression, and must distinguish explicit denial from absent data.
- `client_understanding_draft` is AI supplemental draft text requiring
  counselor review; the manual client-understanding field remains primary and
  counselor-owned.
- `theoretical_orientation_rationale` should begin with
  `初步建議取向：...`, frame CBT as one possible orientation rather than the
  default, and allow non-CBT orientations when supported by structured summaries,
  persisted manual input, and curated psychology cues. `待與督導確認` should be
  used for insufficient, mixed, or indistinguishable evidence.

Current provider parser behavior:

- The parser accepts either a JSON string or a dict.
- It rejects invalid JSON and non-object JSON.
- It validates output with `ReportAIGeneratedV2`.
- It rejects unknown/manual-only fields through strict schema validation.
- It normalizes provider `source_type` and `missing_reason` variants for known
  `ReportAIGeneratedV2` fields.
- It rejects unsafe evidence ref notes.
- Evidence notes are limited to pointer-only labels such as `summary metadata`,
  `manual input`, and `persisted crisis level`.

Current provider boundary behavior:

- `_call_report_v2_provider(...)` exists and uses the existing Gemini-style
  provider infrastructure in explicit provider mode.
- Automated tests monkeypatch the provider boundary and do not call live
  providers.
- `POST /api/report-drafts/{draft_id}/generate` remains
  deterministic/conservative by default.
- Provider failures, invalid JSON, schema validation failures,
  forbidden/manual-only fields, unsafe evidence refs, and invalid mode values
  fail closed. Route responses remain generic and non-leaking.
- Provider failures do not persist a conservative empty fallback as success and
  do not overwrite existing `ai_generated_json`.
- Internal generation error categories are `missing_summaries`,
  `provider_config`, `provider_api_failure`, `invalid_provider_json`,
  `schema_validation_failed`, `unsafe_evidence_refs`, `db_persistence_failed`,
  and `unknown_generation_failure`. They support diagnostics without exposing
  raw prompts, raw provider responses, secrets, provider exception text,
  clinical text, or traces in public responses.

The LLM should fill only AI-owned fields. Manual-only and system-owned fields
must remain outside LLM control.

Code should own:

- fixed disclaimer
- timestamps
- status
- source IDs
- schema validation
- derived crisis metadata

Invalid, incomplete, or unsafe provider output must not become fabricated
content. Parsing and validation failures fail closed in provider mode.

Tests use mocked or monkeypatched provider outputs and should not call live
providers.

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
  - calls `generate_report_v2_ai_draft(...)`
  - defaults to deterministic/conservative generation with no provider call
  - can use provider mode only when `REPORT_V2_PROVIDER_MODE=provider`
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
unexpected helper/DB failures, invalid agent output, provider failures, invalid
provider output, or invalid provider mode return generic non-leaking 500
responses. Provider failures do not overwrite existing `ai_generated_json`.
Internally, generation failures are classified as `missing_summaries`,
`provider_config`, `provider_api_failure`, `invalid_provider_json`,
`schema_validation_failed`, `unsafe_evidence_refs`, `db_persistence_failed`, or
`unknown_generation_failure`; this classification is for logs/diagnostics only
and public responses must remain generic.

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

## 13. Frontend ReportPage Roadmap

ReportPage has added the manual-input, AI generation action, read-only preview,
print-friendly view, and user-facing version-label cleanup slices:

- `會談整理輔助` appears before the main report workflow
- report manual input, generation, preview, and print-friendly viewing use
  product-facing labels such as `個案概念化報告草稿`, `報告手動資料`,
  `AI 草稿產生`, `個案概念化報告預覽`, and `列印友善檢視`
- internal Report Schema v2 component/API/schema names remain unchanged
- v1 transient report generation is lower on the page and labeled
  `舊版 v1 暫存報告`
- manual input form/panel
- current draft load
- missing-draft Create Draft state
- explicit Create Draft flow
- manual input PATCH save flow
- `generateReportDraftV2(draftId)` helper contract
- separate `AI 草稿產生` action card between manual input and preview
- unsaved manual input blocking before v2 generation
- saving/generating disabled states
- friendly insufficient-summary 422 text without user-facing `v2` wording
- lightweight link back to the conversation workspace when case/session IDs are
  available
- `ReportV2Preview` component at `frontend/src/components/ReportV2Preview.jsx`
- read-only simplified preview from loaded draft state, including
  demo-useful `draft.manual_input` and `draft.ai_generated` fields
- missing-draft preview prerequisite state: `需先建立報告草稿後才可預覽`
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
- AI-generated fields labeled `AI 草稿，需諮商師審閱`
- manual `client_understanding` takes precedence, with AI client understanding
  shown as `AI 補充草稿` when manual text exists
- `crisis_language_summary` remains visible
- hidden from the main preview: `正式風險評估備註`, `晤談觀察`,
  `症狀與功能影響`, `防衛機制`, and `內在衝突`
- manual `safety_plan` renders only when provided and is labeled as
  counselor/manual content
- evidence refs shown as turn-number-only pointers
- raw summaries, raw messages, key statements, crisis reasons, provider output,
  AI formal risk level, and AI safety plan are not rendered
- v1/v2 visual and behavioral separation
- `ReportV2PrintView` component at
  `frontend/src/components/ReportV2PrintView.jsx`
- print-friendly view title: `個案概念化報告`
- browser print / save-as-PDF support through `window.print()`
- print-friendly view keeps a single Traditional Chinese global
  AI/counselor-review disclaimer
- print-friendly view hides repeated per-field `AI 草稿，需諮商師審閱` labels and
  turn-number evidence refs while preserving actual report content, section
  headings, field labels, and `待評估`
- print-friendly view excludes manual edit controls, create/save/generate
  controls, v1 legacy UI, charts, raw session IDs, raw messages, raw summaries,
  raw prompts, raw provider responses, crisis reason/debug text, and
  provider/debug content

The preview is client-side rendering from already loaded draft state. It does
not call APIs, does not call `generateReport`, does not call `analysis_agent`,
and does not generate or infer report content.

Still future:

- counselor edit and review controls
- reviewed/export-ready status display
- true PDF export button or backend/generated PDF export after reviewed-draft
  support exists

ReportPage must not store report drafts, report preview text, generated
report text, `ai_generated` JSON, manual input, source snippets, summaries,
crisis levels, crisis reasons, case notes, or clinical content in browser
storage.

Regeneration should clearly communicate what will be replaced and what will be
preserved. A safe default is to preserve manual input and counselor edits unless
the counselor explicitly chooses otherwise.

## 14. PDF Export Strategy

The current print-friendly report view supports browser print / save-as-PDF. It
is intentionally frontend-only and does not generate a file or call a backend PDF
service.

True PDF export should wait until persisted reviewed report drafts exist.

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
- disabled-by-default provider mode
- provider mode with monkeypatched provider outputs
- provider model fallback behavior
- provider failure and invalid mode fail-closed behavior
- prompt payload safety and source shaping
- provider output parsing with mocked payloads
- missing data behavior
- no fabricated manual-only fields
- generic non-leaking errors
- future true PDF export behavior after export is implemented

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
- provider mode success with monkeypatched provider output
- provider failure returning generic non-leaking errors
- no overwrite of existing `ai_generated_json` on provider failure
- no-summary requests returning 422 before provider calls
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

Current backend prompt/parser/provider-boundary tests cover:

- prompt payload safety and source shaping
- message safety instructions
- dialogue-based `crisis_language_summary` risk screening guidance from
  summaries and persisted `crisis_level` only
- explicit-denial versus absent-data risk-language handling
- AI `client_understanding_draft` as supplemental review-needed text
- `theoretical_orientation_rationale` beginning with `初步建議取向：...`,
  evidence-based multi-orientation prompt/message guidance, CBT-as-one-option
  wording, and `待與督導確認` reserved for insufficient/mixed evidence
- non-CBT `theoretical_orientation_rationale` parser regression, such as
  `人本／個人中心取向`, with strict manual-only/unknown field rejection preserved
- unset/default deterministic mode
- explicit deterministic mode
- provider mode with monkeypatched provider output
- `REPORT_V2_MODEL` fallback behavior
- valid provider parser output
- invalid JSON rejection
- non-object JSON rejection
- unknown/manual-only field rejection through `ReportAIGeneratedV2`
- unsafe evidence ref note rejection
- provider exception fail-closed behavior
- invalid provider mode fail-closed behavior
- internal provider/generation error classification with generic non-leaking
  public responses
- provider boundary behavior through monkeypatched Gemini-style infrastructure
- v1 `analysis_agent.generate_report()` preservation
- v1 `POST /api/reports/generate` preservation
- deterministic v2 preservation without live provider calls

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
- no browser storage of generated report text, `ai_generated` JSON, manual
  input, report drafts, or clinical content
- PDF disabled until reviewed

Current frontend tests cover the implemented slices: API helper contracts
including `generateReportDraftV2`, current draft load, missing-draft create
state, Create Draft flow, editing/saving manual input, save success/error
behavior, AI action card behavior, unsaved-input blocking, 422/generic
generation errors, regeneration label, ReportPage layout order, read-only
preview prerequisite state, simplified preview field visibility, manual field
mapping, preview AI mapping, visible `crisis_language_summary`, manual-only
conditional safety-plan rendering, safe turn-number-only evidence refs,
forbidden AI risk/safety fields, print-friendly view action/content/disclaimer
and `window.print()` behavior, user-facing version-label cleanup, missing-data
placeholders, future placeholder wording, risk missing behavior, save-to-preview
updates, v1/v2 behavior isolation, missing session behavior, and storage safety.

All tests should remain deterministic and should not call live LLM providers.

## 16. Staged Implementation Roadmap

Recommended implementation slices:

1. Docs/schema planning artifact. Completed.
2. Backend Pydantic models for Report Schema v2. Completed.
3. Backend `report_drafts` persistence and manual input API. Completed.
4. Frontend ReportPage manual input form and frontend API helpers. Completed
   for the first manual-input slice.
5. ReportPage read-only rendering. Completed for the first manual-input
   preview slice.
6. Backend-only deterministic `analysis_agent` v2 draft generation. Completed.
7. Backend v2 generate route and `ai_generated_json` persistence. Completed.
8. Frontend v2 generate action and `generateReportDraftV2` helper. Completed.
9. ReportV2Preview rendering of `ai_generated` fields. Completed.
10. Backend Report v2 prompt/input builder and provider parser. Completed.
11. Disabled-by-default provider mode and environment/config controls.
    Completed.
12. Manual local provider smoke testing with synthetic data. Completed.
13. Classroom demo runbook. Completed.
14. Post-demo prompt and preview refinement batch. Completed.
15. Frontend print-friendly report view and user-facing version-label cleanup.
    Completed.
16. Charts/Recharts planning. Future work.
17. Reviewed status and counselor edit/final report flow. Future work.
18. True PDF export planning and implementation. Future work.
19. Production deployment/testing and docs after future slices. Future work.

Each implementation slice should be small, testable, and reviewable. Safety and
browser-storage regression tests should accompany behavior changes.

## 17. Explicitly Out of Scope

Out of scope for this planning slice:

- true PDF implementation
- live provider calls in automated tests or CI
- reviewed status or counselor final report workflow
- production deployment/testing
- docs updates for future slices before those slices exist
- diagnosis automation
- medication advice
- formal risk-level automation
- safety plan generation
- emergency workflow automation
- treatment plan automation
- browser storage of report drafts, generated report text, `ai_generated` JSON,
  manual input, or clinical content
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
- Should prompt version, provider mode, and model metadata be stored later for
  auditability without storing raw prompts or raw responses?
- What manual local smoke-test procedure should be used before trusting provider
  mode in development?
- What prompt-quality acceptance criteria should be used for provider-backed v2
  drafts?
- Continue manual regression checks with Case B / Case C style prompts to verify
  that family systems, interpersonal, attachment, psychodynamic, humanistic, or
  integrative orientations appear when case evidence supports them.
