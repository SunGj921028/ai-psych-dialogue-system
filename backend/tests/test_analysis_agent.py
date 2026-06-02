from __future__ import annotations

import anyio
import json

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
    monkeypatch.delenv("REPORT_V2_PROVIDER_MODE", raising=False)

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


def test_generate_report_v2_ai_draft_explicit_deterministic_mode_does_not_call_provider(
    monkeypatch,
):
    monkeypatch.setenv("REPORT_V2_PROVIDER_MODE", "deterministic")

    async def fail_if_provider_is_requested(*args, **kwargs):
        raise AssertionError("provider boundary should not be called")

    monkeypatch.setattr(
        analysis_agent,
        "_call_report_v2_provider",
        fail_if_provider_is_requested,
    )

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
    assert result.chief_complaint_draft.value is None


def test_generate_report_v2_ai_draft_provider_mode_calls_boundary_and_parses_json(
    monkeypatch,
):
    monkeypatch.setenv("REPORT_V2_PROVIDER_MODE", "provider")
    monkeypatch.setenv("REPORT_V2_MODEL", "report-v2-test-model")
    calls = {}

    async def fake_call_report_v2_provider(messages, *, provider, model):
        calls["messages"] = messages
        calls["provider"] = provider
        calls["model"] = model
        return """
        {
          "chief_complaint_draft": {
            "label_zh": "銝餉迄??",
            "value": "可能與工作壓力相關，仍需諮商師確認。",
            "source_type": "ai",
            "missing_reason": null,
            "needs_review": true,
            "evidence_refs": [
              {
                "turn_number": 1,
                "summary_id": "summary-1",
                "note": "summary metadata"
              }
            ]
          }
        }
        """

    monkeypatch.setattr(
        analysis_agent,
        "_call_report_v2_provider",
        fake_call_report_v2_provider,
    )

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

    assert result.chief_complaint_draft.value == "可能與工作壓力相關，仍需諮商師確認。"
    assert result.chief_complaint_draft.evidence_refs[0].note == "summary metadata"
    assert calls["provider"] == "gemini"
    assert calls["model"] == "report-v2-test-model"
    assert calls["messages"][0]["role"] == "system"
    assert calls["messages"][1]["role"] == "user"


def test_generate_report_v2_ai_draft_provider_mode_defaults_model_from_analysis_model(
    monkeypatch,
):
    monkeypatch.setenv("REPORT_V2_PROVIDER_MODE", "provider")
    monkeypatch.delenv("REPORT_V2_MODEL", raising=False)
    monkeypatch.setenv("ANALYSIS_MODEL", "analysis-model-for-v2")
    calls = {}

    async def fake_call_report_v2_provider(messages, *, provider, model):
        calls["provider"] = provider
        calls["model"] = model
        return {}

    monkeypatch.setattr(
        analysis_agent,
        "_call_report_v2_provider",
        fake_call_report_v2_provider,
    )

    async def run_v2_draft():
        return await analysis_agent.generate_report_v2_ai_draft(
            case_id="case-1",
            session_id="session-1",
            summaries=[],
            manual_input=ReportManualInputV2(),
        )

    result = anyio.run(run_v2_draft)

    assert isinstance(result, ReportAIGeneratedV2)
    assert calls["provider"] == "gemini"
    assert calls["model"] == "analysis-model-for-v2"


def test_generate_report_v2_ai_draft_provider_mode_blank_provider_defaults_to_gemini(
    monkeypatch,
):
    monkeypatch.setenv("REPORT_V2_PROVIDER_MODE", "provider")
    monkeypatch.setenv("REPORT_V2_PROVIDER", "   ")
    monkeypatch.setenv("REPORT_V2_MODEL", "report-v2-explicit-model")
    calls = {}

    async def fake_call_report_v2_provider(messages, *, provider, model):
        calls["provider"] = provider
        calls["model"] = model
        return {}

    monkeypatch.setattr(
        analysis_agent,
        "_call_report_v2_provider",
        fake_call_report_v2_provider,
    )

    async def run_v2_draft():
        return await analysis_agent.generate_report_v2_ai_draft(
            case_id="case-1",
            session_id="session-1",
            summaries=[],
            manual_input=ReportManualInputV2(),
        )

    result = anyio.run(run_v2_draft)

    assert isinstance(result, ReportAIGeneratedV2)
    assert calls == {
        "provider": "gemini",
        "model": "report-v2-explicit-model",
    }


