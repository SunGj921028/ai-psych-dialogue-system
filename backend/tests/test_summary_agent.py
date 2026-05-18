from __future__ import annotations

import anyio
import pytest

import backend.agents.summary_agent as summary_agent
from backend.tests.helpers import FakeLLMClient


def _summarize(
    *,
    turn_number: int = 1,
    user_input: str = "我最近工作壓力很大",
    assistant_response: str = "聽起來你承受了很多壓力。",
    crisis_flag: bool = False,
):
    return anyio.run(
        summary_agent.generate_summary,
        turn_number,
        user_input,
        assistant_response,
        crisis_flag,
    )


def test_generate_summary_uses_valid_fake_json_response(monkeypatch):
    fake_client = FakeLLMClient(
        content="""
        {
          "turn_number": 99,
          "emotion": {"primary": "焦慮", "intensity": 7},
          "emotion_dimensions": {
            "anxiety": 7,
            "sadness": 3,
            "anger": 1,
            "hopelessness": 4,
            "confusion": 5,
            "hope": 2
          },
          "themes": ["工作壓力", "睡眠"],
          "key_statement": "我最近工作壓力很大",
          "crisis_flag": true
        }
        """
    )
    monkeypatch.setattr(summary_agent, "get_llm_client", fake_client)

    result = _summarize(turn_number=2, crisis_flag=False)

    assert result.turn_number == 2
    assert result.emotion.primary == "焦慮"
    assert result.emotion.intensity == 7
    assert result.emotion_dimensions.anxiety == 7
    assert result.themes == ["工作壓力", "睡眠"]
    assert result.key_statement == "我最近工作壓力很大"
    assert result.crisis_flag is False
    assert fake_client.calls[0]["provider"] == "groq"
    assert fake_client.create_calls[0]["response_format"] == {"type": "json_object"}


def test_generate_summary_clamps_emotion_scores(monkeypatch):
    fake_client = FakeLLMClient(
        content="""
        {
          "turn_number": 1,
          "emotion": {"primary": "焦慮", "intensity": 99},
          "emotion_dimensions": {
            "anxiety": 99,
            "sadness": -4,
            "anger": "8",
            "hopelessness": "bad",
            "confusion": 11,
            "hope": null
          },
          "themes": ["壓力"],
          "key_statement": "我覺得很累",
          "crisis_flag": false
        }
        """
    )
    monkeypatch.setattr(summary_agent, "get_llm_client", fake_client)

    result = _summarize()

    assert result.emotion.intensity == 10
    assert result.emotion_dimensions.anxiety == 10
    assert result.emotion_dimensions.sadness == 0
    assert result.emotion_dimensions.anger == 8
    assert result.emotion_dimensions.hopelessness == 0
    assert result.emotion_dimensions.confusion == 10
    assert result.emotion_dimensions.hope == 0


@pytest.mark.parametrize("themes", ['"not a list"', "[]"])
def test_generate_summary_normalizes_invalid_or_empty_themes(monkeypatch, themes):
    fake_client = FakeLLMClient(
        content=f"""
        {{
          "turn_number": 1,
          "emotion": {{"primary": "焦慮", "intensity": 5}},
          "emotion_dimensions": {{"anxiety": 5}},
          "themes": {themes},
          "key_statement": "我覺得很累",
          "crisis_flag": false
        }}
        """
    )
    monkeypatch.setattr(summary_agent, "get_llm_client", fake_client)

    result = _summarize()

    assert result.themes == ["待補充"]


def test_generate_summary_uses_key_statement_fallback_for_empty_value(monkeypatch):
    fake_client = FakeLLMClient(
        content="""
        {
          "turn_number": 1,
          "emotion": {"primary": "焦慮", "intensity": 5},
          "emotion_dimensions": {"anxiety": 5},
          "themes": ["壓力"],
          "key_statement": "   ",
          "crisis_flag": false
        }
        """
    )
    monkeypatch.setattr(summary_agent, "get_llm_client", fake_client)

    result = _summarize()

    assert result.key_statement == "（未擷取到代表性陳述）"


@pytest.mark.parametrize(
    ("external_flag", "model_flag"),
    [(True, "false"), (False, "true")],
)
def test_generate_summary_external_crisis_flag_wins(monkeypatch, external_flag, model_flag):
    fake_client = FakeLLMClient(
        content=f"""
        {{
          "turn_number": 1,
          "emotion": {{"primary": "焦慮", "intensity": 6}},
          "emotion_dimensions": {{"anxiety": 6}},
          "themes": ["壓力"],
          "key_statement": "我覺得很累",
          "crisis_flag": {model_flag}
        }}
        """
    )
    monkeypatch.setattr(summary_agent, "get_llm_client", fake_client)

    result = _summarize(crisis_flag=external_flag)

    assert result.crisis_flag is external_flag


@pytest.mark.parametrize(
    "fake_client",
    [
        FakeLLMClient(content="not json"),
        FakeLLMClient(exc=RuntimeError("provider down")),
    ],
)
def test_generate_summary_malformed_json_or_provider_failure_returns_fallback(
    monkeypatch,
    fake_client,
):
    monkeypatch.setattr(summary_agent, "get_llm_client", fake_client)

    result = _summarize(
        turn_number=3,
        user_input="我不想活了",
        assistant_response="我聽到了。",
        crisis_flag=True,
    )

    assert result.turn_number == 3
    assert result.emotion.primary == "未知"
    assert result.themes == ["待補充"]
    assert result.key_statement == "我不想活了"
    assert result.crisis_flag is True
