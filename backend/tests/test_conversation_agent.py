from __future__ import annotations

import anyio

import backend.agents.conversation_agent as conversation_agent
from backend.agents.conversation_agent import ConversationMessage
from backend.tests.helpers import FakeLLMClient


DIAGNOSTIC_CONCLUSIONS = (
    "你有憂鬱症",
    "你患有",
    "你的診斷",
    "確診為",
    "你得了",
    "你確定是",
)

MEDICATION_ADVICE = (
    "應該吃藥",
    "建議吃藥",
    "停止服藥",
    "停藥",
    "調整劑量",
    "加藥",
    "減藥",
    "毫克",
    "mg",
)


def _generate(user_input: str, history: list[ConversationMessage] | None = None):
    return anyio.run(
        conversation_agent.generate_response,
        user_input,
        history or [],
    )


def _assert_no_diagnosis_or_medication_advice(text: str) -> None:
    for phrase in DIAGNOSTIC_CONCLUSIONS:
        assert phrase not in text
    for phrase in MEDICATION_ADVICE:
        assert phrase not in text


def test_generate_response_returns_safe_model_output(monkeypatch):
    fake_client = FakeLLMClient(
        content="聽起來你最近承受了很多壓力，也很希望有人能理解。你願意多說一點，這份壓力最常在什麼時候出現嗎？"
    )
    monkeypatch.setattr(conversation_agent, "get_llm_client", fake_client)

    result = _generate("我最近工作壓力很大，常常睡不好")

    assert result.is_safe is True
    assert result.warning is None
    assert "壓力" in result.content
    _assert_no_diagnosis_or_medication_advice(result.content)
    assert fake_client.calls[0]["provider"] == "gemini"


def test_generate_response_replaces_unsafe_diagnostic_model_output(monkeypatch):
    fake_client = FakeLLMClient(content="你有憂鬱症，這就是你的診斷。")
    monkeypatch.setattr(conversation_agent, "get_llm_client", fake_client)

    result = _generate("我最近很低落，是不是生病了？")

    assert result.is_safe is False
    assert result.warning
    assert "你有憂鬱症" not in result.content
    assert "你的診斷" not in result.content
    assert "沒辦法" in result.content


def test_generate_response_provider_failure_returns_conservative_fallback(monkeypatch):
    fake_client = FakeLLMClient(exc=RuntimeError("provider down"))
    monkeypatch.setattr(conversation_agent, "get_llm_client", fake_client)

    result = _generate("我最近工作壓力很大")

    assert result.is_safe is True
    assert result.warning
    assert "fallback" in result.warning
    assert "沒辦法給診斷" in result.content
    _assert_no_diagnosis_or_medication_advice(result.content)


def test_generate_response_diagnosis_request_includes_boundary_warning(monkeypatch):
    fake_client = FakeLLMClient(
        content="聽起來你很想理解自己的狀態。也許可以先從最近最困擾你的感受談起。"
    )
    monkeypatch.setattr(conversation_agent, "get_llm_client", fake_client)

    result = _generate("你可以幫我診斷我是不是有憂鬱症嗎？")

    assert result.is_safe is True
    assert result.warning is not None
    assert "診斷" in result.warning


def test_generate_response_medication_request_includes_boundary_warning(monkeypatch):
    fake_client = FakeLLMClient(
        content="聽起來你對用藥相關問題很擔心。也許可以先談談讓你想調整的原因與感受。"
    )
    monkeypatch.setattr(conversation_agent, "get_llm_client", fake_client)

    result = _generate("我可以自己停藥嗎？劑量要怎麼調？")

    assert result.is_safe is True
    assert result.warning is not None
    assert "用藥" in result.warning or "藥" in result.warning


def test_generate_response_sends_only_recent_history_window(monkeypatch):
    fake_client = FakeLLMClient(content="我聽見你提到新的壓力，我們可以先從最近這件事開始談。")
    monkeypatch.setattr(conversation_agent, "get_llm_client", fake_client)
    monkeypatch.setenv("CONVERSATION_WINDOW_SIZE", "2")
    history = [
        ConversationMessage(role="user", content=f"user-{index}")
        if index % 2 == 0
        else ConversationMessage(role="assistant", content=f"assistant-{index}")
        for index in range(8)
    ]

    result = _generate("current-user", history)

    assert result.is_safe is True
    sent_messages = fake_client.create_calls[0]["messages"]
    assert [message["role"] for message in sent_messages] == [
        "system",
        "user",
        "assistant",
        "user",
        "assistant",
        "user",
    ]
    assert [message["content"] for message in sent_messages[1:]] == [
        "user-4",
        "assistant-5",
        "user-6",
        "assistant-7",
        "current-user",
    ]


def test_generate_response_uses_600_default_max_tokens_when_unset(monkeypatch):
    fake_client = FakeLLMClient(content="I hear how much this has been weighing on you.")
    monkeypatch.setattr(conversation_agent, "get_llm_client", fake_client)
    monkeypatch.delenv("CONVERSATION_MAX_TOKENS", raising=False)

    result = _generate("current-user")

    assert result.is_safe is True
    assert fake_client.create_calls[0]["max_tokens"] == 600


def test_generate_response_respects_valid_max_tokens_override(monkeypatch):
    fake_client = FakeLLMClient(content="I hear how much this has been weighing on you.")
    monkeypatch.setattr(conversation_agent, "get_llm_client", fake_client)
    monkeypatch.setenv("CONVERSATION_MAX_TOKENS", "725")

    result = _generate("current-user")

    assert result.is_safe is True
    assert fake_client.create_calls[0]["max_tokens"] == 725


def test_generate_response_falls_back_to_600_for_invalid_max_tokens(monkeypatch):
    fake_client = FakeLLMClient(content="I hear how much this has been weighing on you.")
    monkeypatch.setattr(conversation_agent, "get_llm_client", fake_client)
    monkeypatch.setenv("CONVERSATION_MAX_TOKENS", "not-a-number")

    result = _generate("current-user")

    assert result.is_safe is True
    assert fake_client.create_calls[0]["max_tokens"] == 600


def test_generate_response_clamps_non_positive_max_tokens_safely(monkeypatch):
    fake_client = FakeLLMClient(content="I hear how much this has been weighing on you.")
    monkeypatch.setattr(conversation_agent, "get_llm_client", fake_client)
    monkeypatch.setenv("CONVERSATION_MAX_TOKENS", "0")

    result = _generate("current-user")

    assert result.is_safe is True
    assert fake_client.create_calls[0]["max_tokens"] == 1
