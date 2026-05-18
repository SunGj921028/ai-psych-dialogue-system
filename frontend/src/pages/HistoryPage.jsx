import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">個案歷史</h1>
        <p className="text-sm text-muted-foreground">
          目前僅列出已建立的去識別化個案。會談瀏覽與刪除不在本階段實作範圍內。
        </p>
      </section>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="rounded-md border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">個案清單</h2>
          <Link className="rounded-md border px-4 py-2 text-sm font-medium" to="/">
            回到會談工作台
          </Link>
        </div>

        {isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">載入中...</p>
        ) : null}

        {!isLoading && cases.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            尚未建立個案。請回到會談工作台建立新的個案代碼。
          </p>
        ) : null}

        {cases.length > 0 ? (
          <div className="mt-4 space-y-3">
            {cases.map((caseItem) => (
              <article className="rounded-md border p-3" key={caseItem.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium">{caseItem.code_name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      建立時間：{formatDate(caseItem.created_at)}
                    </p>
                  </div>
                  <Link className="text-sm font-medium underline" to="/">
                    前往會談工作台
                  </Link>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  備註：{caseItem.note || '未提供'}
                </p>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  )
}
