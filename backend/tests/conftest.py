from __future__ import annotations

from contextlib import suppress
import sys
from pathlib import Path
import tempfile
import uuid

import pytest
from fastapi.testclient import TestClient


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def _cleanup_sqlite_files(db_path: Path) -> None:
    for path in (db_path, Path(f"{db_path}-wal"), Path(f"{db_path}-shm")):
        with suppress(FileNotFoundError, PermissionError):
            path.unlink()

    with suppress(OSError):
        db_path.parent.rmdir()
    with suppress(OSError):
        db_path.parent.parent.rmdir()


@pytest.fixture()
def client(monkeypatch):
    db_dir = Path(tempfile.gettempdir()) / "ai_psych_dialogue_route_tests" / uuid.uuid4().hex
    db_dir.mkdir(parents=True, exist_ok=False)
    db_path = db_dir / "test.db"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))

    import main

    try:
        with TestClient(main.app) as test_client:
            yield test_client
    finally:
        _cleanup_sqlite_files(db_path)
