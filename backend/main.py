from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="AI 心理對話與個案概念化生成系統",
    description="後端 API — 諮商師專用",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


# --- Router 掛載（Task 09 啟用）---
# from routers import conversation, cases, reports
# app.include_router(conversation.router, prefix="/api", tags=["conversation"])
# app.include_router(cases.router, prefix="/api", tags=["cases"])
# app.include_router(reports.router, prefix="/api", tags=["reports"])
