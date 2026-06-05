const MISSING_TEXT = '待評估'
const FUTURE_PLACEHOLDER = '此欄位待未來 AI 草稿或諮商師補充'
const AI_DRAFT_BADGE = 'AI 草稿，需諮商師審閱'
const CLIENT_UNDERSTANDING_AI_LABEL =
  'AI 補充草稿：個案對問題理解的可能表述，需審閱'

const STATUS_LABELS = {
  ai_generated: '已產生 AI 草稿',
  manual_input_started: '手動資料草稿',
  reviewed: '已審閱',
}

function getNestedValue(source, path) {
  return path.reduce((current, key) => current?.[key], source)
}

function getFieldDisplayValue(field) {
  const value = field?.value

  if (typeof value === 'string') {
    const trimmedValue = value.trim()
    return trimmedValue || MISSING_TEXT
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return MISSING_TEXT
}

function getReportFieldValue(manualInput, path) {
  return getFieldDisplayValue(getNestedValue(manualInput, path))
}

function hasFieldValue(field) {
  const value = field?.value

  if (typeof value === 'string') {
    return value.trim().length > 0
  }

  if (typeof value === 'number') {
    return Number.isFinite(value)
  }

  if (typeof value === 'boolean') {
    return true
  }

  if (Array.isArray(value)) {
    return value.length > 0
  }

  return value != null && typeof value === 'object'
}

function getAiField(aiGenerated, key) {
  const field = aiGenerated?.[key]
  return hasFieldValue(field) ? field : null
}

function formatTurnEvidence(field) {
  const turnNumbers = [
    ...new Set(
      (field?.evidence_refs ?? [])
        .map((ref) => ref?.turn_number)
        .filter((turnNumber) => Number.isInteger(turnNumber)),
    ),
  ].sort((a, b) => a - b)

  return turnNumbers.map((turnNumber) => `第 ${turnNumber} 輪`)
}

function formatSessionCountDate(manualInput) {
  const sessionCount = getReportFieldValue(manualInput, [
    'basic_info',
    'session_count',
  ])
  const sessionDate = getReportFieldValue(manualInput, [
    'basic_info',
    'session_date',
  ])

  if (sessionCount === MISSING_TEXT && sessionDate === MISSING_TEXT) {
    return MISSING_TEXT
  }

  const countText =
    sessionCount !== MISSING_TEXT && /^\d+$/.test(sessionCount)
      ? `${sessionCount} 次`
      : sessionCount

  return `${countText}／${sessionDate}`
}

function getStatusLabel(status) {
  if (!status) return null
  return STATUS_LABELS[status] ?? '草稿狀態待確認'
}

function PrintField({ label, value, badges = [], evidence = [] }) {
  const isMissing = value === MISSING_TEXT || value === FUTURE_PLACEHOLDER

  return (
    <div className="break-inside-avoid border-b border-slate-200 pb-3 print:break-inside-avoid">
      <dt className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-slate-600">
        <span>{label}</span>
        {badges.map((badge) => (
          <span
            className="rounded-full border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-600"
            key={badge}
          >
            {badge}
          </span>
        ))}
      </dt>
      <dd
        className={`mt-1 whitespace-pre-wrap text-[15px] leading-7 ${
          isMissing ? 'text-slate-500' : 'text-slate-950'
        }`}
      >
        {value}
      </dd>
      {evidence.length ? (
        <dd className="mt-1 flex flex-wrap gap-1.5 text-xs text-slate-500">
          {evidence.map((item) => (
            <span
              className="rounded-full border border-slate-200 px-2 py-0.5"
              key={item}
            >
              {item}
            </span>
          ))}
        </dd>
      ) : null}
    </div>
  )
}

function FutureField({ label }) {
  return <PrintField badges={['未產生']} label={label} value={FUTURE_PLACEHOLDER} />
}

function AiField({ field, label }) {
  if (!field) return <FutureField label={label} />

  return (
    <PrintField
      badges={[AI_DRAFT_BADGE]}
      evidence={formatTurnEvidence(field)}
      label={label}
      value={getFieldDisplayValue(field)}
    />
  )
}

function PrintSection({ title, children }) {
  return (
    <section className="break-inside-avoid space-y-4 print:break-inside-avoid">
      <h2 className="border-b-2 border-slate-900 pb-2 text-lg font-semibold text-slate-950">
        {title}
      </h2>
      <dl className="grid gap-x-8 gap-y-4 md:grid-cols-2 print:grid-cols-2">
        {children}
      </dl>
    </section>
  )
}

export default function ReportV2PrintView({
  caseInfo,
  draft,
  onBack,
  onPrint,
}) {
  const manualInput = draft?.manual_input ?? {}
  const aiGenerated = draft?.ai_generated ?? {}
  const statusLabel = getStatusLabel(draft?.status)
  const manualSafetyPlan = getNestedValue(manualInput, [
    'risk_assessment',
    'safety_plan',
  ])
  const aiClientUnderstanding = getAiField(
    aiGenerated,
    'client_understanding_draft',
  )

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 text-slate-950 print:bg-white print:px-0 print:py-0">
      <style>
        {'@media print { header, [role="note"] { display: none !important; } @page { margin: 18mm; } }'}
      </style>
      <div className="mx-auto mb-4 flex max-w-4xl flex-wrap items-center justify-between gap-3 print:hidden">
        <button
          className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:bg-slate-50"
          onClick={onBack}
          type="button"
        >
          返回編輯檢視
        </button>
        <button
          className="inline-flex items-center justify-center rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
          onClick={onPrint}
          type="button"
        >
          列印
        </button>
      </div>

      <article className="mx-auto max-w-4xl space-y-8 bg-white px-8 py-10 shadow-sm ring-1 ring-slate-200 print:max-w-none print:px-0 print:py-0 print:shadow-none print:ring-0">
        <header className="space-y-4 border-b border-slate-300 pb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Report v2 Draft
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                個案概念化報告草稿
              </h1>
            </div>
            {statusLabel ? (
              <span className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600">
                {statusLabel}
              </span>
            ) : null}
          </div>

          <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
            <div>
              <span className="font-semibold text-slate-600">個案代碼：</span>
              <span>{caseInfo?.code_name ?? '未提供'}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-600">草稿更新：</span>
              <span>{draft?.updated_at ? new Date(draft.updated_at).toLocaleString('zh-TW') : '未提供'}</span>
            </div>
          </div>
        </header>

        <section className="break-inside-avoid rounded-md border border-amber-300 bg-amber-50 p-4 text-sm leading-7 text-amber-950 print:break-inside-avoid print:bg-white">
          <p className="font-semibold">
            AI assisted draft / counselor review required
          </p>
          <p>本報告為 AI 輔助草稿，需由諮商師審閱。</p>
          <p>內容不構成診斷、正式風險評估、治療處方或治療計畫。</p>
          <p>資料不足處應維持待評估，並由諮商師依專業判斷補充。</p>
          <p className="text-xs text-amber-900">
            not diagnosis/formal risk assessment/treatment plan
          </p>
        </section>

        <PrintSection title="一、基本資料與主訴">
          <PrintField
            label="年齡／性別"
            value={getReportFieldValue(manualInput, ['basic_info', 'age_gender'])}
          />
          <PrintField
            label="職業／就學狀態"
            value={getReportFieldValue(manualInput, [
              'basic_info',
              'occupation_school_status',
            ])}
          />
          <PrintField
            label="婚姻／家庭狀態"
            value={getReportFieldValue(manualInput, [
              'basic_info',
              'marital_family_status',
            ])}
          />
          <PrintField
            label="轉介來源"
            value={getReportFieldValue(manualInput, ['basic_info', 'referral_source'])}
          />
          <PrintField
            label="會談次數／日期"
            value={formatSessionCountDate(manualInput)}
          />
          {aiClientUnderstanding ? (
            <AiField field={aiClientUnderstanding} label={CLIENT_UNDERSTANDING_AI_LABEL} />
          ) : null}
          <AiField
            field={getAiField(aiGenerated, 'chief_complaint_draft')}
            label="主訴摘要"
          />
          <AiField
            field={getAiField(aiGenerated, 'problem_development_draft')}
            label="問題起始與演變"
          />
        </PrintSection>

        <PrintSection title="二、現況評估與觀察">
          <AiField field={getAiField(aiGenerated, 'emotion_pattern')} label="情緒模式" />
          <AiField field={getAiField(aiGenerated, 'cognitive_pattern')} label="認知模式" />
          <AiField
            field={getAiField(aiGenerated, 'behavior_coping_pattern')}
            label="行為與因應模式"
          />
        </PrintSection>

        <PrintSection title="三、心理評估">
          <PrintField
            label="心理測驗／衡鑑資料補充"
            value={getReportFieldValue(manualInput, ['assessment_testing_data'])}
          />
          <AiField
            field={getAiField(aiGenerated, 'psychological_factors')}
            label="氣質／人格特質"
          />
        </PrintSection>

        <PrintSection title="四、理論取向與個案概念化">
          <AiField
            field={getAiField(aiGenerated, 'theoretical_orientation_rationale')}
            label="初步取向建議與理由"
          />
          <AiField
            field={getAiField(aiGenerated, 'conceptualization_narrative')}
            label="概念化敘述"
          />
          <AiField
            field={getAiField(aiGenerated, 'formation_factors')}
            label="形成因素"
          />
          <AiField
            field={getAiField(aiGenerated, 'precipitating_factors')}
            label="誘發因素"
          />
          <AiField
            field={getAiField(aiGenerated, 'maintaining_factors')}
            label="維持因素"
          />
          <AiField
            field={getAiField(aiGenerated, 'protective_factors')}
            label="保護因素"
          />
        </PrintSection>

        <PrintSection title="五、風險評估">
          <AiField
            field={getAiField(aiGenerated, 'crisis_language_summary')}
            label="危機語句摘要"
          />
          {hasFieldValue(manualSafetyPlan) ? (
            <PrintField
              label="安全計畫（諮商師手動提供）"
              value={getFieldDisplayValue(manualSafetyPlan)}
            />
          ) : null}
        </PrintSection>
      </article>
    </div>
  )
}
