from __future__ import annotations

import anyio

import backend.agents.analysis_agent as analysis_agent
from backend.agents.analysis_agent import DISCLAIMER_TEXT, ConceptualizationReport
from backend.agents.summary_agent import EmotionDetail, EmotionDimensions, TurnSummary
from backend.tests.helpers import FakeLLMClient


def make_turn_summary(
    turn_number: int,
    intensity: int,
    *,
    crisis_flag: bool = False,
    primary: str = "焦慮",
) -> TurnSummary:
    return TurnSummary(
        turn_number=turn_number,
        emotion=EmotionDetail(primary=primary, intensity=intensity),
        emotion_dimensions=EmotionDimensions(
            anxiety=intensity,
            sadness=2,
            anger=1,
            hopelessness=4,
            confusion=3,
            hope=2,
        ),
        themes=["工作壓力"],
        key_statement=f"第 {turn_number} 輪關鍵陳述",
        crisis_flag=crisis_flag,
    )


def _generate_report(summaries: list[TurnSummary]):
    return anyio.run(
        analysis_agent.generate_report,
        "case-1",
        "session-1",
        summaries,
    )


def test_generate_report_with_insufficient_summaries_does_not_call_provider(
    monkeypatch,
):
    monkeypatch.setenv("MIN_TURNS_FOR_REPORT", "3")
    fake_client = FakeLLMClient(
        content='{"chief_complaint": "provider should not be called"}'
    )
    monkeypatch.setattr(analysis_agent, "get_llm_client", fake_client)

    result = _generate_report(
        [
            make_turn_summary(1, 4),
            make_turn_summary(2, 8, crisis_flag=True),
        ]
    )

    assert fake_client.calls == []
    assert fake_client.create_calls == []
    assert isinstance(result, ConceptualizationReport)
    assert result.chief_complaint.startswith("對話輪次不足")
    assert result.emotion_pattern.peak_turn == 2
    assert result.has_crisis is True
    assert result.disclaimer == DISCLAIMER_TEXT


def test_generate_report_uses_valid_provider_json_and_code_owned_disclaimer(
    monkeypatch,
):
    fake_client = FakeLLMClient(
        content="""
        {
          "chief_complaint": "可能與工作壓力及睡眠困擾有關",
          "emotion_pattern": {
            "description": "焦慮感反覆出現",
            "dominant_emotions": ["焦慮", "困惑"],
            "intensity_trend": "fluctuating",
            "peak_turn": 999
          },
          "cognitive_behavioral_analysis": "可能有自我要求與壓力循環",
          "initial_conceptualization": "初步觀察需由諮商師確認",
          "suggested_directions": ["認知行為治療（CBT）"],
          "crisis_summary": "本次摘要未顯示危機",
          "disclaimer": "provider supplied disclaimer should not win",
          "has_crisis": true
        }
        """
    )
    monkeypatch.setattr(analysis_agent, "get_llm_client", fake_client)

    result = _generate_report(
        [
            make_turn_summary(1, 4),
            make_turn_summary(2, 7),
            make_turn_summary(3, 5),
        ]
    )

    assert isinstance(result, ConceptualizationReport)
    assert result.chief_complaint == "可能與工作壓力及睡眠困擾有關"
    assert result.emotion_pattern.description == "焦慮感反覆出現"
    assert result.emotion_pattern.peak_turn == 2
    assert result.has_crisis is False
    assert result.disclaimer == DISCLAIMER_TEXT
    assert fake_client.calls[0]["provider"] == "gemini"
    assert fake_client.create_calls[0]["response_format"] == {"type": "json_object"}


def test_generate_report_has_crisis_is_code_owned(monkeypatch):
    fake_client = FakeLLMClient(
        content="""
        {
          "chief_complaint": "壓力與無助感",
          "emotion_pattern": {
            "description": "強度偏高",
            "dominant_emotions": ["無助"],
            "intensity_trend": "ascending"
          },
          "cognitive_behavioral_analysis": "",
          "initial_conceptualization": "",
          "suggested_directions": [],
          "crisis_summary": "provider says no crisis",
          "has_crisis": false
        }
        """
    )
    monkeypatch.setattr(analysis_agent, "get_llm_client", fake_client)

    result = _generate_report(
        [
            make_turn_summary(1, 4),
            make_turn_summary(2, 6, crisis_flag=True),
            make_turn_summary(3, 5),
        ]
    )

    assert result.has_crisis is True
    assert result.disclaimer == DISCLAIMER_TEXT


def test_generate_report_peak_turn_is_code_owned(monkeypatch):
    fake_client = FakeLLMClient(
        content="""
        {
          "chief_complaint": "壓力變化",
          "emotion_pattern": {
            "description": "強度起伏",
            "dominant_emotions": ["焦慮"],
            "intensity_trend": "fluctuating",
            "peak_turn": 1
          },
          "cognitive_behavioral_analysis": "",
          "initial_conceptualization": "",
          "suggested_directions": [],
          "crisis_summary": ""
        }
        """
    )
    monkeypatch.setattr(analysis_agent, "get_llm_client", fake_client)

    result = _generate_report(
        [
            make_turn_summary(1, 2),
            make_turn_summary(2, 10),
            make_turn_summary(3, 6),
        ]
    )

    assert result.emotion_pattern.peak_turn == 2


def test_generate_report_malformed_provider_json_returns_generation_failed_fallback(
    monkeypatch,
):
    fake_client = FakeLLMClient(content="not json")
    monkeypatch.setattr(analysis_agent, "get_llm_client", fake_client)

    result = _generate_report(
        [
            make_turn_summary(1, 3),
            make_turn_summary(2, 9, crisis_flag=True),
            make_turn_summary(3, 6),
        ]
    )

    assert result.chief_complaint == "報告生成失敗，請重試"
    assert result.emotion_pattern.peak_turn == 2
    assert result.has_crisis is True
    assert result.disclaimer == DISCLAIMER_TEXT


def test_generate_report_provider_exception_returns_generation_failed_fallback(
    monkeypatch,
):
    fake_client = FakeLLMClient(exc=RuntimeError("provider down"))
    monkeypatch.setattr(analysis_agent, "get_llm_client", fake_client)

    result = _generate_report(
        [
            make_turn_summary(1, 3),
            make_turn_summary(2, 5),
            make_turn_summary(3, 8),
        ]
    )

    assert result.chief_complaint == "報告生成失敗，請重試"
    assert result.emotion_pattern.peak_turn == 3
    assert result.has_crisis is False
    assert result.disclaimer == DISCLAIMER_TEXT
