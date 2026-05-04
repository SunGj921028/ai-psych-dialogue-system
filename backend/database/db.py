"""SQLite 資料層：連線、schema 與 CRUD。"""

from __future__ import annotations

import json
import os
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

import aiosqlite
from dotenv import load_dotenv

load_dotenv()

SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cases (
    id TEXT PRIMARY KEY,
    code_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    note TEXT
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    round INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    CHECK (role IN ('user', 'assistant')),
    FOREIGN KEY (case_id) REFERENCES cases (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS summaries (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    round INTEGER NOT NULL,
    summary_json TEXT NOT NULL,
    crisis_flag INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (case_id) REFERENCES cases (id) ON DELETE CASCADE
);
"""


def _database_path() -> str:
    raw = os.getenv("DATABASE_PATH", "./cases.db")
    return str(Path(raw).resolve())


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _row_to_dict(row: aiosqlite.Row) -> dict:
    return {k: row[k] for k in row.keys()}


@asynccontextmanager
async def get_db() -> AsyncIterator[aiosqlite.Connection]:
    """非同步 context manager：``async with get_db() as db:`` 取得連線並於結束時關閉。"""
    async with aiosqlite.connect(_database_path()) as db:
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA foreign_keys = ON")
        yield db


async def init_db() -> None:
    """建立三張資料表（若不存在）。"""
    async with get_db() as db:
        await db.executescript(SCHEMA)
        await db.commit()


async def create_case(code_name: str, note: str | None = None) -> dict:
    case_id = str(uuid.uuid4())
    created_at = _now_iso()
    async with get_db() as db:
        await db.execute(
            """
            INSERT INTO cases (id, code_name, created_at, note)
            VALUES (?, ?, ?, ?)
            """,
            (case_id, code_name, created_at, note),
        )
        await db.commit()
        cur = await db.execute("SELECT * FROM cases WHERE id = ?", (case_id,))
        row = await cur.fetchone()
    assert row is not None
    return _row_to_dict(row)


async def get_case(case_id: str) -> dict | None:
    async with get_db() as db:
        cur = await db.execute("SELECT * FROM cases WHERE id = ?", (case_id,))
        row = await cur.fetchone()
    return _row_to_dict(row) if row else None


async def get_all_cases() -> list[dict]:
    async with get_db() as db:
        cur = await db.execute("SELECT * FROM cases ORDER BY created_at DESC")
        rows = await cur.fetchall()
    return [_row_to_dict(r) for r in rows]


async def delete_case(case_id: str) -> bool:
    async with get_db() as db:
        await db.execute("DELETE FROM cases WHERE id = ?", (case_id,))
        cur = await db.execute("SELECT changes() AS n")
        row = await cur.fetchone()
        deleted = int(row["n"]) if row else 0
        await db.commit()
    return deleted > 0


async def add_message(
    case_id: str,
    session_id: str,
    round: int,
    role: str,
    content: str,
) -> dict:
    if role not in ("user", "assistant"):
        raise ValueError('role 必須為 "user" 或 "assistant"')

    msg_id = str(uuid.uuid4())
    created_at = _now_iso()
    async with get_db() as db:
        await db.execute(
            """
            INSERT INTO messages (id, case_id, session_id, round, role, content, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (msg_id, case_id, session_id, round, role, content, created_at),
        )
        await db.commit()
        cur = await db.execute("SELECT * FROM messages WHERE id = ?", (msg_id,))
        row = await cur.fetchone()
    assert row is not None
    return _row_to_dict(row)


async def get_messages_by_session(case_id: str, session_id: str) -> list[dict]:
    async with get_db() as db:
        cur = await db.execute(
            """
            SELECT * FROM messages
            WHERE case_id = ? AND session_id = ?
            ORDER BY round ASC
            """,
            (case_id, session_id),
        )
        rows = await cur.fetchall()
    return [_row_to_dict(r) for r in rows]


async def get_all_sessions(case_id: str) -> list[str]:
    """回傳不重複的 session_id，依各 session 最後活動時間降冪排列。"""
    async with get_db() as db:
        cur = await db.execute(
            """
            WITH sess_times AS (
                SELECT session_id, created_at AS t FROM messages WHERE case_id = ?
                UNION ALL
                SELECT session_id, created_at AS t FROM summaries WHERE case_id = ?
            )
            SELECT session_id
            FROM sess_times
            GROUP BY session_id
            ORDER BY MAX(t) DESC
            """,
            (case_id, case_id),
        )
        rows = await cur.fetchall()
    return [r["session_id"] for r in rows]


async def add_summary(
    case_id: str,
    session_id: str,
    round: int,
    summary_json: str,
    crisis_flag: bool,
) -> dict:
    try:
        json.loads(summary_json)
    except json.JSONDecodeError as exc:
        raise ValueError("summary_json 必須是合法的 JSON 字串") from exc

    summary_id = str(uuid.uuid4())
    created_at = _now_iso()
    flag = 1 if crisis_flag else 0
    async with get_db() as db:
        await db.execute(
            """
            INSERT INTO summaries (
                id, case_id, session_id, round, summary_json, crisis_flag, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                summary_id,
                case_id,
                session_id,
                round,
                summary_json,
                flag,
                created_at,
            ),
        )
        await db.commit()
        cur = await db.execute("SELECT * FROM summaries WHERE id = ?", (summary_id,))
        row = await cur.fetchone()
    assert row is not None
    return _parse_summary_row(row)


def _parse_summary_row(row: aiosqlite.Row) -> dict:
    d = _row_to_dict(row)
    d["summary_json"] = json.loads(d["summary_json"])
    return d


async def get_summaries_by_session(case_id: str, session_id: str) -> list[dict]:
    async with get_db() as db:
        cur = await db.execute(
            """
            SELECT * FROM summaries
            WHERE case_id = ? AND session_id = ?
            ORDER BY round ASC
            """,
            (case_id, session_id),
        )
        rows = await cur.fetchall()
    return [_parse_summary_row(r) for r in rows]


async def get_latest_summaries(case_id: str, limit: int = 10) -> list[dict]:
    async with get_db() as db:
        cur = await db.execute(
            """
            SELECT * FROM summaries
            WHERE case_id = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (case_id, limit),
        )
        rows = await cur.fetchall()
    return [_parse_summary_row(r) for r in rows]


async def has_crisis_in_session(case_id: str, session_id: str) -> bool:
    async with get_db() as db:
        cur = await db.execute(
            """
            SELECT 1 FROM summaries
            WHERE case_id = ? AND session_id = ? AND crisis_flag = 1
            LIMIT 1
            """,
            (case_id, session_id),
        )
        row = await cur.fetchone()
    return row is not None
