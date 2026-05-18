import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  createCase,
  getSessionMessages,
  getSessionSummaries,
  listCases,
  sendConversationTurn,
} from '../api/client.js'

const ACTIVE_CASE_KEY = 'ai-psych-active-case-id'
const ACTIVE_SESSION_KEY = 'ai-psych-active-session-id'

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

function getNextTurnNumber(messages) {
  const maxTurn = messages.reduce((currentMax, message) => {
    return Math.max(currentMax, Number(message.turn_number) || 0)
  }, 0)

  return maxTurn + 1
}

function normalizeConversationHistory(messages) {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role,
      content: message.content,
    }))
}

export default function ConversationPage() {
  const [cases, setCases] = useState([])
  const [activeCaseId, setActiveCaseId] = useState(() => {
    return sessionStorage.getItem(ACTIVE_CASE_KEY) ?? ''
  })
  const [sessionId, setSessionId] = useState(() => {
    return sessionStorage.getItem(ACTIVE_SESSION_KEY) ?? ''
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

    const nextTurnNumber = getNextTurnNumber(messages)

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
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">會談準備工作台</h1>
        <p className="text-sm text-muted-foreground">
          供諮商師輸入個案提供的文字，整理回應、微摘要與風險狀態。AI
          內容僅作為文件輔助，仍需由諮商師審閱。
        </p>
      </section>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {crisisStatus?.crisis_level === 'high' ? (
        <section
          className="rounded-md border border-red-300 bg-red-50 p-4 text-red-950"
          role="alert"
        >
          <h2 className="font-semibold">偵測到高風險語句</h2>
          <p className="mt-1 text-sm">
            系統回傳 crisis_level 為 high。請諮商師依專業流程立即審閱此輪內容。
          </p>
          {crisisStatus.reason ? (
            <p className="mt-2 text-sm">後端說明：{crisisStatus.reason}</p>
          ) : null}
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-[1fr_1fr]">
        <form
          className="space-y-3 rounded-md border bg-card p-4"
          onSubmit={handleCreateCase}
        >
          <div>
            <h2 className="font-semibold">建立個案代碼</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              請使用去識別化代碼，不輸入真實姓名。
            </p>
          </div>

          <label className="block text-sm font-medium">
            個案代碼
            <input
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              value={codeName}
              onChange={(event) => setCodeName(event.target.value)}
              placeholder="例如：A001"
            />
          </label>

          <label className="block text-sm font-medium">
            備註（選填）
            <textarea
              className="mt-1 min-h-20 w-full rounded-md border px-3 py-2 text-sm"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="僅記錄諮商師需要的非敏感備註"
            />
          </label>

          <button
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isCreatingCase}
            type="submit"
          >
            {isCreatingCase ? '建立中...' : '建立並開始會談'}
          </button>
        </form>

        <section className="space-y-3 rounded-md border bg-card p-4">
          <div>
            <h2 className="font-semibold">目前個案與會談</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              選擇個案會建立新的前端會談識別碼。
            </p>
          </div>

          <label className="block text-sm font-medium">
            選擇個案
            <select
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
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

          <div className="rounded-md bg-muted p-3 text-sm">
            <p>個案：{activeCase?.code_name ?? '尚未選擇'}</p>
            <p className="mt-1 break-all">session_id：{sessionId || '尚未建立'}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-md border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!activeCaseId}
              onClick={handleNewSession}
              type="button"
            >
              開始新會談
            </button>

            {reportUrl ? (
              <Link
                className="rounded-md border px-4 py-2 text-sm font-medium"
                to={reportUrl}
              >
                前往草稿報告
              </Link>
            ) : null}
          </div>
        </section>
      </section>

      <section className="space-y-4 rounded-md border bg-card p-4">
        <div>
          <h2 className="font-semibold">輸入本輪內容</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            請輸入由個案提供、諮商師代為整理的文字。送出後會呼叫後端 API
            產生回應與微摘要。
          </p>
        </div>

        <form className="space-y-3" onSubmit={handleSubmitTurn}>
          <textarea
            className="min-h-32 w-full rounded-md border px-3 py-2 text-sm"
            value={userInput}
            onChange={(event) => setUserInput(event.target.value)}
            placeholder="輸入本輪會談文字..."
          />

          <button
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!activeCaseId || !sessionId || isSubmitting}
            type="submit"
          >
            {isSubmitting ? '送出中...' : '送出本輪'}
          </button>
        </form>
      </section>

      {crisisStatus && crisisStatus.crisis_level !== 'high' ? (
        <section className="rounded-md border bg-card p-4">
          <h2 className="font-semibold">本輪風險狀態</h2>
          <p className="mt-2 text-sm">
            crisis_level：
            <span className="font-medium">{crisisStatus.crisis_level}</span>
          </p>
          {crisisStatus.reason ? (
            <p className="mt-1 text-sm text-muted-foreground">
              後端說明：{crisisStatus.reason}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-3 rounded-md border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">會談訊息</h2>
            {isLoadingSession ? (
              <span className="text-sm text-muted-foreground">載入中...</span>
            ) : null}
          </div>

          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚無訊息。</p>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => (
                <article className="rounded-md border p-3" key={message.id}>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>第 {message.turn_number} 輪</span>
                    <span>
                      {message.role === 'user' ? '輸入內容' : 'AI 回應草稿'}
                    </span>
                    <span>{formatDate(message.created_at)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                    {message.content}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-md border bg-card p-4">
          <h2 className="font-semibold">最新微摘要</h2>

          {!latestSummary ? (
            <p className="text-sm text-muted-foreground">尚無摘要。</p>
          ) : (
            <div className="space-y-3 text-sm">
              <p>第 {latestSummary.turn_number} 輪</p>
              <p>
                主要情緒：
                <span className="font-medium">
                  {latestSummary.summary?.emotion?.primary ?? '未提供'}
                </span>
              </p>
              <p>
                強度：
                <span className="font-medium">
                  {latestSummary.summary?.emotion?.intensity ?? '未提供'}
                </span>
              </p>
              <p>
                關鍵語句：
                <span className="text-muted-foreground">
                  {latestSummary.summary?.key_statement ?? '未提供'}
                </span>
              </p>
              {latestSummary.summary?.themes?.length ? (
                <div>
                  <p className="font-medium">主題</p>
                  <ul className="mt-1 list-inside list-disc text-muted-foreground">
                    {latestSummary.summary.themes.map((theme) => (
                      <li key={theme}>{theme}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </section>
      </section>
    </div>
  )
}
