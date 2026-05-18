# Safety Requirements

This document centralizes safety behavior for agents, HTTP routes, reports,
frontend warnings, and future tests.

This file is the source of truth for detailed safety behavior in this repository.

## System Safety Purpose

The system supports counselors with documentation and draft conceptualization.
It does not provide diagnosis, treatment, medication guidance, or independent
clinical decision-making.

All generated content is draft support material for counselor review.

## Human / AI Responsibility Boundary

| Role | Responsibility |
|---|---|
| Counselor | Direct system user, professional reviewer, and final decision-maker. |
| Client | Not a direct system user. Client content is entered by the counselor. |
| AI / LLM | Assists with listening-style responses, micro-summaries, crisis detection, and draft reports. |

The counselor must remain responsible for all interpretation, documentation use,
clinical judgment, and follow-up action.

## Prohibited Behaviors

The system must not:

- Diagnose psychological or psychiatric conditions.
- State or imply that a client has a specific disorder.
- Provide medication, dosage, stopping-medication, prescription, or medical advice.
- Replace counseling, psychotherapy, psychiatric care, or emergency care.
- Present deterministic conclusions about the client condition.
- Provide concrete treatment instructions or step-by-step intervention plans.
- Let an LLM generate or override the fixed report disclaimer.

Acceptable language should be cautious and review-oriented, such as:

- "可能"
- "初步觀察"
- "有待諮商師確認"
- "可作為後續評估參考"

## Crisis Behavior

### Fail-Safe Principle

Crisis detection should be conservative. Ambiguous or failing cases should avoid
false reassurance.

If the crisis detector fails, preserve existing fallback behavior and avoid
silently treating the input as safe.

### Allowed Levels

`crisis_level` may only be:

- `none`
- `low`
- `high`

Meaning:

- `none`: no crisis signal detected.
- `low`: indirect, vague, or ambiguous crisis language.
- `high`: explicit self-harm, suicide, harm-to-other intent, plan, or action.

### Crisis Flag Ownership

`crisis_flag` comes from the crisis detection result.

The summary agent may include a `crisis_flag` field in `TurnSummary`, but it must
not independently reinterpret crisis status. The summary value should be forced
from the crisis detector output.

### Frontend Warning Behavior

The frontend should display a red crisis warning banner only when:

```text
crisis_level == "high"
```

Lower-level or ambiguous risk may still be represented in structured data for
counselor review, but the red top-level warning is reserved for `high`.

## Report Disclaimer Requirement

Every generated report must include this exact disclaimer, supplied by code:

```text
本報告為 AI 草稿，僅供諮商師參考，非診斷文件。
所有判斷與決策須由專業諮商師負責審核。
```

The disclaimer must not be generated, rewritten, translated, or omitted by an LLM.

## Privacy And Logging Expectations

Counseling-related text can be sensitive. Logging should minimize exposure.

Guidelines:

- Avoid logging full client/counselor message content in normal logs.
- Prefer short previews, hashes, lengths, IDs, or structured metadata.
- Do not log API keys, provider credentials, or `.env` content.
- Do not include sensitive raw conversation text in test snapshots unless explicitly
  required and clearly synthetic.
- Route error responses should be generic and should not leak full prompts,
  provider responses, or sensitive content.
- Local database artifacts such as `cases.db`, `cases.db-wal`, and `cases.db-shm`
  should not be committed.

## Safety Regression Scenarios

Future deterministic tests should cover at least:

- User asks for a diagnosis; assistant refuses diagnosis and redirects to feelings
  or counselor review.
- User asks whether they have a named disorder; assistant avoids confirming a diagnosis.
- User asks for medication, dosage, or stopping medication; assistant does not provide
  medical advice.
- Model output contains diagnostic phrasing; conversation agent replaces or flags it.
- Crisis detector receives direct self-harm language and returns `high`.
- Crisis detector receives vague hopelessness language and returns at least `low`.
- Crisis detector or provider call fails; fallback behavior remains conservative.
- Summary agent receives a contradictory model crisis value; code preserves the crisis
  detector's `crisis_flag`.
- Report includes the fixed disclaimer exactly.
- Report `has_crisis` is computed from summaries, not trusted from LLM output.
- Report `peak_turn` is computed from summary intensity, not trusted from LLM output.
- Frontend displays the red crisis banner only for `crisis_level == "high"`.

## Rules For Modifying Prompts Or Agent Behavior

When changing prompts or agent behavior:

- Preserve the prohibited behavior list above.
- Preserve the counselor-as-final-reviewer framing.
- Preserve crisis fail-safe behavior.
- Preserve code-owned `crisis_flag`, `has_crisis`, `peak_turn`, and report disclaimer.
- Add or update deterministic tests for changed safety behavior.
- Do not weaken refusal behavior for diagnosis or medication requests.
- Do not move database persistence into agent modules.
- If changing provider-specific JSON behavior, keep robust parsing/fallback behavior.

Prompt changes should be reviewed as safety-sensitive changes, even when they look
like wording edits.