def test_generate_report_v2_ai_draft_provider_mode_explicit_gemini_uses_gemini(
    monkeypatch,
):
    monkeypatch.setenv("REPORT_V2_PROVIDER_MODE", "provider")
    monkeypatch.setenv("REPORT_V2_PROVIDER", "gemini")
    monkeypatch.setenv("REPORT_V2_MODEL", "report-v2-gemini-model")
    calls = {}

    async def fake_call_report_v2_provider(messages, *, provider, model):
        calls["provider"] = provider
        calls["model"] = model
        return {}

    monkeypatch.setattr(
        analysis_agent,
        "_call_report_v2_provider",
        fake_call_report_v2_provider,
    )

    async def run_v2_draft():
        return await analysis_agent.generate_report_v2_ai_draft(
            case_id="case-1",
            session_id="session-1",
            summaries=[],
            manual_input=ReportManualInputV2(),
        )

    result = anyio.run(run_v2_draft)

    assert isinstance(result, ReportAIGeneratedV2)
    assert calls == {
        "provider": "gemini",
        "model": "report-v2-gemini-model",
    }


def test_generate_report_v2_ai_draft_provider_mode_groq_uses_groq_default_model(
    monkeypatch,
):
    monkeypatch.setenv("REPORT_V2_PROVIDER_MODE", "provider")
    monkeypatch.setenv("REPORT_V2_PROVIDER", "groq")
    monkeypatch.delenv("REPORT_V2_MODEL", raising=False)
    monkeypatch.setenv("ANALYSIS_MODEL", "analysis-model-should-not-be-used-for-groq")
    calls = {}

    async def fake_call_report_v2_provider(messages, *, provider, model):
        calls["provider"] = provider
        calls["model"] = model
        return {}

    monkeypatch.setattr(
        analysis_agent,
        "_call_report_v2_provider",
        fake_call_report_v2_provider,
    )

    async def run_v2_draft():
        return await analysis_agent.generate_report_v2_ai_draft(
            case_id="case-1",
            session_id="session-1",
            summaries=[],
            manual_input=ReportManualInputV2(),
        )

    result = anyio.run(run_v2_draft)

    assert isinstance(result, ReportAIGeneratedV2)
    assert calls == {
        "provider": "groq",
        "model": "llama-3.3-70b-versatile",
    }


def test_generate_report_v2_ai_draft_provider_mode_groq_uses_configured_model(
    monkeypatch,
):
    monkeypatch.setenv("REPORT_V2_PROVIDER_MODE", "provider")
    monkeypatch.setenv("REPORT_V2_PROVIDER", "groq")
    monkeypatch.setenv("REPORT_V2_MODEL", "groq-report-v2-model")
    monkeypatch.setenv("ANALYSIS_MODEL", "analysis-model-should-not-be-used-for-groq")
    calls = {}

    async def fake_call_report_v2_provider(messages, *, provider, model):
        calls["provider"] = provider
        calls["model"] = model
        return {}

    monkeypatch.setattr(
        analysis_agent,
        "_call_report_v2_provider",
        fake_call_report_v2_provider,
    )

    async def run_v2_draft():
        return await analysis_agent.generate_report_v2_ai_draft(
            case_id="case-1",
            session_id="session-1",
            summaries=[],
            manual_input=ReportManualInputV2(),
        )

    result = anyio.run(run_v2_draft)

    assert isinstance(result, ReportAIGeneratedV2)
    assert calls == {
        "provider": "groq",
        "model": "groq-report-v2-model",
    }


def test_generate_report_v2_ai_draft_provider_mode_gemini_uses_default_model(
    monkeypatch,
):
    monkeypatch.setenv("REPORT_V2_PROVIDER_MODE", "provider")
    monkeypatch.setenv("REPORT_V2_PROVIDER", "gemini")
    monkeypatch.delenv("REPORT_V2_MODEL", raising=False)
    monkeypatch.delenv("ANALYSIS_MODEL", raising=False)
    calls = {}

    async def fake_call_report_v2_provider(messages, *, provider, model):
        calls["provider"] = provider
        calls["model"] = model
        return {}

    monkeypatch.setattr(
        analysis_agent,
        "_call_report_v2_provider",
        fake_call_report_v2_provider,
    )

    async def run_v2_draft():
        return await analysis_agent.generate_report_v2_ai_draft(
            case_id="case-1",
            session_id="session-1",
            summaries=[],
            manual_input=ReportManualInputV2(),
        )

    result = anyio.run(run_v2_draft)

    assert isinstance(result, ReportAIGeneratedV2)
    assert calls == {
        "provider": "gemini",
        "model": "gemini-2.5-flash",
    }


