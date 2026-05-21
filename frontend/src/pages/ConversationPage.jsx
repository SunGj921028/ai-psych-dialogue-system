import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  ClipboardList,
  FileText,
  MessageSquareText,
  Plus,
  RefreshCcw,
  Send,
  UserRound,
} from 'lucide-react'
import {
  createCase,
  getSessionMessages,
  getSessionSummaries,
  listCases,
  sendConversationTurn,
} from '../api/client.js'

const ACTIVE_CASE_KEY = 'ai-psych-active-case-id'
const ACTIVE_SESSION_KEY = 'ai-psych-active-session-id'

const emotionDimensionLabels = {
  anxiety: '焦慮',
  sadness: '悲傷',
  anger: '憤怒',
  hopelessness: '無望',
  confusion: '困惑',
  hope: '希望',
}

function createSessionId() {
  return crypto.randomUUID()
}

function getFriendlyError(error, fallback = '操作失敗，請稍後再試。') {
  if (error?.response?.status === 404) {
    return '找不到指定的個案或會談資料。'
  }

  if (error?.response?.status === 422) {
    return '送出的資料格式不完整，請確認必填欄位。'
  }

  if (error?.code === 'ECONNABORTED') {
    return '後端回應逾時，請稍後再試。'
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

function getNextTurnNumber(messages, summaries = []) {
  const maxMessageTurn = messages.reduce((currentMax, message) => {
    return Math.max(currentMax, Number(message.turn_number) || 0)
  }, 0)

  const maxSummaryTurn = summaries.reduce((currentMax, summaryRow) => {
    return Math.max(
      currentMax,
      Number(summaryRow.turn_number) ||
        Number(summaryRow.summary?.turn_number) ||
        0,
    )
  }, 0)

  return Math.max(maxMessageTurn, maxSummaryTurn) + 1
}

function normalizeConversationHistory(messages) {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role,
      content: message.content,
    }))
}

function clampScore(value) {
  const numberValue = Number(value)

  if (!Number.isFinite(numberValue)) return null

  return Math.max(0, Math.min(10, numberValue))
}

function getCrisisLabel(level) {
  if (level === 'high') return '高風險'
  if (level === 'low') return '需留意'
  if (level === 'none') return '未偵測'
  return '尚無資料'
}

function SectionShell({ children, className = '' }) {
  return (
    <section
      className={`rounded-md border border-slate-200/80 bg-white/90 shadow-[0_14px_40px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-card dark:shadow-[0_14px_40px_rgba(0,0,0,0.28)] ${className}`}
    >
      {children}
    </section>
  )
}

function EmptyState({ title, description }) {
  return (
    <div className="rounded-md border border-dashed border-indigo-200/70 bg-indigo-50/45 p-5 text-sm dark:border-indigo-700/60 dark:bg-slate-700">
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 leading-6 text-muted-foreground">{description}</p>
    </div>
  )
}

function IntensityBar({ value }) {
  const score = clampScore(value)
  const width = score == null ? 0 : score * 10

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>情緒強度</span>
        <span>{score == null ? '未提供' : `${score}/10`}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200/80 dark:bg-slate-700/80">
        <div
          className="h-2 rounded-full bg-gradient-to-r from-indigo-600 to-slate-600 transition-all dark:from-indigo-500 dark:to-slate-500"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  )
}

