from __future__ import annotations

import anyio
import pytest

import backend.agents.crisis_agent as crisis_agent
from backend.tests.helpers import FakeLLMClient


def _detect(text: str):
    return anyio.run(crisis_agent.detect_crisis, text)


def test_detect_crisis_uses_valid_fake_json_response(monkeypatch):
    fake_client = FakeLLMClient(
        content='{"crisis_flag": true, "crisis_level": "low", "reason": "mocked"}'
    )
    monkeypatch.setattr(crisis_agent, "get_llm_client", fake_client)

    result = _detect("我真的好累")

    assert result.crisis_flag is True
    assert result.crisis_level == "low"
    assert result.reason == "mocked"
    assert fake_client.calls[0]["provider"] == "groq"
    assert fake_client.create_calls[0]["response_format"] == {"type": "json_object"}


def test_detect_crisis_invalid_json_falls_back_to_heuristics(monkeypatch):
    fake_client = FakeLLMClient(content="not json")
    monkeypatch.setattr(crisis_agent, "get_llm_client", fake_client)

    result = _detect("我不想活了，已經想好怎麼做了")

    assert result.crisis_flag is True
    assert result.crisis_level == "high"
    assert "LLM fallback" in result.reason


def test_detect_crisis_provider_exception_falls_back_to_heuristics(monkeypatch):
    fake_client = FakeLLMClient(exc=RuntimeError("provider down"))
    monkeypatch.setattr(crisis_agent, "get_llm_client", fake_client)

    result = _detect("我撐不下去了")

    assert result.crisis_flag is True
    assert result.crisis_level == "low"
    assert "RuntimeError" in result.reason


def test_detect_crisis_invalid_level_normalizes_to_low(monkeypatch):
    fake_client = FakeLLMClient(
        content='{"crisis_flag": true, "crisis_level": "urgent", "reason": "bad level"}'
    )
    monkeypatch.setattr(crisis_agent, "get_llm_client", fake_client)

    result = _detect("我很痛苦")

    assert result.crisis_flag is True
    assert result.crisis_level == "low"


@pytest.mark.parametrize(
    ("content", "expected_flag", "expected_level"),
    [
        (
            '{"crisis_flag": false, "crisis_level": "high", "reason": "contradiction"}',
            True,
            "high",
        ),
        (
            '{"crisis_flag": true, "crisis_level": "none", "reason": "contradiction"}',
            True,
            "low",
        ),
    ],
)
def test_detect_crisis_repairs_contradictory_model_output(
    monkeypatch,
    content,
    expected_flag,
    expected_level,
):
    fake_client = FakeLLMClient(content=content)
    monkeypatch.setattr(crisis_agent, "get_llm_client", fake_client)

    result = _detect("測試文字")

    assert result.crisis_flag is expected_flag
    assert result.crisis_level == expected_level


@pytest.mark.parametrize(
    ("text", "expected_flag", "expected_level"),
    [
        ("我不想活了，已經想好怎麼做了", True, "high"),
        ("我真的好累，覺得沒有希望", True, "low"),
        ("", False, "none"),
    ],
)
def test_detect_crisis_fallback_heuristics(monkeypatch, text, expected_flag, expected_level):
    fake_client = FakeLLMClient(exc=RuntimeError("force fallback"))
    monkeypatch.setattr(crisis_agent, "get_llm_client", fake_client)

    result = _detect(text)

    assert result.crisis_flag is expected_flag
    assert result.crisis_level == expected_level