def test_generate_report_v2_ai_draft_invalid_provider_fails_closed(monkeypatch):
    monkeypatch.setenv("REPORT_V2_PROVIDER_MODE", "provider")
    monkeypatch.setenv("REPORT_V2_PROVIDER", "surprise-provider")

    async def run_v2_draft():
        return await analysis_agent.generate_report_v2_ai_draft(
            case_id="case-1",
            session_id="session-1",
            summaries=[],
            manual_input=ReportManualInputV2(),
        )

    try:
        anyio.run(run_v2_draft)
    except analysis_agent.ReportV2GenerationError as exc:
        assert exc.category == "provider_config"
        assert "surprise-provider" not in str(exc)
        return
    raise AssertionError("invalid report v2 provider should fail closed")


def test_generate_report_v2_ai_draft_provider_mode_invalid_output_fails_closed(
    monkeypatch,
):
    monkeypatch.setenv("REPORT_V2_PROVIDER_MODE", "provider")

    async def fake_call_report_v2_provider(messages, *, provider, model):
        return "not json"

    monkeypatch.setattr(
        analysis_agent,
        "_call_report_v2_provider",
        fake_call_report_v2_provider,
    )

    async def run_v2_draft():
        return await analysis_agent.generate_report_v2_ai_draft(
            case_id="case-1",
            session_id="session-1",
            summaries=[],
            manual_input=ReportManualInputV2(),
        )

    try:
        anyio.run(run_v2_draft)
    except analysis_agent.ReportV2GenerationError as exc:
        assert exc.category == "invalid_provider_json"
        return
    raise AssertionError("invalid provider output should fail closed")


def test_generate_report_v2_ai_draft_provider_config_failure_is_classified(monkeypatch):
    monkeypatch.setenv("REPORT_V2_PROVIDER_MODE", "surprise-provider")

    async def run_v2_draft():
        return await analysis_agent.generate_report_v2_ai_draft(
            case_id="case-1",
            session_id="session-1",
            summaries=[],
            manual_input=ReportManualInputV2(),
        )

    try:
        anyio.run(run_v2_draft)
    except analysis_agent.ReportV2GenerationError as exc:
        assert exc.category == "provider_config"
        assert "surprise-provider" not in str(exc)
        return
    raise AssertionError("invalid provider mode should be classified")


def test_generate_report_v2_ai_draft_provider_api_failure_is_classified(monkeypatch):
    monkeypatch.setenv("REPORT_V2_PROVIDER_MODE", "provider")
    sentinel = "PRIVATE_PROVIDER_EXCEPTION_DO_NOT_LEAK"

    async def fake_call_report_v2_provider(messages, *, provider, model):
        raise RuntimeError(sentinel)

    monkeypatch.setattr(
        analysis_agent,
        "_call_report_v2_provider",
        fake_call_report_v2_provider,
    )

    async def run_v2_draft():
        return await analysis_agent.generate_report_v2_ai_draft(
            case_id="case-1",
            session_id="session-1",
            summaries=[],
            manual_input=ReportManualInputV2(),
        )

    try:
        anyio.run(run_v2_draft)
    except analysis_agent.ReportV2GenerationError as exc:
        assert exc.category == "provider_api_failure"
        assert sentinel not in str(exc)
        return
    raise AssertionError("provider API failure should be classified")


def test_generate_report_v2_ai_draft_invalid_provider_json_is_classified(monkeypatch):
    monkeypatch.setenv("REPORT_V2_PROVIDER_MODE", "provider")
    sentinel = "RAW_PROVIDER_RESPONSE_DO_NOT_LEAK"

    async def fake_call_report_v2_provider(messages, *, provider, model):
        return f"{sentinel}: not json"

    monkeypatch.setattr(
        analysis_agent,
        "_call_report_v2_provider",
        fake_call_report_v2_provider,
    )

    async def run_v2_draft():
        return await analysis_agent.generate_report_v2_ai_draft(
            case_id="case-1",
            session_id="session-1",
            summaries=[],
            manual_input=ReportManualInputV2(),
        )

    try:
        anyio.run(run_v2_draft)
    except analysis_agent.ReportV2GenerationError as exc:
        assert exc.category == "invalid_provider_json"
        assert sentinel not in str(exc)
        return
    raise AssertionError("invalid provider JSON should be classified")


