# AI 心理對話與個案概念化生成系統

這是一個 AI 輔助心理對話與個案概念化報告草稿系統。
系統協助諮商師整理案主提供的內容、建立會談微摘要、保留危機提示 metadata，並能產生需由諮商師審閱的個案概念化報告草稿。

案主不是本系統的直接使用者。系統定位是諮商師的文件整理與概念化輔助工具，不是正式臨床產品，也不取代專業判斷。

## 重要安全聲明

- AI 輸出皆為草稿或輔助材料，必須由諮商師審閱。
- 系統不得診斷心理或精神疾病。
- 系統不得提供藥物、劑量、停藥、處方或醫療建議。
- 系統不得生成正式風險評估或正式安全計畫。
- 系統不得提供具體治療指令，亦不得取代諮商、心理治療、醫療或緊急服務。
- 解釋性內容應使用謹慎語氣，例如「可能」、「初步觀察」、「有待諮商師確認」。
- 展示與測試只應使用合成資料或完全去識別化資料，不得使用真實個案紀錄。

固定報告聲明由程式提供，不應交由 LLM 生成或改寫：

```text
本報告為 AI 草稿，僅供諮商師參考，非診斷文件。
所有判斷與決策須由專業諮商師負責審核。
```

## 目前功能

- 個案與會談管理：建立個案、建立/恢復會談、手動會談標題、封存/解除封存。
- 對話工作台：諮商師輸入案主提供內容，後端產生 AI 輔助回應並保存會談訊息。
- 微摘要整理：每輪產生情緒、強度、情緒面向、主題與關鍵陳述的結構化摘要。
- 危機提示 metadata：後端保留 `none`、`low`、`high` 的 `crisis_level`。前端紅色高風險提示只對 `high` 顯示。
- 高風險視覺提示：即時高風險回應會開啟高風險 modal。從歷史資料恢復時只顯示頁面提示，不重播 modal。
- ReportPage 審閱輔助：包含會談整理輔助、情緒強度趨勢、主題整理、微摘要時間線與 Recharts 情緒面向雷達圖。
- 個案概念化報告：使用者介面以 `個案概念化報告` 相關文案呈現。
- 報告手動資料：諮商師可輸入報告所需的手動資料，並由後端保存。
- AI 草稿產生：可產生後端保存的 AI 報告草稿，提供諮商師審閱。
- Provider mode：報告草稿可選擇 deterministic 預設模式，或明確啟用 Gemini/Groq provider mode。
- Report-only fallback：可選擇啟用報告草稿專用 fallback provider，只在 primary provider API failure 後嘗試。
- 列印友善檢視：`個案概念化報告` 可開啟乾淨的列印友善檢視，透過瀏覽器列印或另存 PDF。
- 儲存安全：瀏覽器 storage 不保存臨床內容、摘要、報告草稿、AI 生成 JSON、危機原因、標題或手動輸入。`localStorage` 僅保存主題偏好。

## 系統架構

- `frontend/`：React + Vite 前端，包含對話、報告、歷史與設定頁面。
- `backend/`：FastAPI 後端，提供 `/api` 路由與 `/health` 健康檢查。
- `backend/database/db.py`：SQLite + `aiosqlite` 資料層，使用 WAL mode。
- `backend/agents/`：四個主要 agent：
  - `crisis_agent.py`：危機語言偵測與保守 fallback。
  - `summary_agent.py`：每輪微摘要。
  - `conversation_agent.py`：AI 輔助對話回應。
  - `analysis_agent.py`：報告產生、目前報告草稿 workflow、provider mode 與 parser。
- `backend/routers/`：個案、會談、對話與報告 HTTP API。

詳細 API 與 UI contract 請參考 `backend/API_CONTRACT.md` 與 `frontend/UI_CONTRACT.md`。

## 技術棧

- Frontend：React、Vite、Vitest、React Testing Library、Recharts。
- Backend：Python、FastAPI、SQLite、pytest、Pydantic。
- LLM provider：Gemini 與 Groq，透過後端環境變數設定。

## 快速開始

### 後端

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# 請先依照檔案內的註解填入必要設定，例如 `GEMINI_API_KEY`、`DATABASE_PATH` 等，再啟動後端。
python -m uvicorn main:app --reload
```

預設 API 位址：`http://127.0.0.1:8000`

健康檢查：

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

### 前端

```powershell
cd frontend
npm install
npm run dev
```

預設 Vite 開發伺服器：`http://localhost:5173`

## 環境變數

後端設定從 `backend/.env.example` 開始。
請勿提交實際 `.env`，也不要把 API key、provider response、prompt 或臨床內容放入 commit、log、issue 或截圖。

主要設定類別：

