# TODO: Task 02 - 實作 SQLite 連線與初始化
# 這個檔案將在 Task 02 填入完整實作

import os
from pathlib import Path


async def get_database_path() -> Path:
    """回傳 SQLite 檔案路徑（骨架）。"""
    path = os.getenv("DATABASE_PATH", "./cases.db")
    return Path(path).resolve()


async def init_db() -> None:
    """初始化資料庫連線與 schema（待實作）。"""
    raise NotImplementedError