def test_generate_report_v2_ai_draft_schema_validation_failure_is_classified(monkeypatch):
    monkeypatch.setenv("REPORT_V2_PROVIDER_MODE", "provider")

    async def fake_call_report_v2_provider(messages, *, provider, model):
        return {
            "formal_diagnosis_notes": {
                "label_zh": "manual-only",
                "value": "AI must not fill this",
                "source_type": "ai",
            }
        }

    monkeypatch.setattr(
        analysis_agent,
        "_call_report_v2_provider",
        fake_call_report_v2_provider,
    )

    async def run_v2_draft():
        return await analysis_agent.generate_report_v2_ai_draft(
            case_id="case-1",
            session_id="session-1",
            summaries=[],
            manual_input=ReportManualInputV2(),
        )

    try:
        anyio.run(run_v2_draft)
    except analysis_agent.ReportV2GenerationError as exc:
        assert exc.category == "schema_validation_failed"
        return
    raise AssertionError("schema validation failure should be classified")


def test_generate_report_v2_ai_draft_unsafe_evidence_refs_are_classified(monkeypatch):
    monkeypatch.setenv("REPORT_V2_PROVIDER_MODE", "provider")

    async def fake_call_report_v2_provider(messages, *, provider, model):
        return {
            "chief_complaint_draft": {
                "value": "safe draft value",
                "source_type": "ai",
                "evidence_refs": [
                    {
                        "turn_number": 1,
                        "summary_id": "summary-1",
                        "note": "unsafe raw note",
                    }
                ],
            }
        }

    monkeypatch.setattr(
        analysis_agent,
        "_call_report_v2_provider",
        fake_call_report_v2_provider,
    )

    async def run_v2_draft():
        return await analysis_agent.generate_report_v2_ai_draft(
            case_id="case-1",
            session_id="session-1",
            summaries=[],
            manual_input=ReportManualInputV2(),
        )

    try:
        anyio.run(run_v2_draft)
    except analysis_agent.ReportV2GenerationError as exc:
        assert exc.category == "unsafe_evidence_refs"
        return
    raise AssertionError("unsafe evidence refs should be classified")


def test_generate_report_v2_ai_draft_provider_mode_forbidden_fields_fail_closed(
    monkeypatch,
):
    monkeypatch.setenv("REPORT_V2_PROVIDER_MODE", "provider")

    async def fake_call_report_v2_provider(messages, *, provider, model):
        return {
            "formal_diagnosis_notes": {
                "label_zh": "閮箸?賊??酉",
                "value": "AI must not fill diagnosis",
                "source_type": "ai",
            }
        }

    monkeypatch.setattr(
        analysis_agent,
        "_call_report_v2_provider",
        fake_call_report_v2_provider,
    )

    async def run_v2_draft():
        return await analysis_agent.generate_report_v2_ai_draft(
            case_id="case-1",
            session_id="session-1",
            summaries=[],
            manual_input=ReportManualInputV2(),
        )

    try:
        anyio.run(run_v2_draft)
    except analysis_agent.ReportV2GenerationError as exc:
        assert exc.category == "schema_validation_failed"
        return
    raise AssertionError("manual-only provider output should fail closed")


def test_generate_report_v2_ai_draft_provider_exception_propagates_without_fallback(
    monkeypatch,
):
    monkeypatch.setenv("REPORT_V2_PROVIDER_MODE", "provider")
    sentinel = "PRIVATE_PROVIDER_FAILURE_DO_NOT_PERSIST"

    async def fake_call_report_v2_provider(messages, *, provider, model):
        raise RuntimeError(sentinel)

    monkeypatch.setattr(
        analysis_agent,
        "_call_report_v2_provider",
        fake_call_report_v2_provider,
    )

    async def run_v2_draft():
        return await analysis_agent.generate_report_v2_ai_draft(
            case_id="case-1",
            session_id="session-1",
            summaries=[],
            manual_input=ReportManualInputV2(),
        )

    try:
        anyio.run(run_v2_draft)
    except analysis_agent.ReportV2GenerationError as exc:
        assert exc.category == "provider_api_failure"
        assert sentinel not in str(exc)
        return
    raise AssertionError("provider exception should fail closed")


def test_generate_report_v2_ai_draft_invalid_mode_fails_closed(monkeypatch):
    monkeypatch.setenv("REPORT_V2_PROVIDER_MODE", "surprise-provider")

    async def run_v2_draft():
        return await analysis_agent.generate_report_v2_ai_draft(
            case_id="case-1",
            session_id="session-1",
            summaries=[],
            manual_input=ReportManualInputV2(),
        )

    try:
        anyio.run(run_v2_draft)
    except analysis_agent.ReportV2GenerationError as exc:
        assert exc.category == "provider_config"
        return
    raise AssertionError("invalid provider mode should fail closed")


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


