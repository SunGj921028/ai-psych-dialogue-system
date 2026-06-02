# Classroom Demo Runbook

This runbook is for a classroom demonstration of the counselor-facing
AI-assisted case, session, and report prototype.

Use synthetic or fully de-identified data only. Do not use real client,
counselor, school, workplace, family, medical, legal, or clinical records.

This project is not a production clinical system. It is a prototype for
AI-assisted counseling documentation and case conceptualization support. The
counselor remains responsible for all professional judgment, review, and
decisions.

## Demo Goal

Show the current prototype workflow:

- counselor-facing case and session preparation
- synthetic conversation entry
- micro-summary and crisis-status support
- safe session metadata and history behavior
- Report Schema v2 manual input
- Report v2 AI draft generation and read-only preview

Emphasize throughout:

- AI assists documentation only.
- The system does not diagnose.
- The system does not prescribe or provide medical advice.
- AI draft fields require counselor review.
- Missing data must stay missing rather than being invented.

## Synthetic Demo Case

Use a low-risk student/intern scenario.

Suggested case code:

```text
DEMO-STUDENT-LOW-RISK-001
```

Suggested case note:

```text
Classroom demo only. Synthetic low-risk student/intern scenario. No real client data.
```

Scenario summary:

- The student/intern has recent workload stress.
- They report mild anxiety before deadlines.
- They have sleep disruption, mainly delayed sleep and feeling unrested.
- They are concerned about time management and task prioritization.
- They deny self-harm ideation and harm-to-others ideation.
- They have peer and family support.
- They want to improve stress management and sleep habits.

Avoid adding:

- real names
- real histories
- identifiable events
- copied clinical content
- high-risk crisis content

## Demo Conversation Turns

Use Traditional Chinese. These turns are synthetic and intentionally low-risk.
They can be pasted or paraphrased by the counselor as client-provided content.

### Turn 1: Presenting Concern

```text
最近實習和課業同時進行，事情常常堆在一起。我覺得自己有點緊繃，尤其想到期限快到時會心跳變快、很難放鬆。雖然還能完成事情，但每天都覺得時間不夠用。
```

### Turn 2: Problem Development

```text
大概是這一個月開始比較明顯。以前只要列清單就能處理，現在任務變多，我常常先做最急的事，其他事情就一直往後延。晚上會想著明天還有什麼沒做，睡得比較晚。
```

### Turn 3: Emotion And Cognition Pattern

```text
我最常出現的想法是「如果做不好，別人會覺得我不夠負責」。這個想法出現時會焦慮，也會有點自責。其實我知道自己有在努力，但還是很容易把一件小失誤放大。
```

### Turn 4: Coping Behavior

```text
我會先滑手機或整理桌面，想讓自己冷靜一下，但有時反而拖更久。比較有幫助的是跟同學討論進度，或把任務拆小一點。只是壓力大時，我不一定記得要這樣做。
```

### Turn 5: Protective Factors And Risk Confirmation

```text
我目前沒有傷害自己或傷害別人的想法，也沒有計畫或衝動。壓力大的時候，我會找同學聊，也會跟家人說一下近況。我希望可以學會更穩定地安排時間，也想把睡眠調整回來。
```

## Report v2 Manual Input Suggestions

Use synthetic values only.

| Field | Suggested demo value |
|---|---|
| 會談日期 | 2026-05-28 |
| 會談次數 | 第 1 次 |
| 轉介來源 | 實習督導建議了解壓力調適狀況，課堂示範用合成資料 |
| 年齡／性別 | 22 歲，女性，合成示範資料 |
| 職業／就學狀態 | 大學生兼實習生 |
| 婚姻／家庭狀態 | 未婚，與家人維持穩定聯繫 |
| 個案對問題的理解／主訴補充 | 個案理解主要困擾與近期課業、實習負荷增加及時間安排困難有關，期待改善壓力調節與睡眠作息。 |
| 心理測驗／衡鑑資料補充 | 本次課堂示範未提供正式心理測驗或衡鑑資料。 |
| 正式風險評估備註 | 合成示範資料中，個案否認自傷與傷人意念、計畫或衝動；仍需由諮商師於正式情境中進行專業風險評估。 |
| 安全計畫 | 本次示範不建立正式安全計畫。若正式服務中出現風險，須由諮商師依機構流程評估並處理。 |

## Demo Flow

### 1. Pre-Demo Setup

Run the deterministic checks before class if time allows:

```powershell
python -m pytest backend/tests -q --basetemp=.tmp_pytest_backend_demo -p no:cacheprovider
```

```powershell
Set-Location frontend
npm test -- --run
npm run build
```

Do not run live provider checks in class unless explicitly planned.

### 2. Start Backend

Use the normal local backend setup for the project. Keep real secrets out of
screenshots and terminal history shown to the classroom.

Example from the backend directory:

```powershell
python -m uvicorn main:app --reload
```

