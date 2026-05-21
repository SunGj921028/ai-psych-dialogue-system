from __future__ import annotations

from agents.conversation_agent import ConversationResponse
from agents.crisis_agent import CrisisDetectionResult
from agents.summary_agent import EmotionDetail, EmotionDimensions, TurnSummary


def _create_case(client) -> str:
    response = client.post("/api/cases", json={"code_name": "A001"})
    assert response.status_code == 200
    return response.json()["id"]


def test_conversation_turn_persists_messages_and_summary(client, monkeypatch):
    case_id = _create_case(client)
    calls = {}

    async def fake_generate_response(user_input, conversation_history):
        calls["history"] = conversation_history
        return ConversationResponse(
            content="我聽見這對你很不容易。",
            is_safe=True,
            warning=None,
        )

    async def fake_detect_crisis(user_input):
        return CrisisDetectionResult(
            crisis_flag=True,
            crisis_level="high",
            reason="mocked high crisis",
        )

    async def fake_generate_summary(turn_number, user_input, assistant_response, crisis_flag):
        calls["summary_crisis_flag"] = crisis_flag
        return TurnSummary(
            turn_number=turn_number,
            emotion=EmotionDetail(primary="焦慮", intensity=8),
            emotion_dimensions=EmotionDimensions(anxiety=8, hopelessness=7),
            themes=["壓力"],
            key_statement=user_input,
            crisis_flag=crisis_flag,
        )

    monkeypatch.setattr("routers.conversation.generate_response", fake_generate_response)
    monkeypatch.setattr("routers.conversation.detect_crisis", fake_detect_crisis)
    monkeypatch.setattr("routers.conversation.generate_summary", fake_generate_summary)

    response = client.post(
        "/api/conversation/turn",
        json={
            "case_id": case_id,
            "session_id": "session-1",
            "turn_number": 1,
            "user_input": "我不想活了",
            "conversation_history": [
                {"role": "user", "content": "之前很累"},
                {"role": "assistant", "content": "我在聽。"},
            ],
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["case_id"] == case_id
    assert data["session_id"] == "session-1"
    assert data["turn_number"] == 1
    assert data["assistant_response"]["content"] == "我聽見這對你很不容易。"
    assert data["crisis"]["crisis_flag"] is True
    assert data["crisis"]["crisis_level"] == "high"
    assert data["summary"]["crisis_flag"] is True
    assert calls["summary_crisis_flag"] is True
    assert calls["history"][0].role == "user"

    messages_response = client.get(f"/api/cases/{case_id}/sessions/session-1/messages")
    assert messages_response.status_code == 200
    messages = messages_response.json()
    assert [message["role"] for message in messages] == ["user", "assistant"]
    assert [message["turn_number"] for message in messages] == [1, 1]
    assert all("round" not in message for message in messages)

    summaries_response = client.get(f"/api/cases/{case_id}/sessions/session-1/summaries")
    assert summaries_response.status_code == 200
    summaries = summaries_response.json()
    assert len(summaries) == 1
    assert summaries[0]["turn_number"] == 1
    assert summaries[0]["crisis_flag"] is True
    assert summaries[0]["summary"]["crisis_flag"] is True
    assert "summary_json" not in summaries[0]
    assert "round" not in summaries[0]


def test_conversation_turn_missing_case_returns_404(client):
    response = client.post(
        "/api/conversation/turn",
        json={
            "case_id": "missing-case",
            "session_id": "session-1",
            "turn_number": 1,
            "user_input": "hello",
            "conversation_history": [],
        },
    )

    assert response.status_code == 404


def test_list_case_sessions_returns_derived_metadata(client, monkeypatch):
    case_id = _create_case(client)

    async def fake_generate_response(user_input, conversation_history):
        return ConversationResponse(
            content="SYNTHETIC_ASSISTANT_REPLY",
            is_safe=True,
            warning=None,
        )

    async def fake_detect_crisis(user_input):
        return CrisisDetectionResult(
            crisis_flag=True,
            crisis_level="high",
            reason="SYNTHETIC_CRISIS_REASON_SHOULD_NOT_LEAK",
        )

    async def fake_generate_summary(turn_number, user_input, assistant_response, crisis_flag):
        return TurnSummary(
            turn_number=turn_number,
            emotion=EmotionDetail(primary="焦慮", intensity=6),
            emotion_dimensions=EmotionDimensions(anxiety=6),
            themes=["SYNTHETIC_THEME_SHOULD_NOT_LEAK"],
            key_statement="SYNTHETIC_KEY_STATEMENT_SHOULD_NOT_LEAK",
            crisis_flag=crisis_flag,
        )

    monkeypatch.setattr("routers.conversation.generate_response", fake_generate_response)
    monkeypatch.setattr("routers.conversation.detect_crisis", fake_detect_crisis)
    monkeypatch.setattr("routers.conversation.generate_summary", fake_generate_summary)

    turn_response = client.post(
        "/api/conversation/turn",
        json={
            "case_id": case_id,
            "session_id": "session-1",
            "turn_number": 3,
            "user_input": "SYNTHETIC_PRIVATE_MESSAGE_SHOULD_NOT_LEAK",
            "conversation_history": [],
        },
    )
    assert turn_response.status_code == 200

    response = client.get(f"/api/cases/{case_id}/sessions")

    assert response.status_code == 200
    sessions = response.json()
    assert len(sessions) == 1
    assert sessions[0]["session_id"] == "session-1"
    assert sessions[0]["message_count"] == 2
    assert sessions[0]["summary_count"] == 1
    assert sessions[0]["last_turn_number"] == 3
    assert sessions[0]["has_crisis"] is True
    assert sessions[0]["latest_summary_preview"] == "第 3 輪 · 主要情緒：焦慮 · 強度 6/10"

    serialized = str(sessions)
    assert "round" not in serialized
    assert "summary_json" not in serialized
    assert "SYNTHETIC_PRIVATE_MESSAGE_SHOULD_NOT_LEAK" not in serialized
    assert "SYNTHETIC_KEY_STATEMENT_SHOULD_NOT_LEAK" not in serialized
    assert "SYNTHETIC_CRISIS_REASON_SHOULD_NOT_LEAK" not in serialized


def test_list_case_sessions_existing_case_with_no_sessions_returns_empty_list(client):
    case_id = _create_case(client)

    response = client.get(f"/api/cases/{case_id}/sessions")

    assert response.status_code == 200
    assert response.json() == []


def test_list_case_sessions_missing_case_returns_404(client):
    response = client.get("/api/cases/missing-case/sessions")

    assert response.status_code == 404


def test_list_case_sessions_db_failure_returns_generic_500(client, monkeypatch):
    case_id = _create_case(client)

    async def fail_get_session_metadata_by_case(case_id):
        raise RuntimeError(
            "SYNTHETIC_INTERNAL_SECRET summary_json round key_statement crisis reason"
        )

    monkeypatch.setattr(
        "routers.conversation.get_session_metadata_by_case",
        fail_get_session_metadata_by_case,
        raising=False,
    )

    response = client.get(f"/api/cases/{case_id}/sessions")

    assert response.status_code == 500
    assert response.json() == {"detail": "Failed to list sessions"}
    assert "SYNTHETIC_INTERNAL_SECRET" not in response.text
    assert "summary_json" not in response.text
    assert "key_statement" not in response.text
    assert "crisis reason" not in response.text
    assert "round" not in response.text
