// TODO: Task 13 - 實作個案報告頁
// 這個檔案將在 Task 13 填入完整實作

import { useParams } from 'react-router-dom'

export default function ReportPage() {
  const { caseId } = useParams()

  return (
    <div className="mx-auto max-w-5xl p-4">
      <h1 className="text-xl font-semibold">個案報告</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        caseId: {caseId ?? '—'} — Task 13 實作報告檢視與匯出。
      </p>
    </div>
  )
}