If using provider mode, set provider environment variables only in the local
shell before starting the backend. Do not edit or display `.env`.

### 3. Start Frontend

Example from the frontend directory:

```powershell
npm run dev
```

Open the local frontend URL shown by Vite.

### 4. Show SettingsPage Safety And Privacy

Start with SettingsPage to frame the demo:

- system purpose
- counselor review boundary
- no diagnosis or medical advice
- backend-managed providers
- browser storage privacy behavior

### 5. Create Or Select The Demo Case

Create a new synthetic case or select an existing synthetic demo case.

Use the suggested case code:

```text
DEMO-STUDENT-LOW-RISK-001
```

Do not enter real names or real clinical notes.

### 6. Conduct Synthetic Conversation

Create a new session and enter the 3-5 synthetic Traditional Chinese turns from
this runbook.

After each turn, briefly point out:

- the counselor is entering client-provided content
- the client is not using the system directly
- AI support is for preparation and documentation only

### 7. Show Crisis Status

Show the displayed crisis status after the low-risk synthetic turns.

Explain:

- crisis output is assistive metadata, not a diagnosis
- red crisis UI should be reserved for high-risk crisis level
- the counselor remains responsible for professional assessment
- this demo case intentionally denies self-harm and harm-to-others ideation

### 8. Show HistoryPage Sessions

Navigate to HistoryPage.

Show that sessions are listed as safe operational metadata. Explain that session
metadata must not expose raw messages, summaries, report text, crisis reasons, or
other clinical content.

### 9. Rename Session

Rename the session with a synthetic operational title, for example:

```text
Demo low-risk stress session
```

Explain that titles are counselor-entered operational metadata and are not
AI-generated from clinical content.

### 10. Optionally Archive And Unarchive

Optionally archive the session, then show archived sessions and unarchive it.

Explain:

- archive/unarchive is a lifecycle visibility feature
- it preserves messages and summaries
- it is not hard delete
- hard delete remains future work and requires a data-retention/privacy policy

### 11. Go To ReportPage

Open ReportPage for the same case/session.

Point out the v1/v2 separation:

- In `會談整理輔助`, the emotion dimension average area now includes a compact
  Recharts radar chart derived from structured summary averages on a fixed
  `0-10` scale.
- Explain that the radar chart is a visual aid for counselor review only, not a
  formal scale, diagnosis, or risk evaluation.
- Point out that the existing text/bar emotion dimension overview remains
  visible as fallback.
- `會談整理輔助` appears before the v2 report draft workflow
- v2 manual input, generation, and preview are grouped under `v2 報告草稿`
- v1 appears lower as `舊版 v1 暫存報告`
- v1 report generation remains transient and separate
- v2 draft workflow uses Report Schema v2 draft state
- v2 generation does not populate v1 report state
- v1 generation does not alter the v2 draft

### 12. Create v2 Draft

If no v2 draft exists, explicitly create one.

Explain that drafts are not auto-created on page load.

### 13. Fill And Save Manual Input

Use the synthetic manual input values from this runbook.

Explain:

- manual fields are counselor-owned
- demographic and risk-related fields should not be invented by AI
- manual input is saved through the backend Report v2 draft endpoint

### 14. Generate v2 AI Draft

Use the v2 AI draft generation action.

Explain:

- deterministic mode is safe for class demos
- provider mode is optional and requires explicit backend configuration
- generated fields are draft support material only
- AI output requires counselor review

### 15. Show ReportV2Preview

Show the simplified v2 preview.

Point out:

- manual fields and AI draft fields are visually distinct
- `crisis_language_summary` remains visible as screening-language summary only
- formal risk assessment and safety planning are not generated by AI
- manual `safety_plan` appears only if the counselor provided it
- AI draft fields require counselor review
- evidence references are pointer-only
- missing data should remain missing
- no final report or PDF export workflow exists yet

## Provider Mode Options

### Option A: Deterministic Mode

Use deterministic mode for the safest classroom demo.

Expected behavior:

- no provider call
- no API key needed
- conservative schema-valid draft behavior
- no live model variability

Use either unset/blank provider mode or:

```text
REPORT_V2_PROVIDER_MODE=deterministic
```

### Option B: Provider Mode With Gemini Or Groq

Use provider mode only if the classroom demo explicitly includes live provider
behavior.

Requirements:

- set `REPORT_V2_PROVIDER_MODE=provider`
- set `REPORT_V2_PROVIDER=gemini` or `REPORT_V2_PROVIDER=groq`
- set the corresponding provider key in the local shell only:
  `GEMINI_API_KEY` for Gemini, `GROQ_API_KEY` for Groq, or
  `REPORT_V2_API_KEY` as a Report-v2-specific override
- optionally set `REPORT_V2_MODEL`
- optionally enable Report-v2-only fallback with
  `REPORT_V2_FALLBACK_ENABLED=true`, commonly Gemini primary plus Groq fallback,
  for transient provider API failures such as 503 or rate-limit-like failures
