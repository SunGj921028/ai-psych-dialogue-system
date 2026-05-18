from __future__ import annotations

import json

import anyio

import agents.analysis_agent as analysis_agent
from agents.analysis_agent import DISCLAIMER_TEXT
from agents.conversation_agent import ConversationResponse
from agents.crisis_agent import CrisisDetectionResult
from agents.summary_agent import EmotionDetail, EmotionDimensions, TurnSummary
from backend.tests.helpers import FakeLLMClient
from database.db import add_summary


def _create_case(client) -> str:
    response = client.post("/api/cases", json={"code_name": "A001"})
    assert response.status_code == 200
    return response.json()["id"]


def _assert_response_does_not_leak(response, *tokens: str) -> None:
    body = response.text
    for token in tokens:
        assert token not in body
    assert "round" not in body
    assert "summary_json" not in body


def _make_turn_summary(
    turn_number: int,
    intensity: int,
    *,
    crisis_flag: bool = False,
) -> TurnSummary:
    return TurnSummary(
        turn_number=turn_number,
        emotion=EmotionDetail(primary="anxiety", intensity=intensity),
        emotion_dimensions=EmotionDimensions(
            anxiety=intensity,
            sadness=2,
            anger=1,
            hopelessness=4,
            confusion=3,
            hope=2,
        ),
        themes=["work stress"],
        key_statement=f"synthetic statement {turn_number}",
        crisis_flag=crisis_flag,
    )


def test_create_case_db_failure_returns_generic_500(client, monkeypatch):
    exception_text = "CREATE_CASE_SECRET_EXCEPTION"

    async def fake_create_case(code_name, note=None):
        raise RuntimeError(exception_text)

    monkeypatch.setattr("routers.cases.create_case", fake_create_case)

    response = client.post(
        "/api/cases",
        json={"code_name": "A001", "note": "synthetic note"},
    )

    assert response.status_code == 500
    _assert_response_does_not_leak(response, exception_text)


def test_conversation_missing_case_does_not_call_agents(client, monkeypatch):
    calls = {"generate_response": 0, "detect_crisis": 0, "generate_summary": 0}

    async def fake_generate_response(user_input, conversation_history):
        calls["generate_response"] += 1
        return ConversationResponse(content="unused", is_safe=True, warning=None)

    async def fake_detect_crisis(user_input):
        calls["detect_crisis"] += 1
        return CrisisDetectionResult(
            crisis_flag=False,
            crisis_level="none",
            reason="unused",
        )

    async def fake_generate_summary(turn_number, user_input, assistant_response, crisis_flag):
        calls["generate_summary"] += 1
        return _make_turn_summary(turn_number, 1, crisis_flag=crisis_flag)

    monkeypatch.setattr("routers.conversation.generate_response", fake_generate_response)
    monkeypatch.setattr("routers.conversation.detect_crisis", fake_detect_crisis)
    monkeypatch.setattr("routers.conversation.generate_summary", fake_generate_summary)

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
    assert calls == {"generate_response": 0, "detect_crisis": 0, "generate_summary": 0}


def test_conversation_invalid_turn_number_does_not_call_agents(client, monkeypatch):
    calls = {"generate_response": 0, "detect_crisis": 0, "generate_summary": 0}

    async def fake_generate_response(user_input, conversation_history):
        calls["generate_response"] += 1
        return ConversationResponse(content="unused", is_safe=True, warning=None)

    async def fake_detect_crisis(user_input):
        calls["detect_crisis"] += 1
        return CrisisDetectionResult(
            crisis_flag=False,
            crisis_level="none",
            reason="unused",
        )

    async def fake_generate_summary(turn_number, user_input, assistant_response, crisis_flag):
        calls["generate_summary"] += 1
        return _make_turn_summary(turn_number, 1, crisis_flag=crisis_flag)

    monkeypatch.setattr("routers.conversation.generate_response", fake_generate_response)
    monkeypatch.setattr("routers.conversation.detect_crisis", fake_detect_crisis)
    monkeypatch.setattr("routers.conversation.generate_summary", fake_generate_summary)

    response = client.post(
        "/api/conversation/turn",
        json={
            "case_id": "missing-case",
            "session_id": "session-1",
            "turn_number": 0,
            "user_input": "hello",
            "conversation_history": [],
        },
    )

    assert response.status_code == 422
    assert calls == {"generate_response": 0, "detect_crisis": 0, "generate_summary": 0}


