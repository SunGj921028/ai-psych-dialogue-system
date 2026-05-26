from __future__ import annotations

from contextlib import suppress
import json
from pathlib import Path
import sqlite3
import tempfile
import uuid

import anyio
import pytest
from pydantic import ValidationError

import backend.database.db as db_layer
from models.report_schema_v2 import (
    ReportDraftStatus,
    ReportManualInputV2,
    ReportSourceType,
)


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


def _safe_preview_summary_json(
    turn_number: int,
    *,
    primary: str = "焦慮",
    intensity: int = 6,
    key_statement: str = "SYNTHETIC_KEY_STATEMENT_SHOULD_NOT_LEAK",
    crisis_flag: bool = False,
) -> str:
    return json.dumps(
        {
            "turn_number": turn_number,
            "emotion": {"primary": primary, "intensity": intensity},
            "emotion_dimensions": {
                "anxiety": intensity,
                "sadness": 1,
                "anger": 0,
                "hopelessness": 2,
                "confusion": 1,
                "hope": 3,
            },
            "themes": ["SYNTHETIC_THEME_SHOULD_NOT_LEAK"],
            "key_statement": key_statement,
            "crisis_flag": crisis_flag,
        },
        ensure_ascii=False,
    )


def _create_legacy_database_without_sessions(db_path: Path, case_id: str) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.executescript(
            """
            PRAGMA foreign_keys=ON;

            CREATE TABLE cases (
                id TEXT PRIMARY KEY,
                code_name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                note TEXT
            );

            CREATE TABLE messages (
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

            CREATE TABLE summaries (
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
        )
        conn.execute(
            "INSERT INTO cases (id, code_name, created_at, note) VALUES (?, ?, ?, ?)",
            (case_id, "LEGACY", "2026-05-20T00:00:00+00:00", None),
        )
        conn.execute(
            """
            INSERT INTO messages (
                id, case_id, session_id, round, role, content, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "legacy-message",
                case_id,
                "legacy-session",
                2,
                "user",
                "SYNTHETIC_LEGACY_RAW_MESSAGE_SHOULD_NOT_LEAK",
                "2026-05-20T00:00:01+00:00",
            ),
        )
        conn.execute(
            """
            INSERT INTO summaries (
                id, case_id, session_id, round, summary_json, crisis_flag, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "legacy-summary",
                case_id,
                "legacy-session",
                3,
                _safe_preview_summary_json(3, primary="焦慮", intensity=6),
                1,
                "2026-05-20T00:00:04+00:00",
            ),
        )
        conn.commit()


def _create_legacy_database_with_sessions_without_archived_at(
    db_path: Path,
    case_id: str,
) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.executescript(
            """
            PRAGMA foreign_keys=ON;

            CREATE TABLE cases (
                id TEXT PRIMARY KEY,
                code_name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                note TEXT
            );

            CREATE TABLE messages (
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

            CREATE TABLE summaries (
                id TEXT PRIMARY KEY,
                case_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                round INTEGER NOT NULL,
                summary_json TEXT NOT NULL,
                crisis_flag INTEGER NOT NULL DEFAULT 0,
                crisis_level TEXT CHECK (
                    crisis_level IN ('none', 'low', 'high') OR crisis_level IS NULL
                ),
                created_at TEXT NOT NULL,
                FOREIGN KEY (case_id) REFERENCES cases (id) ON DELETE CASCADE
            );

            CREATE TABLE sessions (
                case_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_activity_at TEXT,
                title TEXT,
                PRIMARY KEY (case_id, session_id),
                FOREIGN KEY (case_id) REFERENCES cases (id) ON DELETE CASCADE
            );
            """
        )
        conn.execute(
            "INSERT INTO cases (id, code_name, created_at, note) VALUES (?, ?, ?, ?)",
            (case_id, "LEGACY", "2026-05-20T00:00:00+00:00", None),
        )
        conn.execute(
            """
            INSERT INTO sessions (
                case_id, session_id, created_at, updated_at, last_activity_at, title
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                case_id,
                "legacy-session",
                "2026-05-20T00:00:00+00:00",
                "2026-05-20T00:00:01+00:00",
                "2026-05-20T00:00:01+00:00",
                "Legacy title",
            ),
        )
        conn.commit()


async def _table_names() -> set[str]:
    async with db_layer.get_db() as conn:
        cursor = await conn.execute(
            """
            SELECT name FROM sqlite_master
            WHERE type = 'table'
              AND name IN (
                  'cases', 'messages', 'summaries', 'sessions', 'report_drafts'
              )
            """
        )
        rows = await cursor.fetchall()
    return {row["name"] for row in rows}


async def _table_columns(table_name: str) -> set[str]:
    async with db_layer.get_db() as conn:
        cursor = await conn.execute(f"PRAGMA table_info({table_name})")
        rows = await cursor.fetchall()
    return {row["name"] for row in rows}


async def _journal_mode() -> str:
    async with db_layer.get_db() as conn:
        cursor = await conn.execute("PRAGMA journal_mode")
        row = await cursor.fetchone()
    return str(row[0]).lower()


async def _raw_session_count(case_id: str) -> int:
    async with db_layer.get_db() as conn:
        cursor = await conn.execute(
            "SELECT COUNT(*) AS n FROM sessions WHERE case_id = ?",
            (case_id,),
        )
        row = await cursor.fetchone()
    return int(row["n"])


async def _raw_message_count(case_id: str, session_id: str) -> int:
    async with db_layer.get_db() as conn:
        cursor = await conn.execute(
            """
            SELECT COUNT(*) AS n
            FROM messages
            WHERE case_id = ? AND session_id = ?
            """,
            (case_id, session_id),
        )
        row = await cursor.fetchone()
    return int(row["n"])


async def _raw_summary_count(case_id: str, session_id: str) -> int:
    async with db_layer.get_db() as conn:
        cursor = await conn.execute(
            """
            SELECT COUNT(*) AS n
            FROM summaries
            WHERE case_id = ? AND session_id = ?
            """,
            (case_id, session_id),
        )
        row = await cursor.fetchone()
    return int(row["n"])


async def _raw_session_row(case_id: str, session_id: str) -> dict | None:
    async with db_layer.get_db() as conn:
        cursor = await conn.execute(
            "SELECT * FROM sessions WHERE case_id = ? AND session_id = ?",
            (case_id, session_id),
        )
        row = await cursor.fetchone()
    return dict(row) if row else None


async def _raw_report_draft_row(draft_id: str) -> dict | None:
    async with db_layer.get_db() as conn:
        cursor = await conn.execute(
            "SELECT * FROM report_drafts WHERE id = ?",
            (draft_id,),
        )
        row = await cursor.fetchone()
    return dict(row) if row else None


async def _set_session_timestamps(
    case_id: str,
    session_id: str,
    created_at: str,
    updated_at: str,
    last_activity_at: str | None,
) -> None:
    async with db_layer.get_db() as conn:
        await conn.execute(
            """
            UPDATE sessions
            SET created_at = ?, updated_at = ?, last_activity_at = ?
            WHERE case_id = ? AND session_id = ?
            """,
            (created_at, updated_at, last_activity_at, case_id, session_id),
        )
        await conn.commit()


def test_init_db_creates_required_tables_and_preserves_wal(initialized_db):
    assert initialized_db.exists()
    assert anyio.run(_table_names) == {
        "cases",
        "messages",
        "summaries",
        "sessions",
        "report_drafts",
    }
    assert "crisis_level" in anyio.run(_table_columns, "summaries")
    assert "archived_at" in anyio.run(_table_columns, "sessions")
    assert {
        "id",
        "case_id",
        "session_id",
        "schema_version",
        "status",
        "manual_input_json",
        "ai_generated_json",
        "counselor_edits_json",
        "final_report_json",
        "source_summary_ids_json",
        "created_at",
        "updated_at",
        "generated_at",
        "reviewed_at",
        "exported_at",
    }.issubset(anyio.run(_table_columns, "report_drafts"))
    assert anyio.run(_journal_mode) == "wal"


def test_create_or_get_report_draft_creates_default_v2_draft(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")
    anyio.run(db_layer.create_session, case["id"], "session-report-v2", None)

    draft = anyio.run(
        db_layer.create_or_get_report_draft,
        case["id"],
        "session-report-v2",
    )
    raw = anyio.run(_raw_report_draft_row, draft.draft_id)

    assert uuid.UUID(draft.draft_id)
    assert draft.case_id == case["id"]
    assert draft.session_id == "session-report-v2"
    assert draft.schema_version == "report_schema_v2"
    assert draft.status == ReportDraftStatus.MANUAL_INPUT_STARTED
    assert isinstance(draft.manual_input, ReportManualInputV2)
    assert draft.ai_generated is None
    assert draft.final_report is None
    assert draft.created_at
    assert draft.updated_at
    assert raw["schema_version"] == "report_schema_v2"
    assert raw["status"] == "manual_input_started"
    assert raw["ai_generated_json"] is None
    assert raw["final_report_json"] is None


def test_create_or_get_report_draft_returns_existing_current_draft(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")
    anyio.run(db_layer.create_session, case["id"], "session-report-v2", None)

    first = anyio.run(
        db_layer.create_or_get_report_draft,
        case["id"],
        "session-report-v2",
    )
    second = anyio.run(
        db_layer.create_or_get_report_draft,
        case["id"],
        "session-report-v2",
    )

    assert second.draft_id == first.draft_id
    assert second.created_at == first.created_at


def test_report_draft_manual_input_accepts_partial_data_and_is_validated(
    initialized_db,
):
    case = anyio.run(db_layer.create_case, "A001")
    anyio.run(db_layer.create_session, case["id"], "session-report-v2", None)

    draft = anyio.run(
        db_layer.create_or_get_report_draft,
        case["id"],
        "session-report-v2",
        {
            "basic_info": {
                "referral_source": {
                    "label_zh": "轉介來源",
                    "value": "school counselor",
                    "source_type": "manual",
                    "missing_reason": None,
                }
            }
        },
    )

    assert draft.manual_input.basic_info.referral_source.value == "school counselor"
    assert draft.manual_input.basic_info.referral_source.source_type == (
        ReportSourceType.MANUAL
    )

    with pytest.raises(ValidationError):
        anyio.run(
            db_layer.create_or_get_report_draft,
            case["id"],
            "different-session",
            {"basic_info": {"referral_source": {"source_type": "provider"}}},
        )


def test_update_report_manual_input_updates_timestamp_without_changing_generated_fields(
    initialized_db,
):
    case = anyio.run(db_layer.create_case, "A001")
    anyio.run(db_layer.create_session, case["id"], "session-report-v2", None)
    draft = anyio.run(
        db_layer.create_or_get_report_draft,
        case["id"],
        "session-report-v2",
    )
    raw_before = anyio.run(_raw_report_draft_row, draft.draft_id)

    updated = anyio.run(
        db_layer.update_report_manual_input,
        draft.draft_id,
        {
            "risk_assessment": {
                "overall_risk_level": "pending_assessment",
                "overall_risk_notes": {
                    "label_zh": "整體風險備註",
                    "value": "待評估",
                    "source_type": "manual",
                },
            }
        },
    )
    raw_after = anyio.run(_raw_report_draft_row, draft.draft_id)

    assert updated.draft_id == draft.draft_id
    assert updated.manual_input.risk_assessment.overall_risk_notes.value == "待評估"
    assert updated.updated_at != raw_before["updated_at"]
    assert raw_after["ai_generated_json"] is None
    assert raw_after["final_report_json"] is None


def test_report_draft_helpers_return_none_for_missing_rows(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")
    anyio.run(db_layer.create_session, case["id"], "session-report-v2", None)

    assert (
        anyio.run(
            db_layer.get_current_report_draft,
            case["id"],
            "session-report-v2",
        )
        is None
    )
    assert anyio.run(db_layer.get_report_draft, "missing-draft") is None
    assert (
        anyio.run(
            db_layer.update_report_manual_input,
            "missing-draft",
            ReportManualInputV2(),
        )
        is None
    )


def test_archived_session_can_create_and_update_report_draft(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")
    anyio.run(db_layer.create_session, case["id"], "archived-report-session", None)
    anyio.run(db_layer.archive_session, case["id"], "archived-report-session")

    draft = anyio.run(
        db_layer.create_or_get_report_draft,
        case["id"],
        "archived-report-session",
    )
    updated = anyio.run(
        db_layer.update_report_manual_input,
        draft.draft_id,
        {"basic_info": {"session_count": {"label_zh": "會談次數", "value": 1}}},
    )

    assert draft.session_id == "archived-report-session"
    assert updated.manual_input.basic_info.session_count.value == 1


def test_init_db_backfills_legacy_sessions_without_overwriting_metadata(tmp_path, monkeypatch):
    db_path = tmp_path / "legacy.db"
    case_id = "legacy-case"
    _create_legacy_database_without_sessions(db_path, case_id)
    monkeypatch.setenv("DATABASE_PATH", str(db_path))

    anyio.run(db_layer.init_db)
    anyio.run(db_layer.init_db)

    assert anyio.run(_table_names) == {
        "cases",
        "messages",
        "summaries",
        "sessions",
        "report_drafts",
    }
    assert "crisis_level" in anyio.run(_table_columns, "summaries")
    assert anyio.run(_raw_session_count, case_id) == 1

    session = anyio.run(db_layer.get_session, case_id, "legacy-session")
    assert session["session_id"] == "legacy-session"
    assert session["archived_at"] is None
    assert session["message_count"] == 1
    assert session["summary_count"] == 1
    assert session["last_turn_number"] == 3
    assert session["last_updated"] == "2026-05-20T00:00:04+00:00"
    assert session["has_crisis"] is True
    summaries = anyio.run(db_layer.get_summaries_by_session, case_id, "legacy-session")
    assert summaries[0]["crisis_level"] is None
    assert session["latest_summary_preview"] == "第 3 輪 · 主要情緒：焦慮 · 強度 6/10"


def test_init_db_migrates_existing_sessions_archived_at_column(tmp_path, monkeypatch):
    db_path = tmp_path / "legacy-with-sessions.db"
    case_id = "legacy-case"
    _create_legacy_database_with_sessions_without_archived_at(db_path, case_id)
    monkeypatch.setenv("DATABASE_PATH", str(db_path))

    anyio.run(db_layer.init_db)
    anyio.run(db_layer.init_db)

    assert "archived_at" in anyio.run(_table_columns, "sessions")
    raw_session = anyio.run(_raw_session_row, case_id, "legacy-session")
    assert raw_session["archived_at"] is None


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


def test_create_session_creates_empty_durable_session_metadata(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")

    session = anyio.run(db_layer.create_session, case["id"], None, None)

    assert session["session_id"]
    assert session["title"] is None
    assert session["archived_at"] is None
    assert session["message_count"] == 0
    assert session["summary_count"] == 0
    assert session["last_turn_number"] == 0
    assert session["last_updated"] == session["created_at"]
    assert session["has_crisis"] is False
    assert session["latest_summary_preview"] is None
    assert "round" not in session
    assert "summary_json" not in session

    fetched = anyio.run(db_layer.get_session, case["id"], session["session_id"])
    assert fetched == session


def test_create_session_normalizes_and_validates_title(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")

    titled = anyio.run(
        db_layer.create_session,
        case["id"],
        "session-titled",
        "  Intake planning  ",
    )
    whitespace = anyio.run(
        db_layer.create_session,
        case["id"],
        "session-blank-title",
        "   ",
    )

    assert titled["title"] == "Intake planning"
    assert whitespace["title"] is None

    with pytest.raises(ValueError):
        anyio.run(
            db_layer.create_session,
            case["id"],
            "session-title-too-long",
            "x" * 81,
        )


def test_create_session_with_existing_id_is_idempotent(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")

    first = anyio.run(db_layer.create_session, case["id"], "session-explicit", "First")
    second = anyio.run(db_layer.create_session, case["id"], "session-explicit", "unused")

    assert second == first
    assert second["title"] == "First"
    sessions = anyio.run(db_layer.get_session_metadata_by_case, case["id"])
    assert [session["session_id"] for session in sessions] == ["session-explicit"]
    assert sessions[0]["title"] == "First"


def test_update_session_title_updates_and_trims_title(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")
    anyio.run(db_layer.create_session, case["id"], "session-rename", None)

    updated = anyio.run(
        db_layer.update_session_title,
        case["id"],
        "session-rename",
        "  Intake review  ",
    )

    assert updated["session_id"] == "session-rename"
    assert updated["title"] == "Intake review"
    assert anyio.run(db_layer.get_session, case["id"], "session-rename")["title"] == (
        "Intake review"
    )


def test_update_session_title_clears_null_and_whitespace_titles(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")
    anyio.run(db_layer.create_session, case["id"], "session-null-clear", "Initial")
    anyio.run(db_layer.create_session, case["id"], "session-blank-clear", "Initial")

    null_cleared = anyio.run(
        db_layer.update_session_title,
        case["id"],
        "session-null-clear",
        None,
    )
    blank_cleared = anyio.run(
        db_layer.update_session_title,
        case["id"],
        "session-blank-clear",
        "   ",
    )

    assert null_cleared["title"] is None
    assert blank_cleared["title"] is None


def test_update_session_title_rejects_over_length_title(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")
    anyio.run(db_layer.create_session, case["id"], "session-long-title", None)

    with pytest.raises(ValueError):
        anyio.run(
            db_layer.update_session_title,
            case["id"],
            "session-long-title",
            "x" * 81,
        )


def test_update_session_title_updates_updated_at_without_touching_activity(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")
    anyio.run(db_layer.create_session, case["id"], "session-timestamps", None)
    anyio.run(
        _set_session_timestamps,
        case["id"],
        "session-timestamps",
        "2000-01-01T00:00:00+00:00",
        "2000-01-01T00:00:00+00:00",
        "2000-01-01T00:05:00+00:00",
    )

    updated = anyio.run(
        db_layer.update_session_title,
        case["id"],
        "session-timestamps",
        "Updated title",
    )
    raw_session = anyio.run(_raw_session_row, case["id"], "session-timestamps")

    assert raw_session["title"] == "Updated title"
    assert raw_session["updated_at"] != "2000-01-01T00:00:00+00:00"
    assert raw_session["last_activity_at"] == "2000-01-01T00:05:00+00:00"
    assert updated["last_updated"] == raw_session["updated_at"]


def test_update_session_title_renames_legacy_derived_session_after_backfill(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")
    legacy_message = anyio.run(
        db_layer.add_message,
        case["id"],
        "legacy-derived-rename",
        1,
        "user",
        "SYNTHETIC_LEGACY_RENAME_MESSAGE_SHOULD_NOT_LEAK",
    )
    anyio.run(
        _set_message_created_at,
        legacy_message["id"],
        "2026-05-20T00:00:01+00:00",
    )

    assert anyio.run(_raw_session_count, case["id"]) == 0

    updated = anyio.run(
        db_layer.update_session_title,
        case["id"],
        "legacy-derived-rename",
        "Legacy renamed",
    )

    assert updated["title"] == "Legacy renamed"
    assert updated["message_count"] == 1
    assert anyio.run(_raw_session_count, case["id"]) == 1


def test_update_session_title_returns_none_for_missing_session(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")

    assert (
        anyio.run(db_layer.update_session_title, case["id"], "missing-session", "Title")
        is None
    )


def test_update_session_title_metadata_does_not_leak_sensitive_fields(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")
    message = anyio.run(
        db_layer.add_message,
        case["id"],
        "session-safe-rename",
        1,
        "user",
        "SYNTHETIC_RENAME_PRIVATE_MESSAGE_SHOULD_NOT_LEAK",
    )
    summary = anyio.run(
        db_layer.add_summary,
        case["id"],
        "session-safe-rename",
        1,
        _safe_preview_summary_json(
            1,
            primary="?行",
            intensity=5,
            key_statement="SYNTHETIC_RENAME_KEY_STATEMENT_SHOULD_NOT_LEAK",
            crisis_flag=True,
        ),
        True,
    )
    anyio.run(_set_message_created_at, message["id"], "2026-05-20T00:00:01+00:00")
    anyio.run(_set_summary_created_at, summary["id"], "2026-05-20T00:00:02+00:00")

    updated = anyio.run(
        db_layer.update_session_title,
        case["id"],
        "session-safe-rename",
        "Counselor title",
    )

    serialized = json.dumps(updated, ensure_ascii=False)
    assert updated["title"] == "Counselor title"
    assert "round" not in serialized
    assert "summary_json" not in serialized
    assert "SYNTHETIC_RENAME_PRIVATE_MESSAGE_SHOULD_NOT_LEAK" not in serialized
    assert "SYNTHETIC_RENAME_KEY_STATEMENT_SHOULD_NOT_LEAK" not in serialized
    assert "SYNTHETIC_THEME_SHOULD_NOT_LEAK" not in serialized


def test_get_session_returns_none_for_missing_session(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")

    assert anyio.run(db_layer.get_session, case["id"], "missing-session") is None


def test_ensure_session_creates_once_and_touch_updates_activity(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")

    ensured = anyio.run(db_layer.ensure_session, case["id"], "session-touch")
    ensured_again = anyio.run(db_layer.ensure_session, case["id"], "session-touch")
    touched = anyio.run(
        db_layer.touch_session,
        case["id"],
        "session-touch",
        "2099-05-22T10:30:00+00:00",
    )

    assert ensured["session_id"] == "session-touch"
    assert ensured_again["session_id"] == "session-touch"
    assert anyio.run(_raw_session_count, case["id"]) == 1
    assert touched["last_updated"] == "2099-05-22T10:30:00+00:00"
    assert touched["message_count"] == 0
    assert anyio.run(db_layer.get_session, case["id"], "session-touch")["last_updated"] == (
        "2099-05-22T10:30:00+00:00"
    )


def test_archive_session_sets_archived_at_and_preserves_activity(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")
    anyio.run(db_layer.create_session, case["id"], "session-archive", None)
    anyio.run(
        _set_session_timestamps,
        case["id"],
        "session-archive",
        "2000-01-01T00:00:00+00:00",
        "2000-01-01T00:00:00+00:00",
        "2000-01-01T00:05:00+00:00",
    )

    archived = anyio.run(db_layer.archive_session, case["id"], "session-archive")
    raw_session = anyio.run(_raw_session_row, case["id"], "session-archive")

    assert archived["archived_at"]
    assert raw_session["archived_at"] == archived["archived_at"]
    assert raw_session["updated_at"] == archived["archived_at"]
    assert raw_session["last_activity_at"] == "2000-01-01T00:05:00+00:00"
    assert archived["last_updated"] == raw_session["updated_at"]


def test_unarchive_session_clears_archived_at_and_preserves_activity(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")
    anyio.run(db_layer.create_session, case["id"], "session-unarchive", None)
    anyio.run(
        _set_session_timestamps,
        case["id"],
        "session-unarchive",
        "2000-01-01T00:00:00+00:00",
        "2000-01-01T00:00:00+00:00",
        "2000-01-01T00:05:00+00:00",
    )
    anyio.run(db_layer.archive_session, case["id"], "session-unarchive")

    unarchived = anyio.run(db_layer.unarchive_session, case["id"], "session-unarchive")
    raw_session = anyio.run(_raw_session_row, case["id"], "session-unarchive")

    assert unarchived["archived_at"] is None
    assert raw_session["archived_at"] is None
    assert raw_session["updated_at"] != "2000-01-01T00:00:00+00:00"
    assert raw_session["last_activity_at"] == "2000-01-01T00:05:00+00:00"
    assert unarchived["last_updated"] == raw_session["updated_at"]


def test_archive_session_backfills_legacy_derived_session(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")
    anyio.run(
        db_layer.add_message,
        case["id"],
        "legacy-derived-archive",
        1,
        "user",
        "SYNTHETIC_LEGACY_ARCHIVE_MESSAGE_SHOULD_NOT_LEAK",
    )

    assert anyio.run(_raw_session_count, case["id"]) == 0

    archived = anyio.run(
        db_layer.archive_session,
        case["id"],
        "legacy-derived-archive",
    )

    assert archived["archived_at"]
    assert archived["message_count"] == 1
    assert anyio.run(_raw_session_count, case["id"]) == 1


def test_archive_session_returns_none_for_missing_session(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")

    assert anyio.run(db_layer.archive_session, case["id"], "missing-session") is None
    assert anyio.run(db_layer.unarchive_session, case["id"], "missing-session") is None


def test_session_metadata_excludes_archived_by_default_and_can_include_archived(
    initialized_db,
):
    case = anyio.run(db_layer.create_case, "A001")
    anyio.run(db_layer.create_session, case["id"], "active-session", None)
    anyio.run(db_layer.create_session, case["id"], "archived-session", None)
    anyio.run(db_layer.archive_session, case["id"], "archived-session")

    default_sessions = anyio.run(db_layer.get_session_metadata_by_case, case["id"])
    all_sessions = anyio.run(
        db_layer.get_session_metadata_by_case,
        case["id"],
        True,
    )

    assert [session["session_id"] for session in default_sessions] == [
        "active-session"
    ]
    assert {session["session_id"] for session in all_sessions} == {
        "active-session",
        "archived-session",
    }
    archived = next(
        session for session in all_sessions if session["session_id"] == "archived-session"
    )
    assert archived["archived_at"]


def test_archive_and_unarchive_preserve_messages_and_summaries(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")
    anyio.run(db_layer.create_session, case["id"], "session-preserve", None)
    anyio.run(
        db_layer.add_message,
        case["id"],
        "session-preserve",
        1,
        "user",
        "SYNTHETIC_ARCHIVED_PRIVATE_MESSAGE_SHOULD_NOT_LEAK",
    )
    anyio.run(
        db_layer.add_summary,
        case["id"],
        "session-preserve",
        1,
        _safe_preview_summary_json(
            1,
            key_statement="SYNTHETIC_ARCHIVED_KEY_STATEMENT_SHOULD_NOT_LEAK",
        ),
        False,
    )

    anyio.run(db_layer.archive_session, case["id"], "session-preserve")
    anyio.run(db_layer.unarchive_session, case["id"], "session-preserve")

    assert anyio.run(_raw_message_count, case["id"], "session-preserve") == 1
    assert anyio.run(_raw_summary_count, case["id"], "session-preserve") == 1
    assert len(anyio.run(db_layer.get_messages_by_session, case["id"], "session-preserve")) == 1
    assert len(anyio.run(db_layer.get_summaries_by_session, case["id"], "session-preserve")) == 1


def test_archive_session_metadata_does_not_leak_sensitive_fields(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")
    anyio.run(
        db_layer.add_message,
        case["id"],
        "session-safe-archive",
        1,
        "user",
        "SYNTHETIC_ARCHIVE_PRIVATE_MESSAGE_SHOULD_NOT_LEAK",
    )
    anyio.run(
        db_layer.add_summary,
        case["id"],
        "session-safe-archive",
        1,
        _safe_preview_summary_json(
            1,
            key_statement="SYNTHETIC_ARCHIVE_KEY_STATEMENT_SHOULD_NOT_LEAK",
            crisis_flag=True,
        ),
        True,
    )

    archived = anyio.run(
        db_layer.archive_session,
        case["id"],
        "session-safe-archive",
    )

    serialized = json.dumps(archived, ensure_ascii=False)
    assert archived["archived_at"]
    assert "round" not in serialized
    assert "summary_json" not in serialized
    assert "SYNTHETIC_ARCHIVE_PRIVATE_MESSAGE_SHOULD_NOT_LEAK" not in serialized
    assert "SYNTHETIC_ARCHIVE_KEY_STATEMENT_SHOULD_NOT_LEAK" not in serialized
    assert "SYNTHETIC_THEME_SHOULD_NOT_LEAK" not in serialized


def test_session_metadata_includes_explicit_empty_sessions(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")
    created = anyio.run(db_layer.create_session, case["id"], "empty-session", None)

    sessions = anyio.run(db_layer.get_session_metadata_by_case, case["id"])

    assert sessions == [
        {
            "session_id": "empty-session",
            "title": None,
            "archived_at": None,
            "message_count": 0,
            "summary_count": 0,
            "last_turn_number": 0,
            "last_updated": created["created_at"],
            "has_crisis": False,
            "latest_summary_preview": None,
        }
    ]


def test_session_metadata_combines_explicit_empty_and_legacy_derived_sessions(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")
    anyio.run(db_layer.create_session, case["id"], "empty-explicit", None)
    anyio.run(
        _set_session_timestamps,
        case["id"],
        "empty-explicit",
        "2026-05-20T00:00:03+00:00",
        "2026-05-20T00:00:03+00:00",
        None,
    )

    legacy_message = anyio.run(
        db_layer.add_message,
        case["id"],
        "legacy-derived",
        5,
        "user",
        "SYNTHETIC_LEGACY_PRIVATE_MESSAGE_SHOULD_NOT_LEAK",
    )
    legacy_summary = anyio.run(
        db_layer.add_summary,
        case["id"],
        "legacy-derived",
        4,
        _safe_preview_summary_json(
            4,
            primary="焦慮",
            intensity=7,
            key_statement="SYNTHETIC_LEGACY_KEY_STATEMENT_SHOULD_NOT_LEAK",
            crisis_flag=True,
        ),
        True,
    )
    anyio.run(
        _set_message_created_at,
        legacy_message["id"],
        "2026-05-20T00:00:01+00:00",
    )
    anyio.run(
        _set_summary_created_at,
        legacy_summary["id"],
        "2026-05-20T00:00:02+00:00",
    )

    sessions = anyio.run(db_layer.get_session_metadata_by_case, case["id"])

    assert [session["session_id"] for session in sessions] == [
        "empty-explicit",
        "legacy-derived",
    ]
    assert sessions[0]["message_count"] == 0
    assert sessions[0]["title"] is None
    assert sessions[0]["archived_at"] is None
    assert sessions[0]["summary_count"] == 0
    assert sessions[0]["last_turn_number"] == 0
    assert sessions[0]["last_updated"] == "2026-05-20T00:00:03+00:00"
    assert sessions[0]["has_crisis"] is False
    assert sessions[0]["latest_summary_preview"] is None

    assert sessions[1]["message_count"] == 1
    assert sessions[1]["title"] is None
    assert sessions[1]["archived_at"] is None
    assert sessions[1]["summary_count"] == 1
    assert sessions[1]["last_turn_number"] == 5
    assert sessions[1]["last_updated"] == "2026-05-20T00:00:02+00:00"
    assert sessions[1]["has_crisis"] is True
    assert sessions[1]["latest_summary_preview"] == "第 4 輪 · 主要情緒：焦慮 · 強度 7/10"

    serialized = json.dumps(sessions, ensure_ascii=False)
    assert "round" not in serialized
    assert "summary_json" not in serialized
    assert "SYNTHETIC_LEGACY_PRIVATE_MESSAGE_SHOULD_NOT_LEAK" not in serialized
    assert "SYNTHETIC_LEGACY_KEY_STATEMENT_SHOULD_NOT_LEAK" not in serialized
    assert "SYNTHETIC_THEME_SHOULD_NOT_LEAK" not in serialized


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
        "high",
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
    assert [summary["crisis_level"] for summary in summaries] == [None, "high"]
    assert summaries[0]["summary"]["turn_number"] == 1
    assert summaries[1]["summary"]["turn_number"] == 2
    assert all("round" not in summary for summary in summaries)
    assert all("summary_json" not in summary for summary in summaries)
    assert all(isinstance(summary["summary"], dict) for summary in summaries)


@pytest.mark.parametrize("level", ["none", "low", "high"])
def test_add_summary_persists_allowed_crisis_levels(initialized_db, level):
    case = anyio.run(db_layer.create_case, "A001")

    summary = anyio.run(
        db_layer.add_summary,
        case["id"],
        "session-crisis-levels",
        1,
        _summary_json(1, crisis_flag=level != "none"),
        level != "none",
        level,
    )

    assert summary["crisis_level"] == level
    summaries = anyio.run(
        db_layer.get_summaries_by_session,
        case["id"],
        "session-crisis-levels",
    )
    assert summaries[0]["crisis_level"] == level


def test_add_summary_omitted_crisis_level_remains_null(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")

    summary = anyio.run(
        db_layer.add_summary,
        case["id"],
        "session-null-crisis-level",
        1,
        _summary_json(1, crisis_flag=True),
        True,
    )

    assert summary["crisis_level"] is None
    summaries = anyio.run(
        db_layer.get_summaries_by_session,
        case["id"],
        "session-null-crisis-level",
    )
    assert summaries[0]["crisis_level"] is None


def test_add_summary_rejects_invalid_crisis_level(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")

    with pytest.raises(ValueError):
        anyio.run(
            db_layer.add_summary,
            case["id"],
            "session-invalid-crisis-level",
            1,
            _summary_json(1, crisis_flag=True),
            True,
            "medium",
        )


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


async def _set_message_created_at(message_id: str, created_at: str) -> None:
    async with db_layer.get_db() as conn:
        await conn.execute(
            "UPDATE messages SET created_at = ? WHERE id = ?",
            (created_at, message_id),
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
    anyio.run(db_layer.create_session, case["id"], "session-1", None)
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
    assert anyio.run(_raw_session_count, case["id"]) == 0
    assert anyio.run(db_layer.get_messages_by_session, case["id"], "session-1") == []
    assert anyio.run(db_layer.get_summaries_by_session, case["id"], "session-1") == []
    assert anyio.run(db_layer.has_crisis_in_session, case["id"], "session-1") is False


def test_session_metadata_is_derived_without_leaking_sensitive_fields(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")

    message_only = anyio.run(
        db_layer.add_message,
        case["id"],
        "session-message-only",
        4,
        "user",
        "SYNTHETIC_PRIVATE_MESSAGE_SHOULD_NOT_LEAK",
    )
    anyio.run(
        _set_message_created_at,
        message_only["id"],
        "2026-05-20T00:00:02+00:00",
    )

    old_message = anyio.run(
        db_layer.add_message,
        case["id"],
        "session-old",
        1,
        "user",
        "older private message",
    )
    old_summary = anyio.run(
        db_layer.add_summary,
        case["id"],
        "session-old",
        3,
        _safe_preview_summary_json(3, primary="焦慮", intensity=6, crisis_flag=True),
        True,
    )
    anyio.run(_set_message_created_at, old_message["id"], "2026-05-20T00:00:01+00:00")
    anyio.run(_set_summary_created_at, old_summary["id"], "2026-05-20T00:00:03+00:00")

    newest_message = anyio.run(
        db_layer.add_message,
        case["id"],
        "session-newest",
        2,
        "assistant",
        "newer private message",
    )
    newest_summary = anyio.run(
        db_layer.add_summary,
        case["id"],
        "session-newest",
        1,
        _safe_preview_summary_json(
            1,
            primary="低落",
            intensity=4,
            key_statement="SYNTHETIC_LATEST_KEY_STATEMENT_SHOULD_NOT_LEAK",
        ),
        False,
    )
    anyio.run(
        _set_message_created_at,
        newest_message["id"],
        "2026-05-20T00:00:04+00:00",
    )
    anyio.run(
        _set_summary_created_at,
        newest_summary["id"],
        "2026-05-20T00:00:05+00:00",
    )

    sessions = anyio.run(db_layer.get_session_metadata_by_case, case["id"])

    assert [session["session_id"] for session in sessions] == [
        "session-newest",
        "session-old",
        "session-message-only",
    ]

    newest = sessions[0]
    assert newest["title"] is None
    assert newest["message_count"] == 1
    assert newest["summary_count"] == 1
    assert newest["last_turn_number"] == 2
    assert newest["last_updated"] == "2026-05-20T00:00:05+00:00"
    assert newest["has_crisis"] is False
    assert newest["latest_summary_preview"] == "第 1 輪 · 主要情緒：低落 · 強度 4/10"

    old = sessions[1]
    assert old["title"] is None
    assert old["message_count"] == 1
    assert old["summary_count"] == 1
    assert old["last_turn_number"] == 3
    assert old["has_crisis"] is True
    assert old["latest_summary_preview"] == "第 3 輪 · 主要情緒：焦慮 · 強度 6/10"

    message_only_session = sessions[2]
    assert message_only_session["title"] is None
    assert message_only_session["message_count"] == 1
    assert message_only_session["summary_count"] == 0
    assert message_only_session["last_turn_number"] == 4
    assert message_only_session["has_crisis"] is False
    assert message_only_session["latest_summary_preview"] is None

    serialized = json.dumps(sessions, ensure_ascii=False)
    assert "round" not in serialized
    assert "summary_json" not in serialized
    assert "SYNTHETIC_PRIVATE_MESSAGE_SHOULD_NOT_LEAK" not in serialized
    assert "SYNTHETIC_KEY_STATEMENT_SHOULD_NOT_LEAK" not in serialized
    assert "SYNTHETIC_LATEST_KEY_STATEMENT_SHOULD_NOT_LEAK" not in serialized
    assert "SYNTHETIC_THEME_SHOULD_NOT_LEAK" not in serialized


def test_session_metadata_returns_empty_list_when_case_has_no_sessions(initialized_db):
    case = anyio.run(db_layer.create_case, "A001")

    assert anyio.run(db_layer.get_session_metadata_by_case, case["id"]) == []
