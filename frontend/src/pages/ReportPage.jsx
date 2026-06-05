import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  FileText,
  Loader2,
  PlusCircle,
  Printer,
  RefreshCcw,
  Save,
  Tags,
} from 'lucide-react'
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import {
  createReportDraft,
  generateReportDraftV2,
  getCurrentReportDraft,
  getCase,
  getSessionSummaries,
  updateReportDraftManualInput,
} from '../api/client.js'
import ReportV2Preview from '../components/ReportV2Preview.jsx'
import ReportV2PrintView from '../components/ReportV2PrintView.jsx'

function getFriendlyError(error, fallback = '操作失敗，請稍後再試。') {
  if (error?.response?.status === 404) {
    return '找不到指定的個案或會談資料。'
  }

  if (error?.response?.status === 422) {
    return '送出的資料格式不完整，請確認個案與會談識別碼。'
  }

  if (!error?.response) {
    return '無法連線到後端服務，請確認本機 API 是否已啟動。'
  }

  return fallback
}

function formatDate(value) {
  if (!value) return '未提供'

  try {
    return new Intl.DateTimeFormat('zh-TW', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function clampScore(value) {
  const numberValue = Number(value)

  if (!Number.isFinite(numberValue)) return null

  return Math.max(0, Math.min(10, numberValue))
}

const EMOTION_DIMENSION_LABELS = {
  anxiety: '焦慮',
  sadness: '悲傷',
  anger: '憤怒',
  hopelessness: '無望',
  confusion: '困惑',
  hope: '希望',
}

function getSummaryData(summaryRow) {
  return summaryRow?.summary ?? {}
}

function getSummaryTurnNumber(summaryRow) {
  return getSummaryData(summaryRow).turn_number ?? summaryRow?.turn_number ?? 0
}

function getSortedSummaries(summaries) {
  return [...summaries].sort(
    (a, b) => getSummaryTurnNumber(a) - getSummaryTurnNumber(b),
  )
}

function getThemeCounts(summaries) {
  const counts = new Map()

  summaries.forEach((summaryRow) => {
    const themes = getSummaryData(summaryRow).themes ?? []
    themes.forEach((theme) => {
      const normalizedTheme = String(theme ?? '').trim()
      if (!normalizedTheme) return
      counts.set(normalizedTheme, (counts.get(normalizedTheme) ?? 0) + 1)
    })
  })

  return [...counts.entries()]
    .map(([theme, count]) => ({ theme, count }))
    .sort((a, b) => b.count - a.count || a.theme.localeCompare(b.theme, 'zh-Hant'))
}

function getEmotionDimensionAverages(summaries) {
  return Object.entries(EMOTION_DIMENSION_LABELS).map(([key, label]) => {
    const values = summaries
      .map((summaryRow) => getSummaryData(summaryRow).emotion_dimensions?.[key])
      .map(clampScore)
      .filter((value) => value != null)
    const average =
      values.length > 0
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : null

    return {
      key,
      label,
      average,
      latest: clampScore(
        getSummaryData(summaries[summaries.length - 1])?.emotion_dimensions?.[key],
      ),
    }
  })
}

function formatScore(value) {
  const score = clampScore(value)
  if (score == null) return '未提供'
  return Number.isInteger(score) ? `${score}` : score.toFixed(1)
}

const MANUAL_INPUT_FIELDS = [
  {
    id: 'session_date',
    label: '會談日期',
    path: ['basic_info', 'session_date'],
    type: 'input',
  },
  {
    id: 'session_count',
    label: '會談次數',
    path: ['basic_info', 'session_count'],
    type: 'input',
  },
  {
    id: 'referral_source',
    label: '轉介來源',
    path: ['basic_info', 'referral_source'],
    type: 'input',
  },
  {
    id: 'age_gender',
    label: '年齡／性別',
    path: ['basic_info', 'age_gender'],
    type: 'input',
  },
  {
    id: 'occupation_school_status',
    label: '職業／就學狀態',
    path: ['basic_info', 'occupation_school_status'],
    type: 'input',
  },
  {
    id: 'marital_family_status',
    label: '婚姻／家庭狀態',
    path: ['basic_info', 'marital_family_status'],
    type: 'input',
  },
  {
    id: 'assessment_testing_data',
    label: '心理測驗／衡鑑資料補充',
    path: ['assessment_testing_data'],
    type: 'textarea',
  },
  {
    id: 'overall_risk_notes',
    label: '正式風險評估備註',
    path: ['risk_assessment', 'overall_risk_notes'],
    type: 'textarea',
  },
  {
    id: 'safety_plan',
    label: '安全計畫',
    path: ['risk_assessment', 'safety_plan'],
    type: 'textarea',
  },
]

function createEmptyReportField(label) {
  return {
    label_zh: label,
    value: '',
    source_type: 'manual',
    missing_reason: 'no_data',
    needs_review: true,
    evidence_refs: [],
  }
}

function getNestedValue(source, path) {
  return path.reduce((current, key) => current?.[key], source)
}

function getManualInputFieldValue(manualInput, fieldConfig) {
  const field = getNestedValue(manualInput, fieldConfig.path)
  const value = field?.value

  if (value == null) return ''

  return typeof value === 'string' ? value : String(value)
}

function setManualInputFieldValue(manualInput, fieldConfig, value) {
  const nextManualInput = { ...(manualInput ?? {}) }
  let cursor = nextManualInput

  fieldConfig.path.slice(0, -1).forEach((key) => {
    cursor[key] = { ...(cursor[key] ?? {}) }
    cursor = cursor[key]
  })

  const lastKey = fieldConfig.path[fieldConfig.path.length - 1]
  const currentField =
    cursor[lastKey] && typeof cursor[lastKey] === 'object'
      ? cursor[lastKey]
      : createEmptyReportField(fieldConfig.label)

  cursor[lastKey] = {
    ...createEmptyReportField(fieldConfig.label),
    ...currentField,
    value,
  }

  return nextManualInput
}

function getDraftId(draft) {
  return draft?.draft_id ?? draft?.id ?? null
}

function getDraftErrorMessage(error) {
  if (error?.response?.status === 404) {
    return 'not_found'
  }

  return '無法載入 v2 手動資料草稿，請稍後再試。'
}

function SectionCard({ title, description, children }) {
  return (
    <section className="rounded-md border border-slate-200/80 bg-white/92 p-5 shadow-[0_14px_40px_rgba(15,23,42,0.06)] ring-1 ring-white/60 dark:border-slate-700 dark:bg-card dark:shadow-[0_14px_40px_rgba(0,0,0,0.28)] dark:ring-slate-700/50">
      <div className="mb-4 border-b border-slate-100 pb-3 dark:border-slate-800">
        <h3 className="font-semibold text-slate-950 dark:text-slate-50">{title}</h3>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  )
}

function IntensityBar({ value }) {
  const score = clampScore(value)
  const width = score == null ? 0 : score * 10

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>強度</span>
        <span>{score == null ? '未提供' : `${score}/10`}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200/80 dark:bg-slate-700/80">
        <div
          className="h-2 rounded-full bg-gradient-to-r from-indigo-600 to-slate-600 dark:from-indigo-500 dark:to-slate-500"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  )
}

function ReviewAidCard({ icon: Icon, title, description, children }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-card">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-indigo-100 bg-indigo-50 text-indigo-900 dark:border-indigo-700/60 dark:bg-indigo-950/32 dark:text-indigo-100">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
            {title}
          </h4>
          {description ? (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  )
}

function ManualInputControl({ fieldConfig, manualInput, onChange }) {
  const commonProps = {
    id: `manual-input-${fieldConfig.id}`,
    className:
      'mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50 dark:focus:border-indigo-500 dark:focus:ring-indigo-900/40',
    value: getManualInputFieldValue(manualInput, fieldConfig),
    onChange: (event) => onChange(fieldConfig, event.target.value),
  }

  return (
    <label className="block text-sm font-medium text-slate-900 dark:text-slate-100">
      <span>{fieldConfig.label}</span>
      {fieldConfig.type === 'textarea' ? (
        <textarea {...commonProps} rows={4} />
      ) : (
        <input {...commonProps} type="text" />
      )}
    </label>
  )
}

function ReportDraftManualInputPanel({
  draft,
  draftError,
  draftState,
  formManualInput,
  hasUnsavedChanges,
  isCreatingDraft,
  isSavingDraft,
  onCreateDraft,
  onFieldChange,
  onSaveDraft,
  saveStatus,
}) {
  const hasDraft = Boolean(getDraftId(draft))
  const canSave = hasDraft && hasUnsavedChanges && !isSavingDraft

  return (
    <SectionCard
      title="Report v2 手動資料"
      description="未來五段式報告的手動資料準備；此區只保存諮商師手動輸入，不會產生 v2 AI 報告。"
    >
      <div className="space-y-4">
        <div className="rounded-md border border-amber-200 bg-amber-50/80 p-4 text-sm leading-6 text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/45 dark:text-amber-100">
          <p>此區可能包含臨床敏感內容，請盡量使用去識別化代碼，避免輸入姓名、聯絡方式或不必要的可識別資訊。</p>
          <p className="mt-1">手動資料會儲存在後端報告草稿中；瀏覽器不會以 localStorage 或 sessionStorage 保存這些內容。</p>
          <p className="mt-1">缺漏資料可留白或標示「待評估」。AI 不應補造未提供的個案事實。</p>
          <p className="mt-1">診斷、正式風險評估與安全計畫屬於諮商師專業判斷，系統僅協助整理草稿資料。</p>
        </div>

        {draftError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {draftError}
          </div>
        ) : null}

        {draftState === 'loading' ? (
          <p className="text-sm text-muted-foreground">載入 v2 手動資料草稿中...</p>
        ) : null}

        {draftState === 'missing' ? (
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/80 p-5 text-sm dark:border-slate-700 dark:bg-slate-900/55">
            <h4 className="font-semibold text-slate-950 dark:text-slate-50">
              尚未建立 v2 手動資料草稿
            </h4>
            <p className="mt-1 leading-6 text-muted-foreground">
              建立後才能儲存本頁手動資料；目前不會自動建立草稿，也不會觸發 AI 產生。
            </p>
            <button
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-[0_10px_22px_rgba(30,41,59,0.16)] transition hover:bg-indigo-900 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-indigo-600"
              disabled={isCreatingDraft}
              onClick={onCreateDraft}
              type="button"
            >
              {isCreatingDraft ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlusCircle className="h-4 w-4" />
              )}
              建立 v2 手動資料草稿
            </button>
          </div>
        ) : null}

        {hasDraft ? (
          <form className="space-y-4" onSubmit={onSaveDraft}>
            <div className="grid gap-4 md:grid-cols-2">
              {MANUAL_INPUT_FIELDS.filter((field) => field.type === 'input').map(
                (fieldConfig) => (
                  <ManualInputControl
                    fieldConfig={fieldConfig}
                    key={fieldConfig.id}
                    manualInput={formManualInput}
                    onChange={onFieldChange}
                  />
                ),
              )}
            </div>

            <div className="grid gap-4">
              {MANUAL_INPUT_FIELDS.filter((field) => field.type === 'textarea').map(
                (fieldConfig) => (
                  <ManualInputControl
                    fieldConfig={fieldConfig}
                    key={fieldConfig.id}
                    manualInput={formManualInput}
                    onChange={onFieldChange}
                  />
                ),
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-[0_10px_22px_rgba(30,41,59,0.16)] transition hover:bg-indigo-900 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-indigo-600"
                disabled={!canSave}
                type="submit"
              >
                {isSavingDraft ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                儲存 v2 手動資料
              </button>
              <span className="text-sm text-muted-foreground">{saveStatus}</span>
            </div>
          </form>
        ) : null}
      </div>
    </SectionCard>
  )
}

function ReportDraftGeneratePanel({
  conversationUrl,
  draft,
  generateStatus,
  hasUnsavedChanges,
  isGeneratingDraft,
  isSavingDraft,
  onGenerateDraft,
  showConversationLink,
}) {
  const hasDraft = Boolean(getDraftId(draft))

  if (!hasDraft) return null

  const hasAiGenerated = Boolean(draft?.ai_generated)
  const buttonLabel = hasAiGenerated ? '重新產生 v2 AI 草稿' : '產生 v2 AI 草稿'
  const disabled = isSavingDraft || isGeneratingDraft

  return (
    <SectionCard
      title="v2 AI 草稿產生"
      description="依目前已儲存的手動資料與會談摘要產生五段式報告的 AI 草稿。此草稿需由諮商師審閱，且不會影響目前 v1 暫時報告。"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm leading-6 text-muted-foreground">
          <p>產生時只會使用後端已儲存的手動資料與會談摘要。</p>
          {hasUnsavedChanges ? (
            <p className="mt-1 text-amber-800 dark:text-amber-200">
              請先儲存手動資料，再產生 v2 AI 草稿
            </p>
          ) : null}
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-[0_10px_22px_rgba(30,41,59,0.16)] transition hover:bg-indigo-900 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-indigo-600"
          disabled={disabled}
          onClick={onGenerateDraft}
          type="button"
        >
          {isGeneratingDraft ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCcw className="h-4 w-4" />
          )}
          {isGeneratingDraft ? '產生中' : buttonLabel}
        </button>
      </div>

      {generateStatus ? (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100">
          <p>{generateStatus}</p>
          {showConversationLink ? (
            <Link
              className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-indigo-800 hover:text-indigo-950 dark:text-indigo-200 dark:hover:text-indigo-100"
              to={conversationUrl}
            >
              <ArrowLeft className="h-4 w-4" />
              回到工作台新增會談摘要
            </Link>
          ) : null}
        </div>
      ) : null}
    </SectionCard>
  )
}

function EmotionIntensityTrend({ summaries }) {
  if (summaries.length === 0) {
    return <p className="text-sm text-muted-foreground">尚無可整理的情緒強度資料。</p>
  }

  return (
    <div className="space-y-3">
      {summaries.map((summaryRow) => {
        const summary = getSummaryData(summaryRow)
        const score = clampScore(summary.emotion?.intensity)
        const width = score == null ? 0 : score * 10
        const turnNumber = getSummaryTurnNumber(summaryRow)

        return (
          <div className="space-y-1.5" key={summaryRow.id ?? turnNumber}>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  第 {turnNumber} 輪
                </span>
                <span className="text-muted-foreground">
                  {summary.emotion?.primary ?? '未提供'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {summaryRow.crisis_flag ? (
                  <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-950 dark:border-amber-500/45 dark:bg-amber-950/50 dark:text-amber-100">
                    危機標記
                  </span>
                ) : null}
                <span className="text-muted-foreground">
                  {score == null ? '未提供' : `${score}/10`}
                </span>
              </div>
            </div>
            <div className="h-2 rounded-full bg-slate-200/80 dark:bg-slate-700/80">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-indigo-600 to-slate-600 dark:from-indigo-500 dark:to-slate-500"
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ThemeFrequencyList({ themeCounts }) {
  if (themeCounts.length === 0) {
    return <p className="text-sm text-muted-foreground">尚無可整理的主題資料。</p>
  }

  return (
    <div className="flex flex-wrap gap-2">
      {themeCounts.map(({ theme, count }) => (
        <span
          className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50/80 px-3 py-1 text-xs text-indigo-950 dark:border-indigo-700/60 dark:bg-indigo-950/32 dark:text-indigo-100"
          key={theme}
        >
          <span>{theme}</span>
          <span className="rounded-full bg-white/75 px-1.5 py-0.5 text-[11px] text-slate-700 dark:bg-slate-900/80 dark:text-slate-200">
            {count} 次
          </span>
        </span>
      ))}
    </div>
  )
}

function getEmotionDimensionRadarData(dimensions) {
  return dimensions
    .filter((dimension) => dimension.average != null)
    .map((dimension) => ({
      key: dimension.key,
      dimension: dimension.label,
      average: Number(dimension.average.toFixed(1)),
    }))
}

function EmotionDimensionRadarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null

  const dimensionLabel = label ?? payload[0]?.payload?.dimension ?? '情緒面向'
  const score = formatScore(payload[0]?.value)

  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <p className="font-medium text-slate-900 dark:text-slate-100">
        {dimensionLabel}
      </p>
      <p className="mt-1 text-muted-foreground">平均 {score}/10</p>
    </div>
  )
}

function EmotionDimensionRadarChart({ dimensions }) {
  const chartData = getEmotionDimensionRadarData(dimensions)

  if (chartData.length === 0) return null

  return (
    <section
      aria-label="情緒面向雷達圖，顯示本會談微摘要的平均分布"
      className="rounded-md border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/70"
      role="region"
    >
      <p className="text-xs leading-5 text-muted-foreground">
        視覺化僅供諮商師審閱微摘要趨勢，非正式量表或診斷。
      </p>
      <div
        aria-hidden="true"
        className="mt-3 h-56 w-full min-w-0 text-slate-500 dark:text-slate-300"
      >
        <ResponsiveContainer height="100%" width="100%">
          <RadarChart data={chartData} outerRadius="72%">
            <PolarGrid stroke="currentColor" strokeOpacity={0.35} />
            <PolarAngleAxis
              dataKey="dimension"
              tick={{ fill: 'currentColor', fontSize: 12 }}
            />
            <PolarRadiusAxis
              angle={30}
              axisLine={false}
              domain={[0, 10]}
              tick={{ fill: 'currentColor', fontSize: 10 }}
              tickCount={6}
            />
            <Radar
              dataKey="average"
              fill="#4f46e5"
              fillOpacity={0.22}
              name="平均"
              stroke="#4f46e5"
              strokeWidth={2}
            />
            <Tooltip content={<EmotionDimensionRadarTooltip />} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function EmotionDimensionOverview({ dimensions }) {
  if (dimensions.every((dimension) => dimension.average == null)) {
    return <p className="text-sm text-muted-foreground">尚無可整理的情緒面向資料。</p>
  }

  return (
    <div className="space-y-4">
      <EmotionDimensionRadarChart dimensions={dimensions} />
      {dimensions.map((dimension) => {
        const averageWidth = dimension.average == null ? 0 : dimension.average * 10
        const latestText =
          dimension.latest == null ? '最新：未提供' : `最新：${formatScore(dimension.latest)}/10`

        return (
          <div className="space-y-1.5" key={dimension.key}>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {dimension.label}
              </span>
              <span className="text-muted-foreground">
                平均 {formatScore(dimension.average)}/10 · {latestText}
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-200/80 dark:bg-slate-700/80">
              <div
                className="h-2 rounded-full bg-slate-700 dark:bg-slate-300"
                style={{ width: `${averageWidth}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CrisisOccurrenceIndicator({ summaries, report }) {
  const flaggedTurns = summaries.filter((summaryRow) => summaryRow.crisis_flag)
  const reportHasCrisis = report?.has_crisis === true
  const hasAnyCrisis = flaggedTurns.length > 0 || reportHasCrisis

  return (
    <section
      className={`rounded-md border p-4 text-sm shadow-sm ${
        hasAnyCrisis
          ? 'border-amber-300 bg-amber-50/90 text-amber-950 dark:border-amber-500/45 dark:bg-amber-950/55 dark:text-amber-100'
          : 'border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-card dark:text-slate-100'
      }`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <h4 className="font-semibold">危機標記彙整</h4>
          <p className="mt-1 leading-6">
            {hasAnyCrisis
              ? `微摘要中有 ${flaggedTurns.length} 輪出現危機標記${
                  reportHasCrisis ? '，報告資料也標示 has_crisis。' : '。'
                }`
              : '目前微摘要與已產生報告未標示危機發生。'}
          </p>
          <p className="mt-1 text-xs leading-5 opacity-80">
            此處只整理後端欄位，不重新判斷危機嚴重度。
          </p>
        </div>
      </div>
    </section>
  )
}

function SummaryReviewAids({ summaries, report }) {
  const sortedSummaries = getSortedSummaries(summaries)
  const themeCounts = getThemeCounts(sortedSummaries)
  const dimensions = getEmotionDimensionAverages(sortedSummaries)

  return (
    <SectionCard
      title="微摘要整理輔助"
      description="僅為 AI 微摘要整理，非客觀臨床量表。"
    >
      <div className="grid gap-3">
        <CrisisOccurrenceIndicator report={report} summaries={sortedSummaries} />
        <ReviewAidCard
          description="依每輪微摘要的 emotion.intensity 呈現，不代表正式量表分數。"
          icon={Activity}
          title="情緒強度趨勢"
        >
          <EmotionIntensityTrend summaries={sortedSummaries} />
        </ReviewAidCard>
        <ReviewAidCard
          description="以本會談各輪 emotion_dimensions 做簡單平均，並附最新一輪快照。"
          icon={BarChart3}
          title="情緒面向平均"
        >
          <EmotionDimensionOverview dimensions={dimensions} />
        </ReviewAidCard>
        <ReviewAidCard
          description="統計微摘要 themes 出現次數，僅作審閱索引。"
          icon={Tags}
          title="主題頻率"
        >
          <ThemeFrequencyList themeCounts={themeCounts} />
        </ReviewAidCard>
      </div>
    </SectionCard>
  )
}

function SummaryCard({ summaryRow }) {
  const summary = summaryRow.summary ?? {}

  return (
    <article className="rounded-md border border-slate-200 bg-white p-4 text-sm shadow-sm dark:border-slate-700 dark:bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">第 {summaryRow.turn_number} 輪微摘要</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDate(summaryRow.created_at)}
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-muted-foreground dark:border-slate-700 dark:bg-slate-900/70">
          摘要危機標記：{summaryRow.crisis_flag ? '是' : '否'}
        </span>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[0.8fr_1fr]">
        <div>
          <p className="text-xs text-muted-foreground">主要情緒</p>
          <p className="mt-1 text-base font-semibold">
            {summary.emotion?.primary ?? '未提供'}
          </p>
          <div className="mt-3">
            <IntensityBar value={summary.emotion?.intensity} />
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">關鍵語句</p>
          <p className="mt-1 leading-6 text-muted-foreground">
            {summary.key_statement ?? '未提供'}
          </p>
        </div>
      </div>

      {summary.themes?.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {summary.themes.map((theme) => (
            <span
              className="rounded-full border border-indigo-200 bg-indigo-50/80 px-2.5 py-1 text-xs text-indigo-950 dark:border-indigo-700/60 dark:bg-indigo-950/32 dark:text-indigo-100"
              key={theme}
            >
              {theme}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  )
}

export default function ReportPage() {
  const { caseId } = useParams()
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('sessionId')
  const [caseInfo, setCaseInfo] = useState(null)
  const [summaries, setSummaries] = useState([])
  const [reportDraft, setReportDraft] = useState(null)
  const [formManualInput, setFormManualInput] = useState({})
  const [draftState, setDraftState] = useState('idle')
  const [draftError, setDraftError] = useState('')
  const [isCreatingDraft, setIsCreatingDraft] = useState(false)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [isGeneratingDraftV2, setIsGeneratingDraftV2] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [saveStatus, setSaveStatus] = useState('已儲存')
  const [draftGenerateStatus, setDraftGenerateStatus] = useState('')
  const [showDraftGenerateConversationLink, setShowDraftGenerateConversationLink] =
    useState(false)
  const [isPrintView, setIsPrintView] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const sortedSummaries = getSortedSummaries(summaries)
  const conversationUrl =
    caseId && sessionId
      ? `/?caseId=${encodeURIComponent(caseId)}&sessionId=${encodeURIComponent(sessionId)}`
      : '/'

  const loadReportContext = useCallback(async () => {
    if (!caseId || !sessionId) return

    setIsLoading(true)
    setError('')
    setDraftError('')
    setDraftState('loading')
    setReportDraft(null)
    setFormManualInput({})
    setHasUnsavedChanges(false)
    setSaveStatus('已儲存')
    setDraftGenerateStatus('')
    setShowDraftGenerateConversationLink(false)
    setIsPrintView(false)

    try {
      const draftResultPromise = getCurrentReportDraft(caseId, sessionId)
        .then((draft) => ({ draft }))
        .catch((draftLoadError) => ({ draftLoadError }))
      const [loadedCase, loadedSummaries, draftResult] = await Promise.all([
        getCase(caseId),
        getSessionSummaries(caseId, sessionId),
        draftResultPromise,
      ])
      setCaseInfo(loadedCase)
      setSummaries(loadedSummaries)

      if (draftResult.draft) {
        setReportDraft(draftResult.draft)
        setFormManualInput(draftResult.draft.manual_input ?? {})
        setDraftState('ready')
      } else {
        const draftMessage = getDraftErrorMessage(draftResult.draftLoadError)
        if (draftMessage === 'not_found') {
          setDraftState('missing')
        } else {
          setDraftState('error')
          setDraftError(draftMessage)
        }
      }
    } catch (loadError) {
      setError(getFriendlyError(loadError, '無法載入報告所需資料。'))
      setDraftState('idle')
    } finally {
      setIsLoading(false)
    }
  }, [caseId, sessionId])

  useEffect(() => {
    loadReportContext()
  }, [loadReportContext])

  async function handleCreateDraft() {
    if (!caseId || !sessionId) return

    setIsCreatingDraft(true)
    setDraftError('')

    try {
      const createdDraft = await createReportDraft(caseId, sessionId, {})
      setReportDraft(createdDraft)
      setFormManualInput(createdDraft.manual_input ?? {})
      setDraftState('ready')
      setHasUnsavedChanges(false)
      setSaveStatus('已儲存')
      setDraftGenerateStatus('')
      setShowDraftGenerateConversationLink(false)
    } catch {
      setDraftError('無法建立 v2 手動資料草稿，請稍後再試。')
    } finally {
      setIsCreatingDraft(false)
    }
  }

  function handleManualInputFieldChange(fieldConfig, value) {
    setFormManualInput((currentManualInput) =>
      setManualInputFieldValue(currentManualInput, fieldConfig, value),
    )
    setHasUnsavedChanges(true)
    setSaveStatus('未儲存變更')
    setDraftGenerateStatus('')
    setShowDraftGenerateConversationLink(false)
  }

  async function handleSaveDraft(event) {
    event.preventDefault()

    const draftId = getDraftId(reportDraft)
    if (!draftId) return

    setIsSavingDraft(true)
    setSaveStatus('儲存中')
    setDraftError('')

    try {
      const updatedDraft = await updateReportDraftManualInput(draftId, {
        manual_input: formManualInput,
      })
      setReportDraft(updatedDraft)
      setFormManualInput(updatedDraft.manual_input ?? formManualInput)
      setHasUnsavedChanges(false)
      setSaveStatus('已儲存')
    } catch {
      setSaveStatus('儲存失敗，請稍後再試')
    } finally {
      setIsSavingDraft(false)
    }
  }

  async function handleGenerateDraftV2() {
    const draftId = getDraftId(reportDraft)

    if (!draftId) return

    if (hasUnsavedChanges) {
      setDraftGenerateStatus('')
      setShowDraftGenerateConversationLink(false)
      return
    }

    setIsGeneratingDraftV2(true)
    setDraftGenerateStatus('')
    setShowDraftGenerateConversationLink(false)

    try {
      const updatedDraft = await generateReportDraftV2(draftId)
      setReportDraft(updatedDraft)
      setFormManualInput(updatedDraft.manual_input ?? formManualInput)
      setHasUnsavedChanges(false)
      setDraftGenerateStatus('已產生 v2 AI 草稿')
    } catch (generateDraftError) {
      if (generateDraftError?.response?.status === 422) {
        setDraftGenerateStatus('至少需要一筆會談摘要才能產生 v2 AI 草稿')
        setShowDraftGenerateConversationLink(Boolean(caseId && sessionId))
      } else {
        setDraftGenerateStatus('產生失敗，請稍後再試')
        setShowDraftGenerateConversationLink(false)
      }
    } finally {
      setIsGeneratingDraftV2(false)
    }
  }

  function handleOpenPrintView() {
    if (!getDraftId(reportDraft)) return
    setIsPrintView(true)
  }

  function handlePrintReport() {
    window.print()
  }

  if (!sessionId) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 pb-24">
        <section className="rounded-md border border-slate-200/80 bg-white/92 p-6 shadow-[0_14px_40px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-card dark:shadow-[0_14px_40px_rgba(0,0,0,0.28)]">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-50 text-indigo-900 dark:bg-indigo-950/32 dark:text-indigo-100">
            <FileText className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold">缺少會談識別碼</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            報告草稿需要個案與會談識別碼。請回到會談工作台，從目前個案進入報告頁。
          </p>
          <Link
            className="mt-5 inline-flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50/70 px-4 py-2 text-sm font-medium text-indigo-950 hover:bg-indigo-100 dark:border-indigo-700/60 dark:bg-indigo-950/32 dark:text-indigo-100 dark:hover:bg-indigo-900/45"
            to="/"
          >
            <ArrowLeft className="h-4 w-4" />
            返回會談工作台
          </Link>
        </section>
      </div>
    )
  }

  if (isPrintView && getDraftId(reportDraft)) {
    return (
      <ReportV2PrintView
        caseInfo={caseInfo}
        draft={reportDraft}
        onBack={() => setIsPrintView(false)}
        onPrint={handlePrintReport}
      />
    )
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 pb-24">
      <section className="flex flex-col gap-4 rounded-md border border-slate-200/80 bg-white/65 p-5 shadow-[0_10px_35px_rgba(15,23,42,0.04)] backdrop-blur dark:border-slate-700 dark:bg-card dark:shadow-[0_10px_35px_rgba(0,0,0,0.24)] lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold text-indigo-800 dark:text-indigo-300">
            個案概念化草稿
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            諮商師報告審閱工作區
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            本頁整理會談微摘要與 AI 文件草稿，供諮商師審閱與判斷；內容不是診斷，也不是正式治療計畫。
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-indigo-200 bg-indigo-50/80 px-2.5 py-1 text-indigo-950 dark:border-indigo-700/60 dark:bg-indigo-950/32 dark:text-indigo-100">
              手動產生草稿
            </span>
            <span className="rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-muted-foreground dark:border-slate-700 dark:bg-slate-900/70">
              不自動生成
            </span>
            <span className="rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-muted-foreground dark:border-slate-700 dark:bg-slate-900/70">
              僅使用目前後端資料
            </span>
          </div>
        </div>

        <Link
          className="inline-flex items-center justify-center gap-2 rounded-md border bg-white/80 px-4 py-2 text-sm font-medium transition hover:bg-slate-100 dark:border-input dark:bg-card dark:hover:bg-slate-800"
          to={conversationUrl}
        >
          <ArrowLeft className="h-4 w-4" />
          回工作台
        </Link>
      </section>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="space-y-5" aria-labelledby="session-review-heading">
        <div className="border-b border-slate-200 pb-3 dark:border-slate-800">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-800 dark:text-indigo-300">
            Session Review
          </p>
          <h2
            className="mt-1 text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-50"
            id="session-review-heading"
          >
            會談整理輔助
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            建議先檢視本區整理，再建立或產生個案概念化報告草稿。
          </p>
        </div>

        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md border border-indigo-100 bg-indigo-50/55 p-4 shadow-sm dark:border-indigo-700/60 dark:bg-indigo-950/32">
            <p className="text-xs text-muted-foreground">個案代碼</p>
            <p className="mt-1 font-semibold">
              {isLoading ? '載入中...' : caseInfo?.code_name ?? '未提供'}
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/90">
            <p className="text-xs text-muted-foreground">會談狀態</p>
            <p className="mt-1 font-semibold">已連結會談</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/90">
            <p className="text-xs text-muted-foreground">可用微摘要</p>
            <p className="mt-1 font-semibold">{summaries.length} 筆</p>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          {isLoading ? (
            <SectionCard
              title="正在載入微摘要"
              description="載入會談摘要後，這裡會整理可供審閱的輔助資訊。"
            >
              <p className="text-sm text-muted-foreground">載入中...</p>
            </SectionCard>
          ) : summaries.length > 0 ? (
            <SummaryReviewAids summaries={summaries} />
          ) : null}

          <SectionCard
            title="會談微摘要時間軸"
            description="以下內容來自每輪微摘要，作為報告草稿生成與諮商師審閱的背景材料。"
          >
            {isLoading ? (
              <p className="text-sm text-muted-foreground">載入中...</p>
            ) : summaries.length === 0 ? (
              <div className="rounded-md border border-dashed bg-muted/40 p-5 text-sm dark:border-slate-700">
                <p className="font-medium">目前沒有可用摘要</p>
                <p className="mt-1 leading-6 text-muted-foreground">
                  請先回到會談工作台送出至少一輪內容，再產生報告草稿。
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedSummaries.map((summaryRow) => (
                  <SummaryCard key={summaryRow.id} summaryRow={summaryRow} />
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </section>

      <section className="space-y-5" aria-labelledby="v2-draft-heading">
        <div className="border-b border-slate-200 pb-3 dark:border-slate-800">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-800 dark:text-indigo-300">
            Report v2 Draft
          </p>
          <h2
            className="mt-1 text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-50"
            id="v2-draft-heading"
          >
            個案概念化報告草稿
          </h2>
        </div>

        <ReportDraftManualInputPanel
          draft={reportDraft}
          draftError={draftError}
          draftState={draftState}
          formManualInput={formManualInput}
          hasUnsavedChanges={hasUnsavedChanges}
          isCreatingDraft={isCreatingDraft}
          isSavingDraft={isSavingDraft}
          onCreateDraft={handleCreateDraft}
          onFieldChange={handleManualInputFieldChange}
          onSaveDraft={handleSaveDraft}
          saveStatus={saveStatus}
        />

        <ReportDraftGeneratePanel
          conversationUrl={conversationUrl}
          draft={reportDraft}
          generateStatus={draftGenerateStatus}
          hasUnsavedChanges={hasUnsavedChanges}
          isGeneratingDraft={isGeneratingDraftV2}
          isSavingDraft={isSavingDraft}
          onGenerateDraft={handleGenerateDraftV2}
          showConversationLink={showDraftGenerateConversationLink}
        />

        {getDraftId(reportDraft) ? (
          <div className="flex justify-end">
            <button
              className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-card dark:text-slate-50 dark:hover:bg-slate-800"
              onClick={handleOpenPrintView}
              type="button"
            >
              <Printer className="h-4 w-4" />
              列印友善檢視
            </button>
          </div>
        ) : null}

        <ReportV2Preview draft={reportDraft} />
      </section>

    </div>
  )
}
