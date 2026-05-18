from __future__ import annotations

from contextlib import suppress
import json
from pathlib import Path
import tempfile
import uuid

import anyio
import pytest

import backend.database.db as db_layer


def _cleanup_db_files(db_path: Path) -> None:
    for path in (db_path, Path(f"{db_path}-wal"), Path(f"{db_path}-shm")):
        with suppress(FileNotFoundError, PermissionError):
            path.unlink()

    with suppress(OSError):
        db_path.parent.rmdir()
    with suppress(OSError):
        db_path.parent.parent.rmdir()


@pytest.fixture()
def initialized_db(monkeypatch):
    db_dir = Path(tempfile.gettempdir()) / "ai_psych_dialogue_db_tests" / uuid.uuid4().hex
    db_dir.mkdir(parents=True, exist_ok=False)
    db_path = db_dir / "test.db"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))
    anyio.run(db_layer.init_db)
    try:
        yield db_path
    finally:
        _cleanup_db_files(db_path)


def _summary_json(turn_number: int, *, crisis_flag: bool = False) -> str:
    return json.dumps(
        {
            "turn_number": turn_number,
            "emotion": {"primary": "焦慮", "intensity": turn_number},
            "emotion_dimensions": {
                "anxiety": turn_number,
                "sadness": 1,
                "anger": 0,
                "hopelessness": 2,
                "confusion": 1,
                "hope": 3,
            },
            "themes": ["工作壓力"],
            "key_statement": f"第 {turn_number} 輪",
            "crisis_flag": crisis_flag,
        },
        ensure_ascii=False,
    )


async def _table_names() -> set[str]:
    async with db_layer.get_db() as conn:
        cursor = await conn.execute(
            """
            SELECT name FROM sqlite_master
            WHERE type = 'table' AND name IN ('cases', 'messages', 'summaries')
            """
        )
        rows = await cursor.fetchall()
    return {row["name"] for row in rows}


async def _journal_mode() -> str:
    async with db_layer.get_db() as conn:
        cursor = await conn.execute("PRAGMA journal_mode")
        row = await cursor.fetchone()
    return str(row[0]).lower()


def test_init_db_creates_required_tables_and_preserves_wal(initialized_db):
    assert initialized_db.exists()
    assert anyio.run(_table_names) == {"cases", "messages", "summaries"}
    assert anyio.run(_journal_mode) == "wal"


def test_case_crud_uses_current_missing_case_behavior(initialized_db):
    created = anyio.run(db_layer.create_case, "A001", "first note")

    assert created["id"]
    assert created["code_name"] == "A001"
    assert created["note"] == "first note"
    assert created["created_at"]

    fetched = anyio.run(db_layer.get_case, created["id"])
    assert fetched == created

    all_cases = anyio.run(db_layer.get_all_cases)
    assert [case["id"] for case in all_cases] == [created["id"]]

    assert anyio.run(db_layer.get_case, "missing-case") is None
    assert anyio.run(db_layer.delete_case, "missing-case") is False
    assert anyio.run(db_layer.delete_case, created["id"]) is True
    assert anyio.run(db_layer.get_case, created["id"]) is None


def test_messages_are_persisted_ordered_and_publicly_mapped(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")

    anyio.run(db_layer.add_message, case["id"], "session-1", 2, "assistant", "second")
    anyio.run(db_layer.add_message, case["id"], "session-1", 1, "user", "first")

    messages = anyio.run(db_layer.get_messages_by_session, case["id"], "session-1")

    assert [message["turn_number"] for message in messages] == [1, 2]
    assert [message["role"] for message in messages] == ["user", "assistant"]
    assert [message["content"] for message in messages] == ["first", "second"]
    assert all("round" not in message for message in messages)


def test_summaries_are_persisted_ordered_parsed_and_publicly_mapped(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")

    anyio.run(
        db_layer.add_summary,
        case["id"],
        "session-1",
        2,
        _summary_json(2, crisis_flag=True),
        True,
    )
    anyio.run(
        db_layer.add_summary,
        case["id"],
        "session-1",
        1,
        _summary_json(1),
        False,
    )

    summaries = anyio.run(db_layer.get_summaries_by_session, case["id"], "session-1")

    assert [summary["turn_number"] for summary in summaries] == [1, 2]
    assert [summary["crisis_flag"] for summary in summaries] == [False, True]
    assert summaries[0]["summary"]["turn_number"] == 1
    assert summaries[1]["summary"]["turn_number"] == 2
    assert all("round" not in summary for summary in summaries)
    assert all("summary_json" not in summary for summary in summaries)
    assert all(isinstance(summary["summary"], dict) for summary in summaries)


async def _insert_invalid_summary_json(case_id: str, session_id: str) -> None:
    async with db_layer.get_db() as conn:
        await conn.execute(
            """
            INSERT INTO summaries (
                id, case_id, session_id, round, summary_json, crisis_flag, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                case_id,
                session_id,
                1,
                "not json",
                0,
                "2026-05-19T00:00:00+00:00",
            ),
        )
        await conn.commit()


def test_invalid_summary_json_in_database_raises_value_error(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")
    anyio.run(_insert_invalid_summary_json, case["id"], "session-1")

    with pytest.raises(ValueError):
        anyio.run(db_layer.get_summaries_by_session, case["id"], "session-1")


async def _set_summary_created_at(summary_id: str, created_at: str) -> None:
    async with db_layer.get_db() as conn:
        await conn.execute(
            "UPDATE summaries SET created_at = ? WHERE id = ?",
            (created_at, summary_id),
        )
        await conn.commit()


def test_crisis_and_latest_summary_helpers(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")

    first = anyio.run(
        db_layer.add_summary,
        case["id"],
        "session-1",
        1,
        _summary_json(1),
        False,
    )
    second = anyio.run(
        db_layer.add_summary,
        case["id"],
        "session-1",
        2,
        _summary_json(2, crisis_flag=True),
        True,
    )
    third = anyio.run(
        db_layer.add_summary,
        case["id"],
        "session-2",
        3,
        _summary_json(3),
        False,
    )
    anyio.run(_set_summary_created_at, first["id"], "2026-05-19T00:00:01+00:00")
    anyio.run(_set_summary_created_at, second["id"], "2026-05-19T00:00:03+00:00")
    anyio.run(_set_summary_created_at, third["id"], "2026-05-19T00:00:02+00:00")

    assert anyio.run(db_layer.has_crisis_in_session, case["id"], "session-2") is False
    assert anyio.run(db_layer.has_crisis_in_session, case["id"], "session-1") is True

    latest = anyio.run(db_layer.get_latest_summaries, case["id"], 2)
    assert [row["turn_number"] for row in latest] == [2, 3]
    assert all("round" not in row for row in latest)
    assert all("summary_json" not in row for row in latest)

    with pytest.raises(ValueError):
        anyio.run(db_layer.get_latest_summaries, case["id"], 0)
    with pytest.raises(ValueError):
        anyio.run(db_layer.get_latest_summaries, case["id"], -1)


def test_delete_case_cascades_messages_and_summaries(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")
    anyio.run(db_layer.add_message, case["id"], "session-1", 1, "user", "hello")
    anyio.run(
        db_layer.add_summary,
        case["id"],
        "session-1",
        1,
        _summary_json(1, crisis_flag=True),
        True,
    )

    assert anyio.run(db_layer.delete_case, case["id"]) is True
    assert anyio.run(db_layer.get_messages_by_session, case["id"], "session-1") == []
    assert anyio.run(db_layer.get_summaries_by_session, case["id"], "session-1") == []
    assert anyio.run(db_layer.has_crisis_in_session, case["id"], "session-1") is False