def test_report_v2_prompt_payload_instructs_client_understanding_draft_when_evidenced():
    payload = analysis_agent._build_report_v2_prompt_payload(
        case_id="case-1",
        session_id="session-1",
        summaries=[
            {
                "id": "summary-1",
                "turn_number": 1,
                "summary": {
                    "turn_number": 1,
                    "emotion": {"primary": "anxious", "intensity": 6},
                    "themes": ["work stress"],
                    "key_statement": "client links distress to workload and self-expectation",
                    "crisis_flag": False,
                },
                "crisis_level": "none",
            }
        ],
        manual_input=ReportManualInputV2(),
    )

    instructions = payload["instructions"]
    encoded = json.dumps(payload, ensure_ascii=False)

    assert "client_understanding_draft_guidance" in instructions
    assert "client_understanding_draft" in encoded
    assert "client's own understanding, attribution, or meaning-making" in encoded
    assert "manual input remains counselor-confirmed" in encoded
    assert "If evidence is insufficient" in encoded
    assert "missing_reason" in encoded
    assert "no_data" in encoded
    assert "不得臆造" in encoded


def test_report_v2_prompt_payload_requires_explicit_initial_orientation_in_rationale():
    payload = analysis_agent._build_report_v2_prompt_payload(
        case_id="case-1",
        session_id="session-1",
        summaries=[],
        manual_input=ReportManualInputV2(),
    )

    instructions = payload["instructions"]
    encoded = json.dumps(payload, ensure_ascii=False)

    assert "theoretical_orientation_rationale_guidance" in instructions
    assert "theoretical_orientation_rationale" in encoded
    assert "初步建議取向：" in encoded
    assert "初步建議取向：認知行為治療（CBT）。" in encoded
    assert "初步建議取向：待與督導確認。" in encoded
    assert "可能適合" in encoded
    assert "需諮商師審閱" in encoded
    assert "不得宣稱最終治療模式" in encoded
    assert "formal clinical decision" in encoded


def test_report_v2_messages_repeat_client_understanding_and_orientation_boundaries():
    messages = analysis_agent._build_report_v2_messages(
        analysis_agent._build_report_v2_prompt_payload(
            case_id="case-1",
            session_id="session-1",
            summaries=[],
            manual_input=ReportManualInputV2(),
        )
    )

    encoded = "\n".join(message["content"] for message in messages)

    assert "client_understanding_draft" in encoded
    assert "client's own understanding, attribution, or meaning-making" in encoded
    assert "If evidence is insufficient" in encoded
    assert "初步建議取向：" in encoded
    assert "可能適合" in encoded
    assert "需諮商師審閱" in encoded
    assert "待與督導確認" in encoded
    assert "Do not claim a final treatment model" in encoded


def test_report_v2_prompt_payload_instructs_dialogue_based_risk_language_screening():
    payload = analysis_agent._build_report_v2_prompt_payload(
        case_id="case-1",
        session_id="session-1",
        summaries=[
            {
                "id": "summary-1",
                "turn_number": 1,
                "summary": {
                    "turn_number": 1,
                    "emotion": {"primary": "anxious", "intensity": 7},
                    "themes": ["safety concern"],
                    "key_statement": "synthetic summary cue",
                    "crisis_flag": True,
                },
                "crisis_level": "high",
                "crisis_reason": "private detector reason must not pass through",
            }
        ],
        manual_input=ReportManualInputV2(),
    )

    instructions = payload["instructions"]
    encoded = json.dumps(payload, ensure_ascii=False)

    assert "risk_language_screening" in instructions
    assert "language-cue screening summary" in encoded
    assert "not a formal risk assessment" in encoded
    assert "requires counselor review" in encoded
    assert "suicide ideation language" in encoded
    assert "suicide plan/intent language" in encoded
    assert "self-harm language" in encoded
    assert "harm-to-others language" in encoded
    assert "substance-use language" in encoded
    assert "psychotic-symptom language" in encoded
    assert "overall risk-language screening impression" in encoded
    assert "explicitly denied" in encoded
    assert "simply absent" in encoded
    assert "crisis_level" in encoded
    assert "crisis detector reasons" in encoded
    assert "private detector reason must not pass through" not in encoded


