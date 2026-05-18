from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database.db import init_db
from routers import cases, conversation, reports


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="AI 心理對話與個案概念化生成系統",
    description="後端 API — 諮商師專用",
    lifespan=lifespan,
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


app.include_router(conversation.router, prefix="/api", tags=["conversation"])
app.include_router(cases.router, prefix="/api", tags=["cases"])
app.include_router(reports.router, prefix="/api", tags=["reports"])
