"""SQLite 資料層：連線、schema 與 CRUD。"""

from __future__ import annotations

import json
import os
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

import aiosqlite
from dotenv import load_dotenv

load_dotenv()

SCHEMA = """
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

CREATE TABLE IF NOT EXISTS sessions (
    case_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_activity_at TEXT,
    title TEXT,
    PRIMARY KEY (case_id, session_id),
    FOREIGN KEY (case_id) REFERENCES cases (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_case_session_round
    ON messages (case_id, session_id, round);

CREATE INDEX IF NOT EXISTS idx_summaries_case_session_round
    ON summaries (case_id, session_id, round);

CREATE INDEX IF NOT EXISTS idx_summaries_case_created_at
    ON summaries (case_id, created_at);

CREATE INDEX IF NOT EXISTS idx_summaries_case_session_crisis_flag
    ON summaries (case_id, session_id, crisis_flag);

CREATE INDEX IF NOT EXISTS idx_sessions_case_updated_at
    ON sessions (case_id, updated_at);
"""


# Single source of truth for busy/lock timeout (milliseconds).
# aiosqlite.connect() receives the equivalent in seconds.
_BUSY_TIMEOUT_MS: int = 30_000  # 30 s
_SESSION_TITLE_MAX_LENGTH: int = 80


def _database_path() -> str:
    raw = os.getenv("DATABASE_PATH", "./cases.db")
    raw_path = Path(raw)
    if raw_path.is_absolute():
        return str(raw_path.resolve())

    backend_dir = Path(__file__).resolve().parents[1]
    return str((backend_dir / raw_path).resolve())


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_dict(row: aiosqlite.Row) -> dict:
    return {k: row[k] for k in row.keys()}


def _message_row_to_dict(row: aiosqlite.Row) -> dict:
    d = _row_to_dict(row)
    if "round" in d:
        d["turn_number"] = d.pop("round")
    return d


def normalize_session_title(title: str | None) -> str | None:
    if title is None:
        return None

    normalized = title.strip()
    if not normalized:
        return None
    if len(normalized) > _SESSION_TITLE_MAX_LENGTH:
        raise ValueError("session title must be 80 characters or fewer")

    return normalized


_normalize_session_title = normalize_session_title


@asynccontextmanager
async def get_db() -> AsyncIterator[aiosqlite.Connection]:
    """非同步 context manager：``async with get_db() as db:`` 取得連線並於結束時關閉。"""
    async with aiosqlite.connect(_database_path(), timeout=_BUSY_TIMEOUT_MS / 1000) as db:
        db.row_factory = aiosqlite.Row
        await db.execute(f"PRAGMA busy_timeout={_BUSY_TIMEOUT_MS}")
        await db.execute("PRAGMA foreign_keys=ON")
        await db.execute("PRAGMA synchronous=NORMAL")
        yield db


async def init_db() -> None:
    """建立三張資料表（若不存在）並套用 WAL 模式以提升並發能力。"""
    async with get_db() as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.executescript(SCHEMA)
        await _backfill_sessions(db)
        await db.commit()


async def _backfill_sessions(db: aiosqlite.Connection) -> None:
    await db.execute(
        """
        INSERT OR IGNORE INTO sessions (
            case_id, session_id, created_at, updated_at, last_activity_at, title
        )
        WITH activity AS (
            SELECT case_id, session_id, created_at FROM messages
            UNION ALL
            SELECT case_id, session_id, created_at FROM summaries
        )
        SELECT
            case_id,
            session_id,
            MIN(created_at) AS created_at,
            MAX(created_at) AS updated_at,
            MAX(created_at) AS last_activity_at,
            NULL AS title
        FROM activity
        GROUP BY case_id, session_id
        """
    )


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
    if row is None:
        raise RuntimeError(f"個案寫入後查詢失敗，id={case_id}")
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