def test_conversation_persistence_failure_returns_generic_non_leaking_500(
    client,
    monkeypatch,
):
    case_id = _create_case(client)
    sensitive_user_input = "CLIENT_SENSITIVE_RAW_TEXT_DO_NOT_LEAK"
    sensitive_assistant_text = "ASSISTANT_SENSITIVE_TEXT_DO_NOT_LEAK"
    exception_text = "PRIVATE_DB_TRACE_DO_NOT_LEAK"
    calls = {"add_message_contents": [], "generate_summary": 0}

    async def fake_generate_response(user_input, conversation_history):
        return ConversationResponse(
            content=sensitive_assistant_text,
            is_safe=True,
            warning=None,
        )

    async def fake_detect_crisis(user_input):
        return CrisisDetectionResult(
            crisis_flag=False,
            crisis_level="none",
            reason="mocked no crisis",
        )

    async def fake_generate_summary(turn_number, user_input, assistant_response, crisis_flag):
        calls["generate_summary"] += 1
        return _make_turn_summary(turn_number, 3, crisis_flag=crisis_flag)

    async def fake_add_message(case_id, session_id, turn_number, role, content):
        calls["add_message_contents"].append(content)
        raise RuntimeError(exception_text)

    monkeypatch.setattr("routers.conversation.generate_response", fake_generate_response)
    monkeypatch.setattr("routers.conversation.detect_crisis", fake_detect_crisis)
    monkeypatch.setattr("routers.conversation.generate_summary", fake_generate_summary)
    monkeypatch.setattr("routers.conversation.add_message", fake_add_message)

    response = client.post(
        "/api/conversation/turn",
        json={
            "case_id": case_id,
            "session_id": "session-1",
            "turn_number": 1,
            "user_input": sensitive_user_input,
            "conversation_history": [],
        },
    )

    assert response.status_code == 500
    assert calls["add_message_contents"] == [sensitive_user_input]
    assert calls["generate_summary"] == 0
    _assert_response_does_not_leak(
        response,
        sensitive_user_input,
        sensitive_assistant_text,
        exception_text,
    )


def test_session_messages_missing_case_returns_404(client):
    response = client.get("/api/cases/missing-case/sessions/session-1/messages")

    assert response.status_code == 404


def test_session_summaries_missing_case_returns_404(client):
    response = client.get("/api/cases/missing-case/sessions/session-1/summaries")

    assert response.status_code == 404


def test_existing_case_missing_session_returns_empty_message_and_summary_lists(client):
    case_id = _create_case(client)

    messages_response = client.get(f"/api/cases/{case_id}/sessions/missing/messages")
    summaries_response = client.get(f"/api/cases/{case_id}/sessions/missing/summaries")

    assert messages_response.status_code == 200
    assert messages_response.json() == []
    assert summaries_response.status_code == 200
    assert summaries_response.json() == []


def test_report_route_preserves_code_owned_report_fields_with_mocked_llm(
    client,
    monkeypatch,
):
    monkeypatch.setenv("MIN_TURNS_FOR_REPORT", "3")
    case_id = _create_case(client)
    session_id = "session-report"
    summaries = [
        _make_turn_summary(1, 4),
        _make_turn_summary(2, 9, crisis_flag=True),
        _make_turn_summary(3, 6),
    ]

    for summary in summaries:
        anyio.run(
            add_summary,
            case_id,
            session_id,
            summary.turn_number,
            summary.model_dump_json(),
            summary.crisis_flag,
        )

    fake_client = FakeLLMClient(
        content=json.dumps(
            {
                "chief_complaint": "synthetic provider complaint",
                "emotion_pattern": {
                    "description": "synthetic provider pattern",
                    "dominant_emotions": ["sadness"],
                    "intensity_trend": "stable",
                    "peak_turn": 999,
                },
                "cognitive_behavioral_analysis": "synthetic provider analysis",
                "initial_conceptualization": "synthetic provider conceptualization",
                "suggested_directions": ["CBT"],
                "crisis_summary": "synthetic provider crisis summary",
                "disclaimer": "provider supplied disclaimer should not win",
                "has_crisis": False,
            }
        )
    )
    monkeypatch.setattr(analysis_agent, "get_llm_client", fake_client)

    response = client.post(
        "/api/reports/generate",
        json={"case_id": case_id, "session_id": session_id},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["disclaimer"] == DISCLAIMER_TEXT
    assert data["has_crisis"] is True
    assert data["emotion_pattern"]["peak_turn"] == 2
    assert fake_client.calls == [{"provider": "gemini"}]
    assert len(fake_client.create_calls) == 1