- Groq：`GROQ_API_KEY`、`CRISIS_MODEL`、`SUMMARY_MODEL`，供危機偵測與微摘要使用。
- Gemini：`GEMINI_API_KEY`、`CONVERSATION_MODEL`、`ANALYSIS_MODEL`，供對話與分析使用。
- 報告草稿 provider：`REPORT_V2_PROVIDER_MODE=deterministic|provider`。
- 報告草稿 provider 選擇：`REPORT_V2_PROVIDER=gemini|groq`。
- 報告草稿專用 key override：`REPORT_V2_API_KEY` 可留空。若設定，只影響報告草稿 provider calls。
- 報告草稿 fallback：`REPORT_V2_FALLBACK_ENABLED=false` 預設關閉。啟用後只在 report provider mode 且 primary provider 發生 `provider_api_failure` 時嘗試。
- 其他設定：`DATABASE_PATH`、`MAX_CRISIS_INPUT_CHARS`、`CONVERSATION_WINDOW_SIZE`、`CONVERSATION_MAX_TOKENS`、`MIN_TURNS_FOR_REPORT`。

Provider 行為重點：

- 未設定或空白的 `REPORT_V2_PROVIDER_MODE` 預設為 `deterministic`，不呼叫 provider。
- `provider` mode 需明確設定 provider 並提供對應 key。
- `REPORT_V2_PROVIDER` 未設定時預設 Gemini。無效 provider 會 fail closed。
- Gemini model fallback：`REPORT_V2_MODEL` -> `gemini-2.5-flash`。
- Groq model fallback：`REPORT_V2_MODEL` -> `llama-3.3-70b-versatile`。
- Fallback 不是安全/schema bypass。invalid JSON、schema validation failure、unsafe evidence refs、missing summaries、provider config error、DB persistence failure 都不會觸發 fallback。

## 測試

自動化測試應保持 deterministic、network-free，並使用 mocked 或 monkeypatched LLM/provider 邊界。
不要把 live provider checks 放進 CI 或預設測試流程。

後端 deterministic pytest：

```powershell
python -m pytest backend\tests -q --basetemp=.tmp_pytest_backend -p no:cacheprovider
```

前端：

```powershell
cd frontend
npm run test
npm run build
```

Live provider smoke tests 只屬於手動、本機、明確啟用的驗證流程，且只能使用合成或去識別化資料。
報告草稿 provider mode 的手動流程請看 `docs/REPORT_V2_PROVIDER_SMOKE_TEST.md`。

## 報告與列印

目前使用者面向的報告 workflow 以 `個案概念化報告` 呈現。

目前已實作：

- 諮商師手動建立報告草稿與保存手動資料。
- 後端 deterministic 或 provider mode 產生 AI 草稿。
- `個案概念化報告預覽` 顯示報告草稿，AI 欄位標示需諮商師審閱。
- `列印友善檢視` 支援瀏覽器列印與另存 PDF。

尚未實作：

- reviewed status / mark as reviewed。
- 諮商師最終報告 workflow。
- 真正的一鍵或 server-side PDF export。

## 文件導覽

- `AGENTS.md`：Repository entry point、專案邊界、開發規則與目前實作現況。
- `docs/SAFETY_REQUIREMENTS.md`：詳細安全要求、危機處理與 prompt/agent 修改注意事項。
- `docs/IMPLEMENTATION_STATUS.md`：目前實作現況、已知限制與 future work。
- `backend/API_CONTRACT.md`：後端 HTTP API contract。
- `frontend/UI_CONTRACT.md`：前端頁面、state、storage 與 API 整合 contract。
- `backend/TESTING.md`：後端 deterministic pytest 策略與手動 provider check 邊界。
- `docs/DEMO_RUNBOOK.md`：課堂展示流程與合成資料 demo 指引。
- `docs/REPORT_SCHEMA_V2_PLAN.md`：目前報告 schema/workflow 的規劃與實作狀態。
- `docs/REPORT_V2_PROVIDER_SMOKE_TEST.md`：本機手動 Report provider mode smoke test。

## 已知限制與 Future Work

- reviewed status、mark as reviewed、諮商師最終報告流程仍待完成。
- 真正 PDF export 仍待完成；目前只有 browser print / save-as-PDF。
- 更多視覺化與 chart polish 可後續加入，但不得暗示診斷、正式量表或正式風險評估。
- title search/filter、richer session metadata、HistoryPage optional crisis-level display 仍是 future work。
- hard delete / session data-retention workflow 需要先有明確資料保留與隱私政策。
- production deployment/testing 與 production privacy hardening 尚未完成。
- MCP Task / case-query tooling 尚未實作。
- Runtime/provider status 若未來加入，必須 secret-safe，且不得在前端暴露 key 或 `.env`。

## 開發注意事項

- Prompt、provider、危機偵測、報告與 safety 相關修改都視為 safety-sensitive。
- 行為變更應搭配 deterministic tests。自動化測試不得呼叫 live providers。
- API/UI 行為變更後，同步更新 `backend/API_CONTRACT.md`、`frontend/UI_CONTRACT.md`、`docs/IMPLEMENTATION_STATUS.md` 等文件。
- 不要在瀏覽器 storage 保存臨床內容、摘要、報告、AI 生成 JSON、手動輸入、危機原因、標題或 session metadata。
- 不要持久化 raw prompts、raw provider responses、provider exception text、API keys 或 secrets。
- 不要提交 `.env`、`cases.db`、SQLite sidecar files、provider logs、截圖或包含敏感內容的輸出。
