import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Clock, FolderOpen, Plus } from 'lucide-react'
import { listCases } from '../api/client.js'

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

export default function HistoryPage() {
  const [cases, setCases] = useState([])
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

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 pb-24">
      <section className="flex flex-col gap-3 rounded-md border border-slate-200/80 bg-white/65 p-5 shadow-[0_10px_35px_rgba(15,23,42,0.04)] backdrop-blur sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-teal-800">個案索引</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            歷史個案
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            檢視已建立的去識別化個案代碼與備註。此頁目前不提供刪除或會談瀏覽功能。
          </p>
        </div>

        <Link
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-[0_10px_22px_rgba(15,118,110,0.18)] transition hover:bg-teal-900"
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

      <section className="rounded-md border border-slate-200/80 bg-white/92 shadow-[0_14px_40px_rgba(15,23,42,0.06)] ring-1 ring-white/60">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-gradient-to-r from-white to-teal-50/55 px-4 py-3">
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
            <div className="rounded-md border border-dashed border-teal-200/70 bg-teal-50/45 p-5 text-sm">
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
                className="grid gap-4 p-4 transition hover:bg-teal-50/45 md:grid-cols-[1fr_1.2fr_auto]"
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
                  className="inline-flex items-center justify-start gap-2 text-sm font-medium text-teal-900 hover:underline md:justify-center"
                  to="/"
                >
                  開啟工作台
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  )
}
