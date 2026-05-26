import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Archive,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  FolderOpen,
  Pencil,
  Plus,
  RotateCcw,
} from 'lucide-react'
import {
  archiveSession,
  listCaseSessions,
  listCases,
  unarchiveSession,
  updateSessionTitle,
} from '../api/client.js'

const UNTITLED_SESSION_LABEL = '未命名會談'
const MAX_SESSION_TITLE_LENGTH = 80
const TITLE_PRIVACY_HELPER = '請避免輸入可識別個資或敏感臨床內容'
const TITLE_LENGTH_ERROR = '標題最多 80 個字'
const TITLE_SAVE_ERROR = '無法更新會談標題，請稍後再試。'
const ARCHIVE_CONFIRM_MESSAGE = '確認封存此會談？'
const ARCHIVE_SAVE_ERROR = '封存狀態更新失敗，請稍後再試。'

function getFriendlyError(error) {
  if (!error?.response) {
    return '無法連線到後端服務，請確認本機 API 是否已啟動。'
  }

  return '無法載入個案清單，請稍後再試。'
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

function getSessionDisplayTitle(session) {
  return session.title?.trim() || UNTITLED_SESSION_LABEL
}

function getNormalizedTitle(title) {
  return title?.trim() || ''
}

function getEditKey(caseId, sessionId) {
  return `${caseId}::${sessionId}`
}

export default function HistoryPage() {
  const [cases, setCases] = useState([])
  const [expandedCaseIds, setExpandedCaseIds] = useState(() => new Set())
  const [sessionsByCaseId, setSessionsByCaseId] = useState({})
  const [loadingSessionsByCaseId, setLoadingSessionsByCaseId] = useState({})
  const [sessionErrorsByCaseId, setSessionErrorsByCaseId] = useState({})
  const [showArchivedByCaseId, setShowArchivedByCaseId] = useState({})
  const [editingSessionKey, setEditingSessionKey] = useState('')
  const [titleDraft, setTitleDraft] = useState('')
  const [titleValidationError, setTitleValidationError] = useState('')
  const [titleSaveError, setTitleSaveError] = useState('')
  const [archiveErrorsBySessionKey, setArchiveErrorsBySessionKey] = useState({})
  const [archivingSessionKey, setArchivingSessionKey] = useState('')
  const [savingSessionKey, setSavingSessionKey] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadCases() {
      setIsLoading(true)
      setError('')

      try {
        const data = await listCases()
        setCases(data)
      } catch (loadError) {
        setError(getFriendlyError(loadError))
      } finally {
        setIsLoading(false)
      }
    }

    loadCases()
  }, [])

  async function loadSessions(caseItem, includeArchived = false) {
    setLoadingSessionsByCaseId((current) => ({
      ...current,
      [caseItem.id]: true,
    }))
    setSessionErrorsByCaseId((current) => ({
      ...current,
      [caseItem.id]: '',
    }))

    try {
      const sessions = includeArchived
        ? await listCaseSessions(caseItem.id, { includeArchived: true })
        : await listCaseSessions(caseItem.id)
      setSessionsByCaseId((current) => ({
        ...current,
        [caseItem.id]: sessions,
      }))
    } catch (sessionError) {
      setSessionErrorsByCaseId((current) => ({
        ...current,
        [caseItem.id]: getFriendlyError(sessionError),
      }))
    } finally {
      setLoadingSessionsByCaseId((current) => ({
        ...current,
        [caseItem.id]: false,
      }))
    }
  }

  async function handleToggleSessions(caseItem) {
    const isExpanded = expandedCaseIds.has(caseItem.id)
    const nextExpandedCaseIds = new Set(expandedCaseIds)

    if (isExpanded) {
      nextExpandedCaseIds.delete(caseItem.id)
      setExpandedCaseIds(nextExpandedCaseIds)
      return
    }

    nextExpandedCaseIds.add(caseItem.id)
    setExpandedCaseIds(nextExpandedCaseIds)

    if (sessionsByCaseId[caseItem.id]) return

    await loadSessions(caseItem, showArchivedByCaseId[caseItem.id] === true)
  }

  async function handleToggleShowArchived(caseItem) {
    const includeArchived = showArchivedByCaseId[caseItem.id] !== true
    setShowArchivedByCaseId((current) => ({
      ...current,
      [caseItem.id]: includeArchived,
    }))
    await loadSessions(caseItem, includeArchived)
  }

  function handleStartEdit(caseItem, session) {
    setEditingSessionKey(getEditKey(caseItem.id, session.session_id))
    setTitleDraft(getNormalizedTitle(session.title))
    setTitleValidationError('')
    setTitleSaveError('')
  }

  function handleCancelEdit() {
    setEditingSessionKey('')
    setTitleDraft('')
    setTitleValidationError('')
    setTitleSaveError('')
  }

  function replaceSession(caseId, updatedSession) {
    setSessionsByCaseId((current) => ({
      ...current,
      [caseId]: (current[caseId] ?? []).map((session) =>
        session.session_id === updatedSession.session_id
          ? { ...session, ...updatedSession }
          : session,
      ),
    }))
  }

  function removeSession(caseId, sessionId) {
    setSessionsByCaseId((current) => ({
      ...current,
      [caseId]: (current[caseId] ?? []).filter(
        (session) => session.session_id !== sessionId,
      ),
    }))
  }

  function clearArchiveError(caseId, sessionId) {
    const editKey = getEditKey(caseId, sessionId)
    setArchiveErrorsBySessionKey((current) => ({
      ...current,
      [editKey]: '',
    }))
  }

  async function handleArchiveSession(caseItem, session) {
    if (!window.confirm(ARCHIVE_CONFIRM_MESSAGE)) {
      return
    }

    const editKey = getEditKey(caseItem.id, session.session_id)
    setArchivingSessionKey(editKey)
    clearArchiveError(caseItem.id, session.session_id)

    try {
      const updatedSession = await archiveSession(caseItem.id, session.session_id)
      if (showArchivedByCaseId[caseItem.id]) {
        replaceSession(caseItem.id, updatedSession)
      } else {
        removeSession(caseItem.id, session.session_id)
      }
    } catch {
      setArchiveErrorsBySessionKey((current) => ({
        ...current,
        [editKey]: ARCHIVE_SAVE_ERROR,
      }))
    } finally {
      setArchivingSessionKey('')
    }
  }

  async function handleUnarchiveSession(caseItem, session) {
    const editKey = getEditKey(caseItem.id, session.session_id)
    setArchivingSessionKey(editKey)
    clearArchiveError(caseItem.id, session.session_id)

    try {
      const updatedSession = await unarchiveSession(caseItem.id, session.session_id)
      replaceSession(caseItem.id, updatedSession)
    } catch {
      setArchiveErrorsBySessionKey((current) => ({
        ...current,
        [editKey]: ARCHIVE_SAVE_ERROR,
      }))
    } finally {
      setArchivingSessionKey('')
    }
  }

  async function handleSaveTitle(caseItem, session) {
    if (titleDraft.length > MAX_SESSION_TITLE_LENGTH) {
      setTitleValidationError(TITLE_LENGTH_ERROR)
      return
    }

    const trimmedTitle = titleDraft.trim()
    if (!trimmedTitle || trimmedTitle === getNormalizedTitle(session.title)) {
      return
    }

    const editKey = getEditKey(caseItem.id, session.session_id)
    setSavingSessionKey(editKey)
    setTitleValidationError('')
    setTitleSaveError('')

    try {
      const updatedSession = await updateSessionTitle(
        caseItem.id,
        session.session_id,
        { title: trimmedTitle },
      )
      replaceSession(caseItem.id, updatedSession)
      handleCancelEdit()
    } catch {
      setTitleSaveError(TITLE_SAVE_ERROR)
    } finally {
      setSavingSessionKey('')
    }
  }

  async function handleClearTitle(caseItem, session) {
    const editKey = getEditKey(caseItem.id, session.session_id)
    setSavingSessionKey(editKey)
    setTitleValidationError('')
    setTitleSaveError('')

    try {
      const updatedSession = await updateSessionTitle(
        caseItem.id,
        session.session_id,
        { title: null },
      )
      replaceSession(caseItem.id, updatedSession)
      handleCancelEdit()
    } catch {
      setTitleSaveError(TITLE_SAVE_ERROR)
    } finally {
      setSavingSessionKey('')
    }
  }

  function handleTitleKeyDown(event, caseItem, session) {
    if (event.key === 'Escape') {
      event.preventDefault()
      handleCancelEdit()
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      handleSaveTitle(caseItem, session)
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 pb-24">
      <section className="flex flex-col gap-3 rounded-md border border-slate-200/80 bg-white/65 p-5 shadow-[0_10px_35px_rgba(15,23,42,0.04)] backdrop-blur dark:border-slate-700 dark:bg-card dark:shadow-[0_10px_35px_rgba(0,0,0,0.24)] sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-indigo-800 dark:text-indigo-300">個案索引</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            歷史個案
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            檢視已建立的去識別化個案代碼與備註。此頁目前不提供刪除或會談瀏覽功能。
          </p>
        </div>

        <Link
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-[0_10px_22px_rgba(30,41,59,0.16)] transition hover:bg-indigo-900 dark:hover:bg-indigo-600"
          to="/"
        >
          <Plus className="h-4 w-4" />
          回工作台建立個案
        </Link>
      </section>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="rounded-md border border-slate-200/80 bg-white/92 shadow-[0_14px_40px_rgba(15,23,42,0.06)] ring-1 ring-white/60 dark:border-slate-700 dark:bg-card dark:shadow-[0_14px_40px_rgba(0,0,0,0.28)] dark:ring-slate-700/50">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-gradient-to-r from-white to-indigo-50/55 px-4 py-3 dark:border-slate-800 dark:from-slate-900 dark:to-indigo-950/18">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <FolderOpen className="h-4 w-4" />
              個案清單
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              共 {cases.length} 筆個案
            </p>
          </div>
          {isLoading ? (
            <span className="text-sm text-muted-foreground">載入中...</span>
          ) : null}
        </div>

        {!isLoading && cases.length === 0 ? (
          <div className="p-4">
            <div className="rounded-md border border-dashed border-indigo-200/70 bg-indigo-50/45 p-5 text-sm dark:border-indigo-700/60 dark:bg-indigo-950/32">
              <p className="font-medium">尚未建立個案</p>
              <p className="mt-1 leading-6 text-muted-foreground">
                請回到會談工作台建立第一個去識別化個案代碼。
              </p>
            </div>
          </div>
        ) : null}

        {cases.length > 0 ? (
          <div className="divide-y">
            {cases.map((caseItem) => (
              <article
                className="grid gap-4 p-4 transition hover:bg-slate-50 dark:hover:bg-slate-800/70 md:grid-cols-[1fr_1.2fr_auto]"
                key={caseItem.id}
              >
                <div>
                  <h3 className="font-semibold">{caseItem.code_name}</h3>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    建立於 {formatDate(caseItem.created_at)}
                  </p>
                </div>

                <p className="text-sm leading-6 text-muted-foreground">
                  {caseItem.note || '未提供備註'}
                </p>

                <Link
                  className="inline-flex items-center justify-start gap-2 text-sm font-medium text-indigo-900 hover:underline dark:text-indigo-200 md:justify-center"
                  to="/"
                >
                  開啟工作台
                  <ArrowRight className="h-4 w-4" />
                </Link>

                <button
                  aria-label={`${expandedCaseIds.has(caseItem.id) ? 'Hide' : 'Show'} sessions for ${caseItem.code_name}`}
                  className="inline-flex items-center justify-start gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium transition hover:bg-slate-100 dark:border-input dark:bg-card dark:hover:bg-slate-800 md:justify-center"
                  onClick={() => handleToggleSessions(caseItem)}
                  type="button"
                >
                  {expandedCaseIds.has(caseItem.id) ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                  Sessions
                </button>

                {expandedCaseIds.has(caseItem.id) ? (
                  <div className="md:col-span-3">
                    <label className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
                      <input
                        checked={showArchivedByCaseId[caseItem.id] === true}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-700 focus:ring-indigo-500"
                        onChange={() => handleToggleShowArchived(caseItem)}
                        type="checkbox"
                      />
                      顯示已封存會談
                    </label>
                    {sessionErrorsByCaseId[caseItem.id] ? (
                      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        {sessionErrorsByCaseId[caseItem.id]}
                      </div>
                    ) : null}
                    {loadingSessionsByCaseId[caseItem.id] ? (
                      <p className="text-sm text-muted-foreground">é ›ï£ï…¯éŠ?..</p>
                    ) : null}
                    {!loadingSessionsByCaseId[caseItem.id] &&
                    !sessionErrorsByCaseId[caseItem.id] &&
                    (sessionsByCaseId[caseItem.id] ?? []).length === 0 ? (
                      <div className="rounded-md border border-dashed border-slate-200 bg-white/70 p-4 text-sm text-muted-foreground dark:border-slate-700 dark:bg-slate-900/70">
                        No persisted sessions yet.
                      </div>
                    ) : null}
                    {(sessionsByCaseId[caseItem.id] ?? []).length > 0 ? (
                      <div className="grid gap-3">
                        {(sessionsByCaseId[caseItem.id] ?? []).map((session) => (
                          <section
                            className="rounded-md border border-slate-200 bg-white/80 p-4 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900/80"
                            key={session.session_id}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                {editingSessionKey ===
                                getEditKey(caseItem.id, session.session_id) ? (
                                  <div className="flex max-w-xl flex-col gap-2">
                                    <label
                                      className="text-xs font-medium text-muted-foreground"
                                      htmlFor={`session-title-${caseItem.id}-${session.session_id}`}
                                    >
                                      Session title
                                    </label>
                                    <input
                                      aria-describedby={`session-title-help-${caseItem.id}-${session.session_id}`}
                                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                                      id={`session-title-${caseItem.id}-${session.session_id}`}
                                      maxLength={MAX_SESSION_TITLE_LENGTH}
                                      onChange={(event) => {
                                        setTitleDraft(event.target.value)
                                        setTitleValidationError('')
                                        setTitleSaveError('')
                                      }}
                                      onKeyDown={(event) =>
                                        handleTitleKeyDown(
                                          event,
                                          caseItem,
                                          session,
                                        )
                                      }
                                      type="text"
                                      value={titleDraft}
                                    />
                                    <p
                                      className="text-xs text-muted-foreground"
                                      id={`session-title-help-${caseItem.id}-${session.session_id}`}
                                    >
                                      {TITLE_PRIVACY_HELPER}
                                    </p>
                                    {titleValidationError ? (
                                      <p className="text-xs text-destructive">
                                        {titleValidationError}
                                      </p>
                                    ) : null}
                                    {titleSaveError ? (
                                      <p className="text-xs text-destructive">
                                        {titleSaveError}
                                      </p>
                                    ) : null}
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-indigo-900 disabled:cursor-not-allowed disabled:opacity-55 dark:hover:bg-indigo-600"
                                        disabled={
                                          savingSessionKey ===
                                            getEditKey(
                                              caseItem.id,
                                              session.session_id,
                                            ) ||
                                          !titleDraft.trim() ||
                                          titleDraft.trim() ===
                                            getNormalizedTitle(session.title)
                                        }
                                        onClick={() =>
                                          handleSaveTitle(caseItem, session)
                                        }
                                        type="button"
                                      >
                                        Save
                                      </button>
                                      <button
                                        className="inline-flex items-center justify-center rounded-md border bg-white px-3 py-2 text-sm font-medium transition hover:bg-slate-100 dark:border-input dark:bg-card dark:hover:bg-slate-800"
                                        disabled={
                                          savingSessionKey ===
                                          getEditKey(
                                            caseItem.id,
                                            session.session_id,
                                          )
                                        }
                                        onClick={handleCancelEdit}
                                        type="button"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium transition hover:bg-slate-100 dark:border-input dark:bg-card dark:hover:bg-slate-800"
                                        disabled={
                                          savingSessionKey ===
                                          getEditKey(
                                            caseItem.id,
                                            session.session_id,
                                          )
                                        }
                                        onClick={() =>
                                          handleClearTitle(caseItem, session)
                                        }
                                        type="button"
                                      >
                                        Clear title
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-start gap-2">
                                    <p className="break-words font-semibold">
                                      {getSessionDisplayTitle(session)}
                                    </p>
                                    {session.archived_at ? (
                                      <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                                        已封存
                                      </span>
                                    ) : null}
                                    <button
                                      aria-label={`Edit title for ${session.session_id}`}
                                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-white text-muted-foreground transition hover:bg-slate-100 hover:text-foreground dark:border-input dark:bg-card dark:hover:bg-slate-800"
                                      onClick={() =>
                                        handleStartEdit(caseItem, session)
                                      }
                                      type="button"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                )}
                                <p className="mt-1 font-mono text-xs text-muted-foreground">
                                  {session.session_id}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {formatDate(session.last_updated)}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                <span>messages: {session.message_count}</span>
                                <span>summaries: {session.summary_count}</span>
                                <span>last turn: {session.last_turn_number}</span>
                                {session.has_crisis ? (
                                  <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-950 dark:border-amber-500/45 dark:bg-amber-950/50 dark:text-amber-100">
                                    crisis metadata
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            {session.latest_summary_preview ? (
                              <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm leading-6 text-muted-foreground dark:bg-slate-800/75">
                                {session.latest_summary_preview}
                              </p>
                            ) : null}

                            <div className="mt-3 flex flex-wrap gap-2">
                              {archiveErrorsBySessionKey[
                                getEditKey(caseItem.id, session.session_id)
                              ] ? (
                                <p className="basis-full text-xs text-destructive">
                                  {
                                    archiveErrorsBySessionKey[
                                      getEditKey(caseItem.id, session.session_id)
                                    ]
                                  }
                                </p>
                              ) : null}
                              <Link
                                className="inline-flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50/70 px-3 py-2 text-sm font-medium text-indigo-950 transition hover:bg-indigo-100 dark:border-indigo-700/60 dark:bg-indigo-950/32 dark:text-indigo-100 dark:hover:bg-indigo-900/45"
                                to={`/?caseId=${encodeURIComponent(caseItem.id)}&sessionId=${encodeURIComponent(session.session_id)}`}
                              >
                                <ArrowRight className="h-4 w-4" />
                                Resume conversation
                              </Link>
                              <Link
                                className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium transition hover:bg-slate-100 dark:border-input dark:bg-card dark:hover:bg-slate-800"
                                to={`/report/${caseItem.id}?sessionId=${encodeURIComponent(session.session_id)}`}
                              >
                                <FileText className="h-4 w-4" />
                                Open report
                              </Link>
                              {session.archived_at ? (
                                <button
                                  className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-55 dark:border-input dark:bg-card dark:hover:bg-slate-800"
                                  disabled={
                                    archivingSessionKey ===
                                    getEditKey(caseItem.id, session.session_id)
                                  }
                                  onClick={() =>
                                    handleUnarchiveSession(caseItem, session)
                                  }
                                  type="button"
                                >
                                  <RotateCcw className="h-4 w-4" />
                                  取消封存
                                </button>
                              ) : (
                                <button
                                  className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-55 dark:border-input dark:bg-card dark:hover:bg-slate-800"
                                  disabled={
                                    archivingSessionKey ===
                                    getEditKey(caseItem.id, session.session_id)
                                  }
                                  onClick={() =>
                                    handleArchiveSession(caseItem, session)
                                  }
                                  type="button"
                                >
                                  <Archive className="h-4 w-4" />
                                  封存
                                </button>
                              )}
                            </div>
                          </section>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  )
}
