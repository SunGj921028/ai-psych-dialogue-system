from __future__ import annotations

import anyio

import backend.agents.analysis_agent as analysis_agent
from backend.agents.analysis_agent import DISCLAIMER_TEXT, ConceptualizationReport
from backend.agents.summary_agent import EmotionDetail, EmotionDimensions, TurnSummary
from models.report_schema_v2 import ReportAIGeneratedV2, ReportManualInputV2, ReportSourceType
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


def test_generate_report_v2_ai_draft_returns_conservative_schema_without_provider(
    monkeypatch,
):
    def fail_if_provider_is_requested(provider):
        raise AssertionError(f"provider should not be requested: {provider}")

    monkeypatch.setattr(analysis_agent, "get_llm_client", fail_if_provider_is_requested)

    async def run_v2_draft():
        return await analysis_agent.generate_report_v2_ai_draft(
            case_id="case-1",
            session_id="session-1",
            summaries=[
                {
                    "id": "summary-1",
                    "turn_number": 1,
                    "summary": make_turn_summary(1, 5).model_dump(),
                    "crisis_level": "none",
                }
            ],
            manual_input=ReportManualInputV2(),
        )

    result = anyio.run(run_v2_draft)

    assert isinstance(result, ReportAIGeneratedV2)
    payload = result.model_dump(mode="json")
    encoded = str(payload)
    assert "formal_diagnosis_notes" not in encoded
    assert "medication" not in encoded
    assert "safety_plan" not in encoded
    assert "legal" not in encoded


def test_report_v2_prompt_payload_includes_safety_policies_and_shaped_sources():
    long_key_statement = "壓力" * 120
    manual_input = ReportManualInputV2()
    manual_input.basic_info.referral_source.value = "學校轉介"
    manual_input.basic_info.referral_source.source_type = ReportSourceType.MANUAL

    payload = analysis_agent._build_report_v2_prompt_payload(
        case_id="case-1",
        session_id="session-1",
        summaries=[
            {
                "id": "summary-1",
                "turn_number": 2,
                "round": 999,
                "session_title": "should not be clinical evidence",
                "raw_messages": ["raw message should not pass through"],
                "crisis_reason": "private crisis reason",
                "summary": {
                    "turn_number": 2,
                    "emotion": {"primary": "焦慮", "intensity": 8},
                    "emotion_dimensions": {"anxiety": 8, "sadness": 3},
                    "themes": ["工作壓力"],
                    "key_statement": long_key_statement,
                    "crisis_flag": True,
                },
                "crisis_level": "low",
            }
        ],
        manual_input=manual_input,
    )

    encoded = str(payload)
    assert payload["prompt_version"] == analysis_agent.REPORT_V2_PROMPT_VERSION
    assert "一、基本資料與主訴" in encoded
    assert "五、風險評估" in encoded
    assert "chief_complaint_draft" in encoded
    assert "formal_diagnosis_notes" in encoded
    assert "source data" in encoded
    assert "待評估" in encoded
    assert "學校轉介" in encoded
    assert payload["source_data"]["summaries"][0]["summary_id"] == "summary-1"
    assert payload["source_data"]["summaries"][0]["turn_number"] == 2
    assert payload["source_data"]["summaries"][0]["crisis_level"] == "low"
    assert len(payload["source_data"]["summaries"][0]["key_statement"]) <= (
        analysis_agent.REPORT_V2_MAX_KEY_STATEMENT_CHARS + 3
    )
    assert "raw message should not pass through" not in encoded
    assert "private crisis reason" not in encoded
    assert "should not be clinical evidence" not in encoded
    assert "'round'" not in encoded


def test_report_v2_messages_include_json_only_and_evidence_ref_rules():
    messages = analysis_agent._build_report_v2_messages(
        analysis_agent._build_report_v2_prompt_payload(
            case_id="case-1",
            session_id="session-1",
            summaries=[],
            manual_input=ReportManualInputV2(),
        )
    )

    encoded = "\n".join(message["content"] for message in messages)
    assert messages[0]["role"] == "system"
    assert messages[1]["role"] == "user"
    assert "只輸出 JSON" in encoded
    assert "ReportAIGeneratedV2" in encoded
    assert "summary metadata" in encoded
    assert "manual input" in encoded
    assert "persisted crisis level" in encoded
    assert "不得填寫診斷" in encoded


def test_parse_report_v2_provider_output_accepts_valid_json_with_safe_evidence_refs():
    raw = {
        "chief_complaint_draft": {
            "label_zh": "主訴摘要",
            "value": "可能與工作壓力相關，尚待確認。",
            "source_type": "ai",
            "missing_reason": None,
            "needs_review": True,
            "evidence_refs": [
                {
                    "turn_number": 1,
                    "summary_id": "summary-1",
                    "note": "summary metadata",
                }
            ],
        }
    }

    result = analysis_agent._parse_report_v2_provider_output(raw)

    assert isinstance(result, ReportAIGeneratedV2)
    assert result.chief_complaint_draft.value == "可能與工作壓力相關，尚待確認。"
    assert result.chief_complaint_draft.evidence_refs[0].note == "summary metadata"


def test_parse_report_v2_provider_output_rejects_invalid_or_unsafe_output():
    invalid_cases = [
        "not json",
        "[1, 2, 3]",
        {
            "formal_diagnosis_notes": {
                "label_zh": "診斷相關備註",
                "value": "AI must not fill this",
                "source_type": "ai",
            }
        },
        {
            "chief_complaint_draft": {
                "label_zh": "主訴摘要",
                "value": "可能與壓力相關。",
                "source_type": "ai",
                "evidence_refs": [
                    {
                        "turn_number": 1,
                        "summary_id": "summary-1",
                        "note": "個案原話或摘要摘錄不應放在 evidence note",
                    }
                ],
            }
        },
    ]

    for raw in invalid_cases:
        try:
            analysis_agent._parse_report_v2_provider_output(raw)
        except ValueError:
            continue
        raise AssertionError(f"unsafe provider output should fail: {raw!r}")


def test_call_report_v2_provider_boundary_does_not_call_live_provider():
    async def run_provider_boundary():
        return await analysis_agent._call_report_v2_provider(
            [{"role": "system", "content": "unused"}]
        )

    try:
        anyio.run(run_provider_boundary)
    except NotImplementedError:
        return
    raise AssertionError("provider boundary should not be implemented in this slice")


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
