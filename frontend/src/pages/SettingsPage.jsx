import {
  Database,
  Eye,
  LockKeyhole,
  MonitorCog,
  ShieldCheck,
} from 'lucide-react'

const sections = [
  {
    title: '系統用途',
    icon: Eye,
    description:
      '本系統提供諮商文件整理與個案概念化草稿輔助。AI 輸出僅供諮商師審閱參考，諮商師仍是最終審閱者與決策者。',
    items: [
      '用於整理個案提供內容、微摘要與報告草稿脈絡。',
      '所有輸出都需要由諮商師確認後才可使用。',
      '系統不取代專業晤談、臨床判斷或個案照護責任。',
    ],
  },
  {
    title: '安全邊界',
    icon: ShieldCheck,
    description:
      '本系統不是診斷工具、不是正式治療計畫產生器，也不是緊急服務的替代方案。',
    items: [
      '不提供診斷，也不確認個案是否具有特定疾患。',
      '不是正式治療計畫，不給出具體治療指令。',
      '不提供藥物或劑量建議，也不建議停藥或調藥。',
      '危機提示由後端結果驅動；前端不重新判斷或提高危機嚴重度。',
      '高風險 UI 只會在後端 crisis_level === "high" 時顯示。',
    ],
  },
  {
    title: '隱私與瀏覽器儲存',
    icon: LockKeyhole,
    description:
      '瀏覽器只保存必要的操作偏好與目前識別碼，不保存臨床內容或供應商機密。',
    items: [
      'localStorage 只用於 ai-psych-theme。',
      'sessionStorage 只用於目前個案與會談識別碼。',
      '不會儲存會談文字、微摘要、報告內容、危機原因、個案備註、會談標題、草稿、預覽、session metadata 或 provider keys。',
      '耐久會談資料由後端保存安全的操作 metadata。',
      '報告草稿目前不持久化，離開或重新整理後需要重新產生。',
    ],
  },
  {
    title: '外觀偏好',
    icon: MonitorCog,
    description:
      '深色與淺色模式由頁首按鈕控制；本頁只說明目前偏好，不提供第二個切換控制。',
    items: [
      '主題偏好只保存為 ai-psych-theme。',
      '此外觀偏好不包含任何個案、會談、摘要或報告內容。',
    ],
  },
  {
    title: '模型與服務設定',
    icon: Database,
    description:
      '模型供應商、模型版本與 API keys 由後端環境設定管理，不會在瀏覽器顯示或儲存。',
    items: [
      '本頁不提供 API key 欄位。',
      '本頁不顯示 .env 值、provider secret 或後端金鑰。',
      '模型與服務狀態若未來需要呈現，應由安全的後端端點提供非機密資訊。',
    ],
  },
]

function InfoSection({ description, icon: Icon, items, title }) {
  return (
    <section className="rounded-md border border-slate-200/80 bg-white/92 p-5 shadow-[0_14px_40px_rgba(15,23,42,0.06)] ring-1 ring-white/60 dark:border-slate-700 dark:bg-card dark:shadow-[0_14px_40px_rgba(0,0,0,0.28)] dark:ring-slate-700/50">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-indigo-100 bg-indigo-50 text-indigo-900 dark:border-indigo-700/60 dark:bg-indigo-950/32 dark:text-indigo-100">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-950 dark:text-slate-50">
            {title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-2 text-sm leading-6 text-muted-foreground">
        {items.map((item) => (
          <li className="flex gap-2" key={item}>
            <span
              aria-hidden="true"
              className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-600 dark:bg-indigo-300"
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 pb-24">
      <section className="rounded-md border border-slate-200/80 bg-white/65 p-5 shadow-[0_10px_35px_rgba(15,23,42,0.04)] backdrop-blur dark:border-slate-700 dark:bg-card dark:shadow-[0_10px_35px_rgba(0,0,0,0.24)]">
        <p className="text-xs font-semibold text-indigo-800 dark:text-indigo-300">
          諮商師使用說明
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          設定與安全說明
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          本頁整理目前系統的使用邊界、隱私儲存規則與非機密設定說明。這些資訊用於協助諮商師理解系統限制，不提供任何臨床診斷或治療決策。
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {sections.map((section) => (
          <InfoSection key={section.title} {...section} />
        ))}
      </div>

      <section className="rounded-md border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-950 shadow-[0_10px_26px_rgba(146,64,14,0.08)] dark:border-amber-500/35 dark:bg-amber-950/55 dark:text-amber-100 dark:shadow-[0_10px_26px_rgba(0,0,0,0.24)]">
        <h2 className="font-semibold">審閱提醒</h2>
        <p className="mt-2 leading-6">
          AI 產生內容皆為草稿與參考材料，所有判斷、紀錄採用與後續處置都需要由諮商師依專業脈絡審閱。
        </p>
      </section>
    </div>
  )
}
