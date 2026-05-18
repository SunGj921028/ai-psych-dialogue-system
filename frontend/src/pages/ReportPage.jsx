import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
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

function ReportSection({ title, value }) {
  return (
    <section className="rounded-md border p-3 text-sm">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
        {value || '未提供'}
      </p>
    </section>
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
      setError('缺少個案或會談識別碼，無法產生報告。')
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
      <div className="mx-auto max-w-5xl space-y-4 p-4">
        <h1 className="text-2xl font-semibold">個案概念化草稿報告</h1>
        <div className="rounded-md border bg-card p-4">
          <h2 className="font-semibold">缺少會談識別碼</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            請回到會談工作台，從目前個案與會談進入報告頁面。
          </p>
          <Link
            className="mt-4 inline-flex rounded-md border px-4 py-2 text-sm font-medium"
            to="/"
          >
            返回會談工作台
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">個案概念化草稿報告</h1>
        <p className="text-sm text-muted-foreground">
          報告由後端根據會談摘要產生，僅供諮商師審閱與修訂，不作為診斷文件。
        </p>
      </section>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="rounded-md border bg-card p-4 text-sm">
        <h2 className="font-semibold">報告脈絡</h2>
        {isLoading ? (
          <p className="mt-2 text-muted-foreground">載入中...</p>
        ) : (
          <div className="mt-2 space-y-1">
            <p>個案代碼：{caseInfo?.code_name ?? '載入中或未提供'}</p>
            <p className="break-all">case_id：{caseId}</p>
            <p className="break-all">session_id：{sessionId}</p>
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-md border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">會談摘要</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              摘要供報告生成參考，仍需由諮商師確認。
            </p>
          </div>
          <button
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isGenerating || !caseId || !sessionId}
            onClick={handleGenerateReport}
            type="button"
          >
            {isGenerating ? '產生中...' : '產生草稿報告'}
          </button>
        </div>

        {summaries.length === 0 ? (
          <p className="text-sm text-muted-foreground">目前沒有可用摘要。</p>
        ) : (
          <div className="space-y-3">
            {summaries.map((summaryRow) => (
              <article className="rounded-md border p-3 text-sm" key={summaryRow.id}>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>第 {summaryRow.turn_number} 輪</span>
                  <span>{formatDate(summaryRow.created_at)}</span>
                  <span>crisis_flag：{String(summaryRow.crisis_flag)}</span>
                </div>
                <p className="mt-2">
                  主要情緒：
                  <span className="font-medium">
                    {summaryRow.summary?.emotion?.primary ?? '未提供'}
                  </span>
                </p>
                <p className="mt-1">
                  強度：
                  <span className="font-medium">
                    {summaryRow.summary?.emotion?.intensity ?? '未提供'}
                  </span>
                </p>
                <p className="mt-1 text-muted-foreground">
                  {summaryRow.summary?.key_statement ?? '未提供關鍵語句'}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      {report ? (
        <section className="space-y-4 rounded-md border bg-card p-4">
          <div>
            <h2 className="font-semibold">AI 草稿報告</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              生成時間：{formatDate(report.generated_at)}
            </p>
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            {report.disclaimer}
          </div>

          <ReportSection title="主訴摘要" value={report.chief_complaint} />
          <ReportSection
            title="情緒模式"
            value={report.emotion_pattern?.description}
          />
          <div className="rounded-md border p-3 text-sm">
            <h3 className="font-semibold">情緒模式資料</h3>
            <p className="mt-2">
              趨勢：{report.emotion_pattern?.intensity_trend ?? '未提供'}
            </p>
            <p>峰值輪次：{report.emotion_pattern?.peak_turn ?? '未提供'}</p>
            <p>
              主要情緒：
              {report.emotion_pattern?.dominant_emotions?.join('、') ?? '未提供'}
            </p>
          </div>
          <ReportSection
            title="認知與行為分析草稿"
            value={report.cognitive_behavioral_analysis}
          />
          <ReportSection
            title="初步概念化"
            value={report.initial_conceptualization}
          />
          <div className="rounded-md border p-3 text-sm">
            <h3 className="font-semibold">可供諮商師評估的方向</h3>
            {report.suggested_directions?.length ? (
              <ul className="mt-2 list-inside list-disc text-muted-foreground">
                {report.suggested_directions.map((direction) => (
                  <li key={direction}>{direction}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-muted-foreground">未提供</p>
            )}
          </div>
          <ReportSection title="危機摘要" value={report.crisis_summary} />
          <div className="rounded-md border p-3 text-sm">
            has_crisis：
            <span className="font-medium">{String(report.has_crisis)}</span>
          </div>
        </section>
      ) : null}
    </div>
  )
}