- use synthetic/de-identified data only
- keep keys and `.env` hidden from screen sharing
- do not commit `.env`, logs, provider outputs, screenshots, or smoke DB files

Groq can be used as a dedicated Report v2 provider to reduce Gemini rate-limit
friction during longer structured report generation. `REPORT_V2_API_KEY` can
separate report-generation quota from the crisis/summary keys.

Provider fallback is opt-in and disabled by default. It applies only to Report v2
provider mode after `provider_api_failure`; it does not affect crisis, summary,
conversation, v1 report generation, or deterministic Report v2 mode. Fallback is
not a safety/schema bypass: invalid JSON, schema validation failures, unsafe
evidence refs, missing summaries, provider configuration failures, and DB
persistence failures do not trigger fallback. Fallback output must still validate
before persistence, and existing `ai_generated_json` remains intact if both
primary and fallback fail.

Provider mode has been smoke-tested locally with synthetic data, but it still
depends on provider availability, model behavior, local environment, and network
access.

## Fallback Plan

If provider mode fails during the demo:

- if opt-in fallback was configured and the failure was transient, let the
  fallback attempt complete and verify the generated draft normally
- switch to deterministic mode
- use a previously generated synthetic draft if available
- explain that provider mode was smoke-tested locally with synthetic data
- do not troubleshoot with real data
- do not expose provider keys, `.env`, raw prompts, or raw provider responses
- continue the demo by focusing on workflow, safety boundaries, and counselor
  review behavior

Suggested classroom wording:

```text
The live provider path depends on external availability. For this demo, we can
fall back to deterministic mode or a previously generated synthetic draft. The
important product boundary is unchanged: AI output is draft material for
counselor review, not a clinical conclusion.
```

## Talking Points

- Browser storage privacy: the frontend must not store clinical message content,
  summaries, report drafts, manual input, generated report text, crisis levels,
  crisis reasons, case notes, titles, or other clinical content in browser
  storage. `localStorage` is reserved for theme preference, and
  `sessionStorage` may store only active case/session identifiers.
- ReportPage visualizations use structured summary metadata already shown in the
  UI. The Recharts emotion dimension radar chart must not expose raw messages,
  raw summaries, key statements, report text, or clinical free text.
- Crisis output is assistive and conservative. It is not a diagnosis, formal
  risk assessment, or replacement for professional judgment.
- Manual counselor-owned fields include demographics, referral details, formal
  risk assessment notes, testing/assessment data, safety plan, diagnosis-related
  notes, medication/legal/family/trauma history, and final decisions.
- AI draft fields may support wording, summaries, cautious hypotheses, and
  conceptualization drafts grounded in available summaries and manual input.
- AI cannot invent missing data. Unsupported fields should remain null, blank,
  or marked as unavailable/not assessed.
- Raw prompts and raw provider responses are not persisted.
- `final_report_json` remains null after v2 AI draft generation until a future
  counselor review/final-report workflow is implemented.
- Final report workflow, reviewed status, print-friendly view, and PDF export
  remain future work.

## Demo Completion Checklist

Before class:

- [ ] Backend tests pass.
- [ ] Frontend tests pass.
- [ ] Frontend build passes.
- [ ] Backend starts locally.
- [ ] Frontend starts locally.
- [ ] Synthetic case exists or can be created quickly.
- [ ] Synthetic conversation turns are ready.
- [ ] Report v2 draft can be generated in deterministic mode.
- [ ] Provider-mode fallback plan is ready if using live provider mode.
- [ ] No `.env`, DB, logs, screenshots, provider outputs, or SQLite sidecar files
      are staged.
- [ ] Provider key is not committed and will not be shown on screen.

During class:

- [ ] Use only synthetic/de-identified data.
- [ ] Show SettingsPage safety/privacy framing.
- [ ] Create or select the synthetic case.
- [ ] Conduct the synthetic low-risk conversation.
- [ ] Show crisis status.
- [ ] Show HistoryPage session metadata.
- [ ] Rename the session.
- [ ] Optionally archive/unarchive the session.
- [ ] Create v2 draft.
- [ ] Fill and save manual input.
- [ ] Generate v2 AI draft.
- [ ] Show ReportV2Preview.
- [ ] Explain AI draft requires counselor review.
- [ ] Explain v1/v2 separation.

After class:

- [ ] Confirm no generated DB, WAL, SHM, logs, screenshots, `.env`, provider
      outputs, or secrets are staged.
- [ ] Remove only explicit single-file local artifacts if needed. Do not use
      bulk deletion commands.

## Future Work

- counselor final report workflow
- reviewed status
- print-friendly report view
- PDF export
- optional emotion intensity line chart, theme frequency chart, and additional
  chart polish
- any crisis visualization should remain cautious and must not imply formal risk
  assessment
- production deployment/testing
- docs after future slices
