from __future__ import annotations

import anyio
import pytest

import backend.agents.crisis_agent as crisis_agent
from backend.tests.helpers import FakeLLMClient


def _detect(text: str):
    return anyio.run(crisis_agent.detect_crisis, text)


def _system_prompt_from(fake_client: FakeLLMClient) -> str:
    return fake_client.create_calls[0]["messages"][0]["content"]


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


def test_detect_crisis_prompt_requires_speaker_attribution(monkeypatch):
    fake_client = FakeLLMClient(
        content='{"crisis_flag": false, "crisis_level": "none", "reason": "第三方情緒反應，未見目前說話者危機"}'
    )
    monkeypatch.setattr(crisis_agent, "get_llm_client", fake_client)

    result = _detect("我是媽媽，我女兒最近眼眶紅紅的，一直哭，回家都不說話。")

    assert result.crisis_flag is False
    assert result.crisis_level == "none"
    prompt = _system_prompt_from(fake_client)
    assert "說話者本人" in prompt
    assert "第三人稱" in prompt
    assert "照顧者" in prompt
    assert "引述" in prompt
    assert "歸因不確定" in prompt
    assert "第三方情緒反應" in prompt
    assert "不應自動" in prompt


def test_detect_crisis_prompt_preserves_uncertainty_for_quoted_third_party(monkeypatch):
    fake_client = FakeLLMClient(
        content='{"crisis_flag": true, "crisis_level": "low", "reason": "引述第三方困擾語句，歸因不確定，需諮商師確認"}'
    )
    monkeypatch.setattr(crisis_agent, "get_llm_client", fake_client)

    result = _detect("媽媽說女兒說：「我真的撐不下去了。」")

    assert result.crisis_flag is True
    assert result.crisis_level == "low"
    assert "第三方" in result.reason
    assert "歸因不確定" in result.reason
    prompt = _system_prompt_from(fake_client)
    assert "被引述者" in prompt
    assert "目前說話者" in prompt


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
    ("text", "expected_flag", "expected_level", "reason_part"),
    [
        (
            "我是媽媽，我女兒最近眼眶紅紅的，一直哭，回家都不說話。",
            False,
            "none",
            None,
        ),
        (
            "媽媽說女兒說：「我真的撐不下去了。」",
            True,
            "low",
            "歸因不確定",
        ),
        (
            "我覺得活著沒有意義，但沒有計畫，也沒有要傷害自己。",
            True,
            "low",
            None,
        ),
        (
            "我今晚不能保證自己安全，可能會做傻事。",
            True,
            "high",
            None,
        ),
        (
            "我現在想自殺，而且已經想好方法了。",
            True,
            "high",
            None,
        ),
        (
            "我腦中一直有句話：「我想自殺。」",
            True,
            "high",
            None,
        ),
    ],
)
def test_detect_crisis_fallback_speaker_attribution_and_risk_levels(
    monkeypatch,
    text,
    expected_flag,
    expected_level,
    reason_part,
):
    fake_client = FakeLLMClient(exc=RuntimeError("force fallback"))
    monkeypatch.setattr(crisis_agent, "get_llm_client", fake_client)

    result = _detect(text)

    assert result.crisis_flag is expected_flag
    assert result.crisis_level == expected_level
    if reason_part is not None:
        assert reason_part in result.reason


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