def test_report_v2_messages_repeat_risk_screening_boundaries():
    messages = analysis_agent._build_report_v2_messages(
        analysis_agent._build_report_v2_prompt_payload(
            case_id="case-1",
            session_id="session-1",
            summaries=[],
            manual_input=ReportManualInputV2(),
        )
    )

    encoded = "\n".join(message["content"] for message in messages)

    assert "dialogue-based risk-language screening" in encoded
    assert "crisis_language_summary" in encoded
    assert "not a formal risk assessment" in encoded
    assert "formal diagnosis" in encoded
    assert "formal risk assessment" in encoded
    assert "safety plan generation" in encoded
    assert "treatment decisions" in encoded
    assert "persisted crisis_level" in encoded
    assert "crisis detector reasons" in encoded


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


def test_parse_report_v2_provider_output_normalizes_known_fields_missing_metadata():
    raw = {
        field_name: {"value": f"draft for {field_name}"}
        for field_name in analysis_agent.REPORT_V2_ALLOWED_AI_FIELDS
    }

    result = analysis_agent._parse_report_v2_provider_output(raw)

    assert isinstance(result, ReportAIGeneratedV2)
    for field_name in analysis_agent.REPORT_V2_ALLOWED_AI_FIELDS:
        field = getattr(result, field_name)
        assert field.label_zh == analysis_agent.REPORT_V2_AI_FIELD_LABELS[field_name]
        assert field.value == f"draft for {field_name}"
        assert field.source_type.value == "ai"
        assert field.missing_reason is None
        assert field.needs_review is True
        assert field.evidence_refs == []


def test_parse_report_v2_provider_output_normalizes_ai_like_source_type_aliases():
    aliases = ["AI", "ai_draft", "ai-generated", "ai_generated", "AI 草稿", "provider"]

    for alias in aliases:
        raw = {
            "chief_complaint_draft": {
                "label_zh": "主訴草稿",
                "value": f"draft from {alias}",
                "source_type": alias,
                "missing_reason": None,
                "needs_review": True,
                "evidence_refs": [],
            }
        }

        result = analysis_agent._parse_report_v2_provider_output(raw)

        assert isinstance(result, ReportAIGeneratedV2)
        assert result.chief_complaint_draft.value == f"draft from {alias}"
        assert result.chief_complaint_draft.source_type.value == "ai"


def test_parse_report_v2_provider_output_wraps_known_string_values():
    raw = {
        "chief_complaint_draft": "possible client concern requiring counselor review",
        "problem_development_draft": "",
    }

    result = analysis_agent._parse_report_v2_provider_output(raw)

    assert isinstance(result, ReportAIGeneratedV2)
    assert result.chief_complaint_draft.label_zh == "主訴草稿"
    assert result.chief_complaint_draft.value == "possible client concern requiring counselor review"
    assert result.chief_complaint_draft.source_type.value == "ai"
    assert result.chief_complaint_draft.missing_reason is None
    assert result.chief_complaint_draft.needs_review is True
    assert result.chief_complaint_draft.evidence_refs == []
    assert result.problem_development_draft.value == ""
    assert result.problem_development_draft.missing_reason.value == "no_data"


def test_parse_report_v2_provider_output_fills_missing_reason_for_empty_values():
    raw = {
        "chief_complaint_draft": None,
        "problem_development_draft": {"value": "   "},
    }

    result = analysis_agent._parse_report_v2_provider_output(raw)

    assert isinstance(result, ReportAIGeneratedV2)
    assert result.chief_complaint_draft.value is None
    assert result.chief_complaint_draft.missing_reason.value == "no_data"
    assert result.problem_development_draft.missing_reason.value == "no_data"


def test_parse_report_v2_provider_output_normalizes_invalid_missing_reasons():
    raw = {
        "chief_complaint_draft": {
            "value": "non-empty draft",
            "source_type": "ai",
            "missing_reason": "none",
        },
        "problem_development_draft": {
            "value": "",
            "source_type": "ai",
            "missing_reason": "unexpected provider label",
        },
        "client_understanding_draft": {
            "value": None,
            "source_type": "ai",
            "missing_reason": "not evaluated",
        },
        "emotion_pattern": {
            "value": "not applicable for this source",
            "source_type": "ai",
            "missing_reason": "不適用",
        },
    }

    result = analysis_agent._parse_report_v2_provider_output(raw)

    assert isinstance(result, ReportAIGeneratedV2)
    assert result.chief_complaint_draft.missing_reason is None
    assert result.problem_development_draft.missing_reason.value == "no_data"
    assert result.client_understanding_draft.missing_reason.value == "not_assessed"
    assert result.emotion_pattern.missing_reason.value == "not_applicable"
    assert result.chief_complaint_draft.needs_review is True
    assert result.chief_complaint_draft.evidence_refs == []


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
        {
            "overall_risk_level": {
                "label_zh": "overall risk level",
                "value": "high",
                "source_type": "ai",
            }
        },
        {
            "safety_plan": {
                "label_zh": "safety plan",
                "value": "AI must not generate a safety plan",
                "source_type": "ai",
            }
        },
    ]

    for raw in invalid_cases:
        try:
            analysis_agent._parse_report_v2_provider_output(raw)
        except ValueError:
            continue
        raise AssertionError(f"unsafe provider output should fail: {raw!r}")