async def _get_session_metadata(
    case_id: str,
    session_id: str,
    *,
    include_created_at: bool = False,
) -> dict | None:
    async with get_db() as db:
        cur = await db.execute(
            """
            SELECT
                ? AS session_id,
                (
                    SELECT created_at
                    FROM sessions
                    WHERE case_id = ? AND session_id = ?
                ) AS session_created_at,
                (
                    SELECT updated_at
                    FROM sessions
                    WHERE case_id = ? AND session_id = ?
                ) AS session_updated_at,
                (
                    SELECT last_activity_at
                    FROM sessions
                    WHERE case_id = ? AND session_id = ?
                ) AS session_last_activity_at,
                (
                    SELECT title
                    FROM sessions
                    WHERE case_id = ? AND session_id = ?
                ) AS session_title,
                (
                    SELECT COUNT(*)
                    FROM messages
                    WHERE case_id = ? AND session_id = ?
                ) AS message_count,
                (
                    SELECT COUNT(*)
                    FROM summaries
                    WHERE case_id = ? AND session_id = ?
                ) AS summary_count,
                (
                    SELECT MAX(round)
                    FROM messages
                    WHERE case_id = ? AND session_id = ?
                ) AS message_last_turn,
                (
                    SELECT MAX(round)
                    FROM summaries
                    WHERE case_id = ? AND session_id = ?
                ) AS summary_last_turn,
                (
                    SELECT MAX(created_at)
                    FROM messages
                    WHERE case_id = ? AND session_id = ?
                ) AS message_last_updated,
                (
                    SELECT MAX(created_at)
                    FROM summaries
                    WHERE case_id = ? AND session_id = ?
                ) AS summary_last_updated,
                (
                    SELECT COALESCE(MAX(crisis_flag), 0)
                    FROM summaries
                    WHERE case_id = ? AND session_id = ?
                ) AS has_crisis,
                (
                    SELECT summary_json
                    FROM summaries
                    WHERE case_id = ? AND session_id = ?
                    ORDER BY created_at DESC, round DESC
                    LIMIT 1
                ) AS latest_summary_json,
                EXISTS (
                    SELECT 1
                    FROM sessions
                    WHERE case_id = ? AND session_id = ?
                ) AS has_session_row,
                EXISTS (
                    SELECT 1
                    FROM messages
                    WHERE case_id = ? AND session_id = ?
                ) AS has_message_row,
                EXISTS (
                    SELECT 1
                    FROM summaries
                    WHERE case_id = ? AND session_id = ?
                ) AS has_summary_row
            """,
            (
                session_id,
                case_id,
                session_id,
                case_id,
                session_id,
                case_id,
                session_id,
                case_id,
                session_id,
                case_id,
                session_id,
                case_id,
                session_id,
                case_id,
                session_id,
                case_id,
                session_id,
                case_id,
                session_id,
                case_id,
                session_id,
                case_id,
                session_id,
                case_id,
                session_id,
                case_id,
                session_id,
                case_id,
                session_id,
                case_id,
                session_id,
            ),
        )
        row = await cur.fetchone()

    if row is None:
        return None
    if not (row["has_session_row"] or row["has_message_row"] or row["has_summary_row"]):
        return None

    session = _session_metadata_from_row(row)
    if include_created_at:
        session["created_at"] = row["session_created_at"] or session["last_updated"]
    return session


def _session_metadata_from_row(row: aiosqlite.Row) -> dict:
    message_last_turn = row["message_last_turn"] or 0
    summary_last_turn = row["summary_last_turn"] or 0
    last_updated_values = [
        value
        for value in (
            row["message_last_updated"],
            row["summary_last_updated"],
            row["session_last_activity_at"],
            row["session_updated_at"],
            row["session_created_at"],
        )
        if value
    ]
    last_updated = max(last_updated_values) if last_updated_values else None

    return {
        "session_id": row["session_id"],
        "title": row["session_title"],
        "message_count": int(row["message_count"] or 0),
        "summary_count": int(row["summary_count"] or 0),
        "last_turn_number": max(message_last_turn, summary_last_turn),
        "last_updated": last_updated,
        "has_crisis": bool(row["has_crisis"]),
        "latest_summary_preview": _build_latest_summary_preview(
            row["latest_summary_json"]
        ),
    }