function DimensionBars({ dimensions }) {
  const entries = dimensions ? Object.entries(dimensions) : []

  if (!entries.length) {
    return (
      <p className="text-sm text-muted-foreground">尚未提供情緒維度資料。</p>
    )
  }

  return (
    <div className="space-y-3">
      {entries.map(([key, value]) => {
        const score = clampScore(value)
        const width = score == null ? 0 : score * 10

        return (
          <div className="space-y-1" key={key}>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {emotionDimensionLabels[key] ?? key}
              </span>
              <span className="font-medium">{score == null ? '-' : score}</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-200/80 dark:bg-slate-700/80">
              <div
                className="h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-500"
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function ConversationPage() {
  const [searchParams] = useSearchParams()
  const queryCaseId = searchParams.get('caseId') ?? ''
  const querySessionId = searchParams.get('sessionId') ?? ''
  const [cases, setCases] = useState([])
  const [activeCaseId, setActiveCaseId] = useState(() => {
    return queryCaseId || sessionStorage.getItem(ACTIVE_CASE_KEY) || ''
  })
  const [sessionId, setSessionId] = useState(() => {
    return querySessionId || sessionStorage.getItem(ACTIVE_SESSION_KEY) || ''
  })
  const [messages, setMessages] = useState([])
  const [summaries, setSummaries] = useState([])
  const [crisisStatus, setCrisisStatus] = useState(null)
  const [codeName, setCodeName] = useState('')
  const [note, setNote] = useState('')
  const [userInput, setUserInput] = useState('')
  const [isLoadingCases, setIsLoadingCases] = useState(false)
  const [isCreatingCase, setIsCreatingCase] = useState(false)
  const [isLoadingSession, setIsLoadingSession] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const activeCase = useMemo(() => {
    return cases.find((item) => item.id === activeCaseId) ?? null
  }, [activeCaseId, cases])

  const latestSummary = summaries.at(-1) ?? null
  const latestSummaryData = latestSummary?.summary ?? null

  const reportUrl =
    activeCaseId && sessionId
      ? `/report/${activeCaseId}?sessionId=${encodeURIComponent(sessionId)}`
      : ''

  const loadCases = useCallback(async () => {
    setIsLoadingCases(true)
    setError('')

    try {
      const data = await listCases()
      setCases(data)
    } catch (loadError) {
      setError(getFriendlyError(loadError, '無法載入個案清單。'))
    } finally {
      setIsLoadingCases(false)
    }
  }, [])

  const loadSessionData = useCallback(async (caseId, currentSessionId) => {
    if (!caseId || !currentSessionId) return

    setIsLoadingSession(true)
    setError('')

    try {
      const [loadedMessages, loadedSummaries] = await Promise.all([
        getSessionMessages(caseId, currentSessionId),
        getSessionSummaries(caseId, currentSessionId),
      ])
      setMessages(loadedMessages)
      setSummaries(loadedSummaries)
    } catch (loadError) {
      setError(getFriendlyError(loadError, '無法載入此會談的訊息與摘要。'))
    } finally {
      setIsLoadingSession(false)
    }
  }, [])

  useEffect(() => {
    loadCases()
  }, [loadCases])

  useEffect(() => {
    if (queryCaseId && queryCaseId !== activeCaseId) {
      setActiveCaseId(queryCaseId)
    }

    if (querySessionId && querySessionId !== sessionId) {
      setSessionId(querySessionId)
    }
  }, [activeCaseId, queryCaseId, querySessionId, sessionId])

  useEffect(() => {
    if (!activeCaseId) {
      sessionStorage.removeItem(ACTIVE_CASE_KEY)
      setMessages([])
      setSummaries([])
      setCrisisStatus(null)
      return
    }

    sessionStorage.setItem(ACTIVE_CASE_KEY, activeCaseId)
  }, [activeCaseId])

  useEffect(() => {
    if (!sessionId) {
      sessionStorage.removeItem(ACTIVE_SESSION_KEY)
      setMessages([])
      setSummaries([])
      setCrisisStatus(null)
      return
    }

    sessionStorage.setItem(ACTIVE_SESSION_KEY, sessionId)
  }, [sessionId])

  useEffect(() => {
    loadSessionData(activeCaseId, sessionId)
  }, [activeCaseId, loadSessionData, sessionId])

  async function handleCreateCase(event) {
    event.preventDefault()

    const trimmedCodeName = codeName.trim()
    const trimmedNote = note.trim()

    if (!trimmedCodeName) {
      setError('請輸入個案代碼。')
      return
    }

    setIsCreatingCase(true)
    setError('')

    try {
      const newCase = await createCase({
        code_name: trimmedCodeName,
        note: trimmedNote || null,
      })
      const newSessionId = createSessionId()

      setCases((currentCases) => [newCase, ...currentCases])
      setActiveCaseId(newCase.id)
      setSessionId(newSessionId)
      setMessages([])
      setSummaries([])
      setCrisisStatus(null)
      setCodeName('')
      setNote('')
    } catch (createError) {
      setError(getFriendlyError(createError, '無法建立個案，請稍後再試。'))
    } finally {
      setIsCreatingCase(false)
    }
  }

  function handleSelectCase(event) {
    const selectedCaseId = event.target.value
    setActiveCaseId(selectedCaseId)
    setMessages([])
    setSummaries([])
    setCrisisStatus(null)

    if (selectedCaseId) {
      setSessionId(createSessionId())
    } else {
      setSessionId('')
    }
  }

  function handleNewSession() {
    if (!activeCaseId) {
      setError('請先選擇或建立個案。')
      return
    }

    setSessionId(createSessionId())
    setMessages([])
    setSummaries([])
    setCrisisStatus(null)
    setError('')
  }

  async function handleSubmitTurn(event) {
    event.preventDefault()

    const trimmedInput = userInput.trim()

    if (!activeCaseId) {
      setError('請先選擇或建立個案，再送出會談內容。')
      return
    }

    if (!sessionId) {
      setError('目前沒有會談識別碼，請建立新的會談。')
      return
    }

    if (!trimmedInput) {
      setError('請輸入需要整理的會談內容。')
      return
    }

    setIsSubmitting(true)
    setError('')

    const nextTurnNumber = getNextTurnNumber(messages, summaries)

    try {
      const response = await sendConversationTurn({
        case_id: activeCaseId,
        session_id: sessionId,
        turn_number: nextTurnNumber,
        user_input: trimmedInput,
        conversation_history: normalizeConversationHistory(messages),
      })

      setCrisisStatus(response.crisis)
      setUserInput('')
      await loadSessionData(activeCaseId, sessionId)
    } catch (submitError) {
      setError(getFriendlyError(submitError, '無法送出本輪內容，請稍後再試。'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 pb-24">
      <section className="flex flex-col gap-3 rounded-md border border-slate-200/80 bg-white/65 p-5 shadow-[0_10px_35px_rgba(15,23,42,0.04)] backdrop-blur dark:border-slate-700 dark:bg-card dark:shadow-[0_10px_35px_rgba(0,0,0,0.24)] lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold text-indigo-800 dark:text-indigo-300">
            諮商文件輔助工作區
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            會談準備工作台
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            供諮商師輸入個案提供的文字，檢視 AI 回應草稿、微摘要與後端危機偵測結果。所有內容僅作文件輔助與審閱參考。
          </p>
        </div>

        {reportUrl ? (
          <Link
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-[0_10px_22px_rgba(30,41,59,0.16)] hover:bg-indigo-900 dark:hover:bg-indigo-600"
            to={reportUrl}
          >
            <FileText className="h-4 w-4" />
            前往草稿報告
          </Link>
        ) : null}
      </section>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {crisisStatus?.crisis_level === 'high' ? (
        <section
          className="rounded-md border border-red-300 bg-red-50/95 p-4 text-red-950 shadow-[0_12px_30px_rgba(185,28,28,0.10)] dark:border-red-500/70 dark:bg-red-950/82 dark:text-red-100 dark:shadow-[0_12px_30px_rgba(127,29,29,0.28)]"
          role="alert"
        >
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <h2 className="font-semibold">偵測到高風險語句</h2>
              <p className="mt-1 text-sm leading-6">
                後端回傳 crisis_level 為 high。請諮商師立即審閱本輪內容，並依專業流程處理。
              </p>
              {crisisStatus.reason ? (
                <p className="mt-2 text-sm">後端說明：{crisisStatus.reason}</p>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <SectionShell className="p-4 ring-1 ring-white/60">
        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <form className="grid gap-3 sm:grid-cols-[1fr_1.2fr_auto]" onSubmit={handleCreateCase}>
            <label className="text-sm font-medium">
              建立個案代碼
              <input
                className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-input dark:bg-background dark:text-foreground dark:placeholder:text-slate-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/20"
                value={codeName}
                onChange={(event) => setCodeName(event.target.value)}
                placeholder="例如：A001"
              />
            </label>

            <label className="text-sm font-medium">
              備註
              <input
                className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-input dark:bg-background dark:text-foreground dark:placeholder:text-slate-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/20"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="選填，請避免可識別個資"
              />
            </label>

            <button
              className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-indigo-900 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-indigo-600"
              disabled={isCreatingCase}
              type="submit"
            >
              <Plus className="h-4 w-4" />
              {isCreatingCase ? '建立中' : '建立'}
            </button>
          </form>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="text-sm font-medium">
              選擇既有個案
              <select
                className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-input dark:bg-background dark:text-foreground dark:focus:border-indigo-400 dark:focus:ring-indigo-500/20"
                disabled={isLoadingCases}
                value={activeCaseId}
                onChange={handleSelectCase}
              >
                <option value="">請選擇個案</option>
                {cases.map((caseItem) => (
                  <option key={caseItem.id} value={caseItem.id}>
                    {caseItem.code_name}
                  </option>
                ))}
              </select>
            </label>

            <button
              className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-md border bg-white px-4 text-sm font-medium transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-input dark:bg-card dark:hover:bg-slate-800"
              disabled={!activeCaseId}
              onClick={handleNewSession}
              type="button"
            >
              <RefreshCcw className="h-4 w-4" />
              新會談
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
          <div className="rounded-md border border-indigo-100 bg-indigo-50/55 p-3 dark:border-indigo-700/60 dark:bg-slate-900/90">
            <p className="text-xs text-muted-foreground">目前個案</p>
            <p className="mt-1 font-medium">{activeCase?.code_name ?? '尚未選擇'}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/90">
            <p className="text-xs text-muted-foreground">會談識別碼</p>
            <p className="mt-1 truncate font-mono text-xs">{sessionId || '尚未建立'}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/90">
            <p className="text-xs text-muted-foreground">摘要數</p>
            <p className="mt-1 font-medium">{summaries.length} 筆微摘要</p>
          </div>
        </div>
      </SectionShell>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <SectionShell className="flex min-h-[640px] flex-col overflow-hidden ring-1 ring-white/60">
          <div className="flex items-center justify-between gap-3 border-b bg-gradient-to-r from-white to-indigo-50/55 px-4 py-3 dark:border-slate-800 dark:from-slate-900 dark:to-indigo-950/18">
            <div>
              <h2 className="flex items-center gap-2 font-semibold">
                <MessageSquareText className="h-4 w-4" />
                會談對話
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                顯示諮商師輸入內容與 AI 文件輔助回應。
              </p>
            </div>
            {isLoadingSession ? (
              <span className="text-sm text-muted-foreground">載入中...</span>
            ) : null}
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto bg-[linear-gradient(180deg,rgba(240,253,250,0.45),rgba(248,250,252,0.78))] p-4 dark:bg-[linear-gradient(180deg,rgba(19,78,74,0.14),rgba(15,23,42,0.76))]">
            {messages.length === 0 ? (
              <EmptyState
                title="尚無會談訊息"
                description="選擇或建立個案後，在下方輸入個案提供的文字，即可產生本輪回應與微摘要。"
              />
            ) : (
              messages.map((message) => {
                const isUser = message.role === 'user'

                return (
                  <article
                    className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                    key={message.id}
                  >
                    {!isUser ? (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                        <Bot className="h-4 w-4" />
                      </div>
                    ) : null}

                    <div
                      className={`max-w-[86%] rounded-md border px-4 py-3 shadow-sm ${
                        isUser
                          ? 'border-primary bg-primary text-primary-foreground shadow-[0_12px_28px_rgba(30,41,59,0.16)] dark:border-indigo-500/50 dark:bg-indigo-700/80'
                          : 'border-slate-200 bg-white text-card-foreground shadow-[0_10px_24px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-card'
                      }`}
                    >
                      <div
                        className={`flex flex-wrap items-center gap-2 text-xs ${
                          isUser ? 'text-indigo-100' : 'text-muted-foreground'
                        }`}
                      >
                        <span>第 {message.turn_number} 輪</span>
                        <span>
                          {isUser
                            ? '諮商師輸入的個案內容'
                            : 'AI 文件輔助回應'}
                        </span>
                        <span>{formatDate(message.created_at)}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                        {message.content}
                      </p>
                    </div>

                    {isUser ? (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-indigo-200 bg-indigo-50 text-indigo-900 shadow-sm dark:border-indigo-700/60 dark:bg-indigo-950/35 dark:text-indigo-100">
                        <UserRound className="h-4 w-4" />
                      </div>
                    ) : null}
                  </article>
                )
              })
            )}
          </div>

          <form
            className="sticky bottom-14 border-t bg-white/95 p-4 shadow-[0_-16px_34px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-700 dark:!bg-slate-950 dark:shadow-[0_-16px_34px_rgba(0,0,0,0.26)]"
            onSubmit={handleSubmitTurn}
          >
            <label className="sr-only" htmlFor="conversation-input">
              輸入本輪會談文字
            </label>
            <div className="flex flex-col gap-3 md:flex-row">
              <textarea
                className="min-h-24 flex-1 resize-none rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm leading-6 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:!bg-slate-900 dark:text-foreground dark:placeholder:text-slate-400 dark:focus:border-indigo-400 dark:focus:bg-slate-900 dark:focus:ring-indigo-500/20"
                id="conversation-input"
                value={userInput}
                onChange={(event) => setUserInput(event.target.value)}
                placeholder="輸入本輪由個案提供、諮商師代為整理的文字..."
              />
              <button
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-[0_10px_22px_rgba(30,41,59,0.16)] transition hover:bg-indigo-900 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-indigo-600 md:self-end"
                disabled={!activeCaseId || !sessionId || isSubmitting}
                type="submit"
              >
                <Send className="h-4 w-4" />
                {isSubmitting ? '送出中' : '送出本輪'}
              </button>
            </div>
          </form>
        </SectionShell>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <SectionShell className="p-4 ring-1 ring-white/60">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-semibold">
                  <ClipboardList className="h-4 w-4" />
                  即時微摘要
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  依後端回傳摘要呈現，供諮商師審閱。
                </p>
              </div>
              {latestSummary ? (
                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs text-indigo-900 dark:border-indigo-700/60 dark:bg-indigo-950/32 dark:text-indigo-100">
                  第 {latestSummary.turn_number} 輪
                </span>
              ) : null}
            </div>

            {!latestSummaryData ? (
              <div className="mt-4">
                <EmptyState
                  title="尚無微摘要"
                  description="送出第一輪內容後，此處會顯示情緒、主題與關鍵語句。"
                />
              </div>
            ) : (
              <div className="mt-4 space-y-5 text-sm">
                <div className="rounded-md border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-3 shadow-inner dark:border-indigo-700/60 dark:from-indigo-950/32 dark:to-slate-900">
                  <p className="text-xs text-muted-foreground">主要情緒</p>
                  <p className="mt-1 text-base font-semibold">
                    {latestSummaryData.emotion?.primary ?? '未提供'}
                  </p>
                  <div className="mt-3">
                    <IntensityBar value={latestSummaryData.emotion?.intensity} />
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    情緒維度
                  </p>
                  <DimensionBars dimensions={latestSummaryData.emotion_dimensions} />
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    主題
                  </p>
                  {latestSummaryData.themes?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {latestSummaryData.themes.map((theme) => (
                        <span
                          className="rounded-full border border-indigo-200 bg-indigo-50/80 px-2.5 py-1 text-xs text-indigo-950 shadow-sm dark:border-indigo-700/60 dark:bg-indigo-950/32 dark:text-indigo-100"
                          key={theme}
                        >
                          {theme}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">未提供</p>
                  )}
                </div>

                <blockquote className="rounded-md border border-slate-200 border-l-4 border-l-indigo-500 bg-white/80 p-3 text-sm leading-6 text-muted-foreground shadow-sm dark:border-slate-700 dark:border-l-indigo-500 dark:bg-slate-900/90">
                  {latestSummaryData.key_statement ?? '尚無關鍵語句。'}
                </blockquote>
              </div>
            )}
          </SectionShell>

          <SectionShell className="p-4 ring-1 ring-white/60">
            <h2 className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              危機狀態
            </h2>
            <div className="mt-3 rounded-md border border-slate-200 bg-slate-50/80 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/90">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">後端等級</span>
                <span className="font-medium">
                  {getCrisisLabel(crisisStatus?.crisis_level)}
                </span>
              </div>
              <p className="mt-3 leading-6 text-muted-foreground">
                {crisisStatus
                  ? crisisStatus.reason || '後端未提供額外說明。'
                  : '尚無本輪危機偵測結果；重新載入的摘要不會在前端重新推估危機等級。'}
              </p>
            </div>
            {crisisStatus?.crisis_level === 'low' ? (
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                low 等級僅作為諮商師審閱 metadata 顯示，不提升為紅色警示。
              </p>
            ) : null}
          </SectionShell>

          <SectionShell className="p-4 ring-1 ring-white/60">
            <h2 className="flex items-center gap-2 font-semibold">
              <FileText className="h-4 w-4" />
              草稿報告
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              完成會談輸入後，可前往個案概念化草稿頁，由諮商師審閱後再決定是否使用。
            </p>
            {reportUrl ? (
              <Link
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border border-indigo-200 bg-indigo-50/70 px-4 py-2 text-sm font-medium text-indigo-950 transition hover:bg-indigo-100 dark:border-indigo-700/60 dark:bg-indigo-950/32 dark:text-indigo-100 dark:hover:bg-indigo-900/45"
                to={reportUrl}
              >
                開啟報告頁
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <button
                className="mt-4 inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-md border bg-slate-50 px-4 py-2 text-sm font-medium opacity-60 dark:border-slate-700 dark:bg-slate-900"
                disabled
                type="button"
              >
                請先選擇個案
              </button>
            )}
          </SectionShell>
        </aside>
      </div>
    </div>
  )
}
