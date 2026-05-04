# AI 心理對話與個案概念化生成系統

輔助心理諮商師的 AI 工具：即時對話支援、JSON 微摘要與一鍵個案概念化報告（案主不直接使用本系統）。

## 環境需求

- **Python** 3.11 或以上（建議 3.12）
- **Node.js** 20 或以上（建議 LTS）

## 啟動方式

**後端（FastAPI）：**

```bash
cd backend && uvicorn main:app --reload
```

預設 API：`http://127.0.0.1:8000`（健康檢查：`GET /health`）

**前端（Vite + React）：**

```bash
cd frontend && npm run dev
```

預設開發伺服器：`http://localhost:5173`

## 環境變數（後端）

1. 複製 `backend/.env.example` 為 `backend/.env`
2. 填入 `LLM_API_KEY` 與其他必要欄位

請勿將 `.env` 提交至版本庫（已列於 `backend/.gitignore`）。

## 切換 LLM 提供商

程式不需修改，只要調整 `backend/.env`：

| 用法 | 範例 `LLM_BASE_URL` |
|------|---------------------|
| OpenAI 相容 API（預設） | `https://api.openai.com/v1` |
| Anthropic（若你的 SDK/閘道相容 OpenAI 介面） | `https://api.anthropic.com/v1` |
| 本機 Ollama | `http://localhost:11434/v1` |

依提供商設定 `LLM_MODEL` 與 `LLM_API_KEY` 即可。

## shadcn/ui 元件

專案已具備 `components.json` 與 Tailwind 變數，之後可在 `frontend` 目錄執行：

```bash
npx shadcn@latest add button
```

（依 CLI 提示選擇既有設定即可。）