async def create_session(
    case_id: str,
    session_id: str | None = None,
    title: str | None = None,
) -> dict:
    session_id = session_id or str(uuid.uuid4())
    title = normalize_session_title(title)
    created_at = _now_iso()
    async with get_db() as db:
        await db.execute(
            """
            INSERT OR IGNORE INTO sessions (
                case_id, session_id, created_at, updated_at, last_activity_at, title
            )
            VALUES (?, ?, ?, ?, NULL, ?)
            """,
            (case_id, session_id, created_at, created_at, title),
        )
        await db.commit()

    session = await get_session(case_id, session_id)
    if session is None:
        raise RuntimeError(f"session 撖怠敺閰Ｗ仃??id={session_id}")
    return session


async def update_session_title(
    case_id: str,
    session_id: str,
    title: str | None,
) -> dict | None:
    title = normalize_session_title(title)
    updated_at = _now_iso()

    async with get_db() as db:
        await _backfill_sessions(db)
        await db.execute(
            """
            UPDATE sessions
            SET title = ?, updated_at = ?
            WHERE case_id = ? AND session_id = ?
            """,
            (title, updated_at, case_id, session_id),
        )
        cur = await db.execute("SELECT changes() AS n")
        row = await cur.fetchone()
        changed = int(row["n"]) if row else 0
        await db.commit()

    if changed == 0:
        return None

    return await get_session(case_id, session_id)


async def get_session(case_id: str, session_id: str) -> dict | None:
    return await _get_session_metadata(
        case_id,
        session_id,
        include_created_at=True,
    )


async def ensure_session(case_id: str, session_id: str) -> dict:
    existing = await get_session(case_id, session_id)
    if existing is not None:
        return existing
    return await create_session(case_id, session_id, None)


async def touch_session(
    case_id: str,
    session_id: str,
    activity_at: str | None = None,
) -> dict:
    timestamp = activity_at or _now_iso()
    await ensure_session(case_id, session_id)
    async with get_db() as db:
        await db.execute(
            """
            UPDATE sessions
            SET updated_at = ?, last_activity_at = ?
            WHERE case_id = ? AND session_id = ?
            """,
            (timestamp, timestamp, case_id, session_id),
        )
        await db.commit()

    session = await get_session(case_id, session_id)
    if session is None:
        raise RuntimeError(f"session ??敺閰Ｗ仃??id={session_id}")
    return session


async def add_message(
    case_id: str,
    session_id: str,
    turn_number: int,
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
            (msg_id, case_id, session_id, turn_number, role, content, created_at),
        )
        await db.commit()
        cur = await db.execute("SELECT * FROM messages WHERE id = ?", (msg_id,))
        row = await cur.fetchone()
    if row is None:
        raise RuntimeError(f"message 寫入後查詢失敗，id={msg_id}")
    return _message_row_to_dict(row)


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
    return [_message_row_to_dict(r) for r in rows]


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
    turn_number: int,
    summary_json: str,
    crisis_flag: bool,
) -> dict:
    try:
        parsed_summary = json.loads(summary_json)
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
                turn_number,
                summary_json,
                flag,
                created_at,
            ),
        )
        await db.commit()
    return {
        "id": summary_id,
        "case_id": case_id,
        "session_id": session_id,
        "turn_number": turn_number,
        "summary": parsed_summary,
        "crisis_flag": bool(crisis_flag),
        "created_at": created_at,
    }


def _parse_summary_row(row: aiosqlite.Row) -> dict:
    d = _row_to_dict(row)
    parsed = json.loads(d.pop("summary_json"))
    d["summary"] = parsed
    if "crisis_flag" in d:
        d["crisis_flag"] = bool(d["crisis_flag"])
    if "round" in d:
        d["turn_number"] = d.pop("round")
    return d


