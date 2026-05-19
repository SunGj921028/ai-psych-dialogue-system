import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ClipboardList,
  FileText,
  Loader2,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react'
import {
  generateReport,
  getCase,
  getSessionSummaries,
} from '../api/client.js'

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

function formatTrend(value) {
  const trendLabels = {
    ascending: '逐步升高',
    descending: '逐步下降',
    fluctuating: '起伏變動',
    stable: '相對穩定',
  }

  return trendLabels[value] ?? value ?? '未提供'
}

function SectionCard({ title, description, children }) {
  return (
    <section className="rounded-md border border-slate-200/80 bg-white/92 p-5 shadow-[0_14px_40px_rgba(15,23,42,0.06)] ring-1 ring-white/60">
      <div className="mb-4 border-b border-slate-100 pb-3">
        <h3 className="font-semibold text-slate-950">{title}</h3>
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

function ReportTextBlock({ title, value }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <h4 className="text-sm font-semibold text-teal-950">{title}</h4>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
        {value || '未提供'}
      </p>
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
      <div className="h-2 rounded-full bg-slate-200/80">
        <div
          className="h-2 rounded-full bg-gradient-to-r from-teal-700 to-slate-700"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  )
}

function SummaryCard({ summaryRow }) {
  const summary = summaryRow.summary ?? {}

  return (
    <article className="rounded-md border border-slate-200 bg-white p-4 text-sm shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">第 {summaryRow.turn_number} 輪微摘要</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDate(summaryRow.created_at)}
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-muted-foreground">
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
              className="rounded-full border border-teal-200 bg-teal-50/80 px-2.5 py-1 text-xs text-teal-950"
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
  const [report, setReport] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')

  const loadReportContext = useCallback(async () => {
    if (!caseId || !sessionId) return

    setIsLoading(true)
    setError('')

    try {
      const [loadedCase, loadedSummaries] = await Promise.all([
        getCase(caseId),
        getSessionSummaries(caseId, sessionId),
      ])
      setCaseInfo(loadedCase)
      setSummaries(loadedSummaries)
    } catch (loadError) {
      setError(getFriendlyError(loadError, '無法載入報告所需資料。'))
    } finally {
      setIsLoading(false)
    }
  }, [caseId, sessionId])

  useEffect(() => {
    loadReportContext()
  }, [loadReportContext])

  async function handleGenerateReport() {
    if (!caseId || !sessionId) {
      setError('缺少個案或會談識別碼，無法產生報告草稿。')
      return
    }

    setIsGenerating(true)
    setError('')

    try {
      const generatedReport = await generateReport({
        case_id: caseId,
        session_id: sessionId,
      })
      setReport(generatedReport)
    } catch (generateError) {
      setError(getFriendlyError(generateError, '無法產生報告草稿，請稍後再試。'))
    } finally {
      setIsGenerating(false)
    }
  }

  if (!sessionId) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 pb-24">
        <section className="rounded-md border border-slate-200/80 bg-white/92 p-6 shadow-[0_14px_40px_rgba(15,23,42,0.06)]">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-50 text-teal-900">
            <FileText className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold">缺少會談識別碼</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            報告草稿需要個案與會談識別碼。請回到會談工作台，從目前個案進入報告頁。
          </p>
          <Link
            className="mt-5 inline-flex items-center gap-2 rounded-md border border-teal-200 bg-teal-50/70 px-4 py-2 text-sm font-medium text-teal-950 hover:bg-teal-100"
            to="/"
          >
            <ArrowLeft className="h-4 w-4" />
            返回會談工作台
          </Link>
        </section>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 pb-24">
      <section className="flex flex-col gap-4 rounded-md border border-slate-200/80 bg-white/65 p-5 shadow-[0_10px_35px_rgba(15,23,42,0.04)] backdrop-blur lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold text-teal-800">
            個案概念化草稿
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            結構化報告審閱
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            本頁呈現 AI 產生的文件草稿與微摘要脈絡，供諮商師審閱、修正與判斷，不作診斷文件。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            className="inline-flex items-center justify-center gap-2 rounded-md border bg-white/80 px-4 py-2 text-sm font-medium transition hover:bg-teal-50"
            to="/"
          >
            <ArrowLeft className="h-4 w-4" />
            回工作台
          </Link>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-[0_10px_22px_rgba(15,118,110,0.18)] transition hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isGenerating || !caseId || !sessionId}
            onClick={handleGenerateReport}
            type="button"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
            {report ? '重新產生草稿' : '產生報告草稿'}
          </button>
        </div>
      </section>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <div className="rounded-md border border-teal-100 bg-teal-50/55 p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">個案代碼</p>
          <p className="mt-1 font-semibold">
            {isLoading ? '載入中...' : caseInfo?.code_name ?? '未提供'}
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white/80 p-4 shadow-sm md:col-span-2">
          <p className="text-xs text-muted-foreground">會談識別碼</p>
          <p className="mt-1 truncate font-mono text-xs">{sessionId}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white/80 p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">可用微摘要</p>
          <p className="mt-1 font-semibold">{summaries.length} 筆</p>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <SectionCard
          title="會談微摘要脈絡"
          description="以下內容來自每輪微摘要，作為報告草稿生成與諮商師審閱的背景材料。"
        >
          {isLoading ? (
            <p className="text-sm text-muted-foreground">載入中...</p>
          ) : summaries.length === 0 ? (
            <div className="rounded-md border border-dashed bg-muted/40 p-5 text-sm">
              <p className="font-medium">目前沒有可用摘要</p>
              <p className="mt-1 leading-6 text-muted-foreground">
                請先回到會談工作台送出至少一輪內容，再產生報告草稿。
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {summaries.map((summaryRow) => (
                <SummaryCard key={summaryRow.id} summaryRow={summaryRow} />
              ))}
            </div>
          )}
        </SectionCard>

        <section className="space-y-4">
          {!report ? (
            <SectionCard
              title="尚未產生報告草稿"
              description="報告不會自動產生。請由諮商師確認摘要脈絡後，手動產生草稿。"
            >
              <button
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-[0_10px_22px_rgba(15,118,110,0.18)] transition hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isGenerating || !caseId || !sessionId}
                onClick={handleGenerateReport}
                type="button"
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                {isGenerating ? '產生中' : '產生報告草稿'}
              </button>
            </SectionCard>
          ) : (
            <>
              <section className="rounded-md border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-950 shadow-[0_10px_26px_rgba(146,64,14,0.08)]">
                <div className="flex gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <h2 className="font-semibold">報告免責聲明</h2>
                    <p className="mt-2 whitespace-pre-wrap leading-6">
                      {report.disclaimer}
                    </p>
                  </div>
                </div>
              </section>

              <SectionCard
                title="AI 草稿報告"
                description={`產生時間：${formatDate(report.generated_at)}。以下內容需由諮商師審閱後才可使用。`}
              >
                <div className="grid gap-3">
                  <ReportTextBlock title="主訴摘要" value={report.chief_complaint} />

                  <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                    <h4 className="text-sm font-semibold text-teal-950">情緒模式觀察</h4>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                      {report.emotion_pattern?.description ?? '未提供'}
                    </p>
                    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                      <div className="rounded-md border border-teal-100 bg-teal-50/55 p-3">
                        <p className="text-xs text-muted-foreground">強度趨勢</p>
                        <p className="mt-1 font-medium">
                          {formatTrend(report.emotion_pattern?.intensity_trend)}
                        </p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50/80 p-3">
                        <p className="text-xs text-muted-foreground">高峰輪次</p>
                        <p className="mt-1 font-medium">
                          {report.emotion_pattern?.peak_turn ?? '未提供'}
                        </p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50/80 p-3">
                        <p className="text-xs text-muted-foreground">主要情緒</p>
                        <p className="mt-1 font-medium">
                          {report.emotion_pattern?.dominant_emotions?.join('、') ??
                            '未提供'}
                        </p>
                      </div>
                    </div>
                  </section>

                  <ReportTextBlock
                    title="認知與行為觀察"
                    value={report.cognitive_behavioral_analysis}
                  />
                  <ReportTextBlock
                    title="初步概念化"
                    value={report.initial_conceptualization}
                  />

                  <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                    <h4 className="text-sm font-semibold text-teal-950">供審閱方向</h4>
                    {report.suggested_directions?.length ? (
                      <ul className="mt-2 space-y-2 text-sm leading-6 text-muted-foreground">
                        {report.suggested_directions.map((direction) => (
                          <li key={direction}>• {direction}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">未提供</p>
                    )}
                  </section>

                  <ReportTextBlock title="危機摘要" value={report.crisis_summary} />

                  <section className="rounded-md border border-slate-200 bg-white p-4 text-sm shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">報告危機彙整</span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs">
                        has_crisis：{report.has_crisis ? 'true' : 'false'}
                      </span>
                    </div>
                    <p className="mt-2 leading-6 text-muted-foreground">
                      此欄位由後端報告資料提供，僅作諮商師審閱與後續判斷參考。
                    </p>
                  </section>
                </div>
              </SectionCard>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
