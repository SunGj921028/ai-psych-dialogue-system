const MISSING_TEXT = '待評估'
const FUTURE_PLACEHOLDER = '此欄位待未來 AI 草稿或諮商師補充'

function getNestedValue(source, path) {
  return path.reduce((current, key) => current?.[key], source)
}

function getReportFieldValue(manualInput, path) {
  const field = getNestedValue(manualInput, path)
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

function PreviewField({ label, value, variant = 'default' }) {
  const valueClassName =
    value === MISSING_TEXT || value === FUTURE_PLACEHOLDER
      ? 'text-muted-foreground'
      : 'text-slate-950 dark:text-slate-50'
  const badgeClassName =
    variant === 'future'
      ? 'border-indigo-200 bg-indigo-50/80 text-indigo-950 dark:border-indigo-700/60 dark:bg-indigo-950/32 dark:text-indigo-100'
      : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200'

  return (
    <div className="rounded-md border border-slate-200 bg-white/86 p-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-950/45">
      <dt className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
        <span>{label}</span>
        {variant === 'future' ? (
          <span className={`rounded-full border px-2 py-0.5 text-[11px] ${badgeClassName}`}>
            未產生
          </span>
        ) : null}
      </dt>
      <dd className={`mt-1 whitespace-pre-wrap leading-6 ${valueClassName}`}>
        {value}
      </dd>
    </div>
  )
}

function PreviewSection({ title, children }) {
  return (
    <section className="rounded-md border border-slate-200 bg-slate-50/65 p-4 dark:border-slate-700 dark:bg-slate-900/45">
      <h4 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
        {title}
      </h4>
      <dl className="mt-3 grid gap-3 md:grid-cols-2">{children}</dl>
    </section>
  )
}

function FutureField({ label }) {
  return (
    <PreviewField label={label} value={FUTURE_PLACEHOLDER} variant="future" />
  )
}

function MissingField({ label }) {
  return <PreviewField label={label} value={MISSING_TEXT} />
}

export default function ReportV2Preview({ draft, className = '' }) {
  const hasDraft = Boolean(draft?.draft_id ?? draft?.id)
  const manualInput = draft?.manual_input ?? {}

  return (
    <section
      className={`rounded-md border border-slate-200/80 bg-white/92 p-5 shadow-[0_14px_40px_rgba(15,23,42,0.06)] ring-1 ring-white/60 dark:border-slate-700 dark:bg-card dark:shadow-[0_14px_40px_rgba(0,0,0,0.28)] dark:ring-slate-700/50 ${className}`}
    >
      <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
        <p className="text-xs font-semibold text-indigo-800 dark:text-indigo-300">
          Report Schema v2
        </p>
        <h3 className="mt-1 font-semibold text-slate-950 dark:text-slate-50">
          v2 五段式報告預覽
        </h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          唯讀預覽，尚非正式報告；未產生 v2 AI 草稿。
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {['非正式報告', '尚未審閱', '非 PDF 匯出版'].map((label) => (
            <span
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-muted-foreground dark:border-slate-700 dark:bg-slate-900/70"
              key={label}
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      {!hasDraft ? (
        <div className="mt-4 rounded-md border border-dashed border-slate-300 bg-slate-50/80 p-4 text-sm text-muted-foreground dark:border-slate-700 dark:bg-slate-900/55">
          需先建立 v2 草稿後才可預覽
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="rounded-md border border-amber-200 bg-amber-50/80 p-3 text-sm leading-6 text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/45 dark:text-amber-100">
            此預覽僅依目前已儲存的手動資料呈現。缺漏欄位以「待評估」標示，不代表無症狀或無風險。
          </div>

          <PreviewSection title="一、基本資料與主訴">
            <PreviewField
              label="年齡／性別"
              value={getReportFieldValue(manualInput, ['basic_info', 'age_gender'])}
            />
            <PreviewField
              label="職業／就學狀態"
              value={getReportFieldValue(manualInput, [
                'basic_info',
                'occupation_school_status',
              ])}
            />
            <PreviewField
              label="婚姻／家庭狀態"
              value={getReportFieldValue(manualInput, [
                'basic_info',
                'marital_family_status',
              ])}
            />
            <PreviewField
              label="轉介來源"
              value={getReportFieldValue(manualInput, [
                'basic_info',
                'referral_source',
              ])}
            />
            <PreviewField
              label="會談次數／日期"
              value={formatSessionCountDate(manualInput)}
            />
            <PreviewField
              label="個案對問題的理解／主訴補充"
              value={getReportFieldValue(manualInput, [
                'problem_onset_course',
                'client_understanding',
              ])}
            />
            <FutureField label="主訴摘要" />
            <FutureField label="問題起始與演變" />
          </PreviewSection>

          <PreviewSection title="二、現況評估與觀察">
            <FutureField label="症狀與功能影響" />
            <FutureField label="情緒模式" />
            <FutureField label="認知模式" />
            <FutureField label="行為與因應模式" />
            <FutureField label="晤談觀察" />
          </PreviewSection>

          <PreviewSection title="三、心理評估">
            <PreviewField
              label="心理測驗／衡鑑資料補充"
              value={getReportFieldValue(manualInput, ['assessment_testing_data'])}
            />
            <FutureField label="氣質／人格特質" />
            <FutureField label="防衛機制" />
            <FutureField label="內在衝突" />
          </PreviewSection>

          <PreviewSection title="四、理論取向與個案概念化">
            <FutureField label="主要理論取向" />
            <FutureField label="理論取向理由" />
            <FutureField label="概念化敘述" />
            <FutureField label="形成因素" />
            <FutureField label="誘發因素" />
            <FutureField label="維持因素" />
            <FutureField label="保護因素" />
          </PreviewSection>

          <PreviewSection title="五、風險評估">
            <MissingField label="自殺意念" />
            <MissingField label="自殺計畫／意圖" />
            <MissingField label="自傷行為" />
            <MissingField label="他傷風險" />
            <MissingField label="物質濫用" />
            <MissingField label="精神病性症狀" />
            <MissingField label="整體風險等級" />
            <PreviewField
              label="正式風險評估備註"
              value={getReportFieldValue(manualInput, [
                'risk_assessment',
                'overall_risk_notes',
              ])}
            />
            <PreviewField
              label="安全計畫／危機處置"
              value={getReportFieldValue(manualInput, [
                'risk_assessment',
                'safety_plan',
              ])}
            />
          </PreviewSection>
        </div>
      )}
    </section>
  )
}