def test_report_v2_ai_generated_fields_do_not_include_manual_only_risk_fields():
    assert "crisis_language_summary" in analysis_agent.REPORT_V2_ALLOWED_AI_FIELDS
    assert "overall_risk_level" not in analysis_agent.REPORT_V2_ALLOWED_AI_FIELDS
    assert "safety_plan" not in analysis_agent.REPORT_V2_ALLOWED_AI_FIELDS
    assert "formal_risk_assessment" not in analysis_agent.REPORT_V2_ALLOWED_AI_FIELDS


def test_call_report_v2_provider_boundary_uses_selected_gemini_client_and_model(monkeypatch):
    fake_client = FakeLLMClient(content='{"chief_complaint_draft": {}}')
    monkeypatch.setattr(analysis_agent, "get_llm_client", fake_client)

    async def run_provider_boundary():
        return await analysis_agent._call_report_v2_provider(
            [{"role": "system", "content": "unused"}],
            provider="gemini",
            model="report-v2-boundary-model",
        )

    result = anyio.run(run_provider_boundary)

    assert result == '{"chief_complaint_draft": {}}'
    assert fake_client.calls == [{"provider": "gemini"}]
    assert fake_client.create_calls[0]["model"] == "report-v2-boundary-model"
    assert fake_client.create_calls[0]["messages"] == [
        {"role": "system", "content": "unused"}
    ]
    assert fake_client.create_calls[0]["temperature"] == 0.2
    assert fake_client.create_calls[0]["response_format"] == {"type": "json_object"}


def test_call_report_v2_provider_boundary_uses_selected_groq_client_and_model(monkeypatch):
    fake_client = FakeLLMClient(content='{"chief_complaint_draft": {}}')
    monkeypatch.setattr(analysis_agent, "get_llm_client", fake_client)

    async def run_provider_boundary():
        return await analysis_agent._call_report_v2_provider(
            [{"role": "system", "content": "unused"}],
            provider="groq",
            model="llama-3.3-70b-versatile",
        )

    result = anyio.run(run_provider_boundary)

    assert result == '{"chief_complaint_draft": {}}'
    assert fake_client.calls == [{"provider": "groq"}]
    assert fake_client.create_calls[0]["model"] == "llama-3.3-70b-versatile"
    assert fake_client.create_calls[0]["messages"] == [
        {"role": "system", "content": "unused"}
    ]
    assert fake_client.create_calls[0]["temperature"] == 0.2
    assert fake_client.create_calls[0]["response_format"] == {"type": "json_object"}


def test_call_report_v2_provider_uses_report_api_key_override_for_groq(monkeypatch):
    report_key = "REPORT_V2_GROQ_KEY_DO_NOT_LEAK"
    shared_key = "SHARED_GROQ_KEY_SHOULD_NOT_BE_USED"
    fake_client = FakeLLMClient(content='{"chief_complaint_draft": {}}')
    constructed = {}

    def fake_async_openai(*, api_key, base_url):
        constructed["api_key"] = api_key
        constructed["base_url"] = base_url
        return fake_client

    def fail_if_shared_client_is_used(provider):
        raise AssertionError(f"shared provider client should not be used: {provider}")

    monkeypatch.setenv("REPORT_V2_API_KEY", report_key)
    monkeypatch.setenv("GROQ_API_KEY", shared_key)
    monkeypatch.setattr(analysis_agent, "AsyncOpenAI", fake_async_openai, raising=False)
    monkeypatch.setattr(analysis_agent, "get_llm_client", fail_if_shared_client_is_used)

    async def run_provider_boundary():
        return await analysis_agent._call_report_v2_provider(
            [{"role": "system", "content": "unused"}],
            provider="groq",
            model="llama-3.3-70b-versatile",
        )

    result = anyio.run(run_provider_boundary)

    assert result == '{"chief_complaint_draft": {}}'
    assert constructed["api_key"] == report_key
    assert shared_key != constructed["api_key"]
    assert constructed["base_url"] == "https://api.groq.com/openai/v1"