def _build_latest_summary_preview(summary_json: str | None) -> str | None:
    if not summary_json:
        return None

    try:
        summary = json.loads(summary_json)
    except (TypeError, json.JSONDecodeError):
        return None

    turn_number = summary.get("turn_number")
    emotion = summary.get("emotion")
    if not isinstance(emotion, dict):
        return None

    primary = emotion.get("primary")
    intensity = emotion.get("intensity")
    if turn_number is None or not primary or intensity is None:
        return None

    return f"第 {turn_number} 輪 · 主要情緒：{primary} · 強度 {intensity}/10"


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


async def get_session_metadata_by_case(case_id: str) -> list[dict]:
    async with get_db() as db:
        cur = await db.execute(
            """
            WITH session_ids AS (
                SELECT session_id FROM sessions WHERE case_id = ?
                UNION
                SELECT session_id FROM messages WHERE case_id = ?
                UNION
                SELECT session_id FROM summaries WHERE case_id = ?
            )
            SELECT
                session_ids.session_id,
                (
                    SELECT created_at
                    FROM sessions
                    WHERE case_id = ? AND session_id = session_ids.session_id
                ) AS session_created_at,
                (
                    SELECT updated_at
                    FROM sessions
                    WHERE case_id = ? AND session_id = session_ids.session_id
                ) AS session_updated_at,
                (
                    SELECT last_activity_at
                    FROM sessions
                    WHERE case_id = ? AND session_id = session_ids.session_id
                ) AS session_last_activity_at,
                (
                    SELECT title
                    FROM sessions
                    WHERE case_id = ? AND session_id = session_ids.session_id
                ) AS session_title,
                (
                    SELECT COUNT(*)
                    FROM messages
                    WHERE case_id = ? AND session_id = session_ids.session_id
                ) AS message_count,
                (
                    SELECT COUNT(*)
                    FROM summaries
                    WHERE case_id = ? AND session_id = session_ids.session_id
                ) AS summary_count,
                (
                    SELECT MAX(round)
                    FROM messages
                    WHERE case_id = ? AND session_id = session_ids.session_id
                ) AS message_last_turn,
                (
                    SELECT MAX(round)
                    FROM summaries
                    WHERE case_id = ? AND session_id = session_ids.session_id
                ) AS summary_last_turn,
                (
                    SELECT MAX(created_at)
                    FROM messages
                    WHERE case_id = ? AND session_id = session_ids.session_id
                ) AS message_last_updated,
                (
                    SELECT MAX(created_at)
                    FROM summaries
                    WHERE case_id = ? AND session_id = session_ids.session_id
                ) AS summary_last_updated,
                (
                    SELECT COALESCE(MAX(crisis_flag), 0)
                    FROM summaries
                    WHERE case_id = ? AND session_id = session_ids.session_id
                ) AS has_crisis,
                (
                    SELECT summary_json
                    FROM summaries
                    WHERE case_id = ? AND session_id = session_ids.session_id
                    ORDER BY created_at DESC, round DESC
                    LIMIT 1
                ) AS latest_summary_json
            FROM session_ids
            """,
            (
                case_id,
                case_id,
                case_id,
                case_id,
                case_id,
                case_id,
                case_id,
                case_id,
                case_id,
                case_id,
                case_id,
                case_id,
                case_id,
                case_id,
                case_id,
            ),
        )
        rows = await cur.fetchall()

    sessions = [_session_metadata_from_row(row) for row in rows]

    return sorted(
        sessions,
        key=lambda session: session["last_updated"] or "",
        reverse=True,
    )


async def get_latest_summaries(case_id: str, limit: int = 10) -> list[dict]:
    if not isinstance(limit, int) or limit <= 0:
        raise ValueError(f"limit 必須是正整數，收到：{limit}")
    limit = min(limit, 100)

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