def test_call_report_v2_provider_uses_report_api_key_override_for_gemini(monkeypatch):
    report_key = "REPORT_V2_GEMINI_KEY_DO_NOT_LEAK"
    shared_key = "SHARED_GEMINI_KEY_SHOULD_NOT_BE_USED"
    fake_client = FakeLLMClient(content='{"chief_complaint_draft": {}}')
    constructed = {}

    def fake_async_openai(*, api_key, base_url):
        constructed["api_key"] = api_key
        constructed["base_url"] = base_url
        return fake_client

    def fail_if_shared_client_is_used(provider):
        raise AssertionError(f"shared provider client should not be used: {provider}")

    monkeypatch.setenv("REPORT_V2_API_KEY", report_key)
    monkeypatch.setenv("GEMINI_API_KEY", shared_key)
    monkeypatch.setattr(analysis_agent, "AsyncOpenAI", fake_async_openai, raising=False)
    monkeypatch.setattr(analysis_agent, "get_llm_client", fail_if_shared_client_is_used)

    async def run_provider_boundary():
        return await analysis_agent._call_report_v2_provider(
            [{"role": "system", "content": "unused"}],
            provider="gemini",
            model="gemini-2.5-flash",
        )

    result = anyio.run(run_provider_boundary)

    assert result == '{"chief_complaint_draft": {}}'
    assert constructed["api_key"] == report_key
    assert shared_key != constructed["api_key"]
    assert constructed["base_url"] == "https://generativelanguage.googleapis.com/v1beta/openai/"


def test_call_report_v2_provider_without_override_uses_groq_provider_key_path(monkeypatch):
    monkeypatch.delenv("REPORT_V2_API_KEY", raising=False)
    monkeypatch.setenv("GROQ_API_KEY", "SHARED_GROQ_KEY")
    fake_client = FakeLLMClient(content='{"chief_complaint_draft": {}}')

    def fail_if_override_client_is_used(*, api_key, base_url):
        raise AssertionError("report-specific override client should not be used")

    monkeypatch.setattr(analysis_agent, "AsyncOpenAI", fail_if_override_client_is_used, raising=False)
    monkeypatch.setattr(analysis_agent, "get_llm_client", fake_client)

    async def run_provider_boundary():
        return await analysis_agent._call_report_v2_provider(
            [{"role": "system", "content": "unused"}],
            provider="groq",
            model="llama-3.3-70b-versatile",
        )

    result = anyio.run(run_provider_boundary)

    assert result == '{"chief_complaint_draft": {}}'
    assert fake_client.calls == [{"provider": "groq"}]


def test_call_report_v2_provider_without_override_uses_gemini_provider_key_path(monkeypatch):
    monkeypatch.delenv("REPORT_V2_API_KEY", raising=False)
    monkeypatch.setenv("GEMINI_API_KEY", "SHARED_GEMINI_KEY")
    fake_client = FakeLLMClient(content='{"chief_complaint_draft": {}}')

    def fail_if_override_client_is_used(*, api_key, base_url):
        raise AssertionError("report-specific override client should not be used")

    monkeypatch.setattr(analysis_agent, "AsyncOpenAI", fail_if_override_client_is_used, raising=False)
    monkeypatch.setattr(analysis_agent, "get_llm_client", fake_client)

    async def run_provider_boundary():
        return await analysis_agent._call_report_v2_provider(
            [{"role": "system", "content": "unused"}],
            provider="gemini",
            model="gemini-2.5-flash",
        )

    result = anyio.run(run_provider_boundary)

    assert result == '{"chief_complaint_draft": {}}'
    assert fake_client.calls == [{"provider": "gemini"}]


def test_call_report_v2_provider_missing_key_maps_to_provider_config(monkeypatch):
    sentinel = "PRIVATE_PROVIDER_KEY_NAME_OR_VALUE_DO_NOT_LEAK"

    def missing_key_client(provider):
        raise ValueError(sentinel)

    monkeypatch.delenv("REPORT_V2_API_KEY", raising=False)
    monkeypatch.setattr(analysis_agent, "get_llm_client", missing_key_client)

    async def run_provider_boundary():
        return await analysis_agent._call_report_v2_provider(
            [{"role": "system", "content": "unused"}],
            provider="groq",
            model="llama-3.3-70b-versatile",
        )

    try:
        anyio.run(run_provider_boundary)
    except analysis_agent.ReportV2GenerationError as exc:
        assert exc.category == "provider_config"
        assert sentinel not in str(exc)
        return
    raise AssertionError("missing selected provider key should be provider_config")


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
