from __future__ import annotations

import logging

import agents.analysis_agent as analysis_agent
from agents.analysis_agent import DISCLAIMER_TEXT, ConceptualizationReport, EmotionPattern
from agents.summary_agent import EmotionDetail, EmotionDimensions, TurnSummary
from database.db import add_message, add_summary, create_session
from models.report_schema_v2 import (
    ReportAIGeneratedV2,
    ReportEvidenceRefV2,
    ReportField,
    ReportSourceType,
)


def _create_case(client) -> str:
    response = client.post("/api/cases", json={"code_name": "A001"})
    assert response.status_code == 200
    return response.json()["id"]


def _create_report_v2_draft_with_summary(
    client,
    *,
    session_id: str,
) -> tuple[str, dict, dict]:
    case_id = _create_case(client)

    import anyio

    anyio.run(create_session, case_id, session_id, None)
    summary = TurnSummary(
        turn_number=1,
        emotion=EmotionDetail(primary="anxiety", intensity=6),
        emotion_dimensions=EmotionDimensions(anxiety=6),
        themes=["work stress"],
        key_statement="synthetic summary only",
        crisis_flag=False,
    )
    summary_row = anyio.run(
        add_summary,
        case_id,
        session_id,
        1,
        summary.model_dump_json(),
        False,
        "none",
    )
    created = client.post(
        f"/api/cases/{case_id}/sessions/{session_id}/report-drafts"
    ).json()
    return case_id, created, summary_row


def test_generate_report_converts_db_summaries_to_turn_summary(client, monkeypatch):
    case_id = _create_case(client)
    captured = {}
    summary = TurnSummary(
        turn_number=1,
        emotion=EmotionDetail(primary="焦慮", intensity=6),
        emotion_dimensions=EmotionDimensions(anxiety=6),
        themes=["工作壓力"],
        key_statement="我很緊張",
        crisis_flag=False,
    )

    import anyio

    anyio.run(
        add_summary,
        case_id,
        "session-1",
        1,
        summary.model_dump_json(),
        False,
    )

    async def fake_generate_report(case_id, session_id, summaries):
        captured["case_id"] = case_id
        captured["session_id"] = session_id
        captured["summaries"] = summaries
        return ConceptualizationReport(
            case_id=case_id,
            session_id=session_id,
            generated_at="2026-05-18T00:00:00+00:00",
            chief_complaint="資料不足",
            emotion_pattern=EmotionPattern(
                description="初步資料",
                dominant_emotions=["焦慮"],
                intensity_trend="stable",
                peak_turn=1,
            ),
            cognitive_behavioral_analysis="",
            initial_conceptualization="",
            suggested_directions=[],
            crisis_summary="未偵測到危機語句。",
            disclaimer="本報告為 AI 草稿，僅供諮商師參考，非診斷文件。\n所有判斷與決策須由專業諮商師負責審核。",
            has_crisis=False,
        )

    monkeypatch.setattr("routers.reports.generate_report", fake_generate_report)

    response = client.post(
        "/api/reports/generate",
        json={"case_id": case_id, "session_id": "session-1"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["case_id"] == case_id
    assert data["session_id"] == "session-1"
    assert data["disclaimer"].startswith("本報告為 AI 草稿")
    assert captured["case_id"] == case_id
    assert captured["session_id"] == "session-1"
    assert len(captured["summaries"]) == 1
    assert isinstance(captured["summaries"][0], TurnSummary)
    assert captured["summaries"][0].turn_number == 1


def test_generate_report_missing_case_returns_404(client):
    response = client.post(
        "/api/reports/generate",
        json={"case_id": "missing-case", "session_id": "session-1"},
    )

    assert response.status_code == 404


def test_generate_report_with_existing_empty_session_returns_insufficient_data_report(
    client,
    monkeypatch,
):
    case_id = _create_case(client)

    def fail_if_provider_is_requested(provider):
        raise AssertionError(f"provider should not be requested: {provider}")

    monkeypatch.setattr(analysis_agent, "get_llm_client", fail_if_provider_is_requested)

    import anyio

    anyio.run(
        add_message,
        case_id,
        "empty-session",
        1,
        "user",
        "session exists but has no summaries",
    )

    response = client.post(
        "/api/reports/generate",
        json={"case_id": case_id, "session_id": "empty-session"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["case_id"] == case_id
    assert data["session_id"] == "empty-session"
    assert data["chief_complaint"].startswith("對話輪次不足")
    assert data["emotion_pattern"]["peak_turn"] == 0
    assert data["has_crisis"] is False
    assert data["disclaimer"] == DISCLAIMER_TEXT


def test_get_current_report_draft_returns_404_before_creation(client):
    case_id = _create_case(client)

    import anyio

    anyio.run(create_session, case_id, "session-v2-draft", None)

    response = client.get(
        f"/api/cases/{case_id}/sessions/session-v2-draft/report-drafts/current"
    )

    assert response.status_code == 404


def test_post_report_draft_creates_empty_manual_input_draft(client):
    case_id = _create_case(client)

    import anyio

    anyio.run(create_session, case_id, "session-v2-draft", None)

    response = client.post(
        f"/api/cases/{case_id}/sessions/session-v2-draft/report-drafts"
    )

    assert response.status_code == 200
    data = response.json()
    assert data["schema_version"] == "report_schema_v2"
    assert data["case_id"] == case_id
    assert data["session_id"] == "session-v2-draft"
    assert data["status"] == "manual_input_started"
    assert data["draft_id"]
    assert data["manual_input"]["basic_info"]["referral_source"]["value"] is None
    assert data["ai_generated"] is None
    assert data["final_report"] is None


def test_post_report_draft_with_manual_input_saves_it_and_is_idempotent(client):
    case_id = _create_case(client)

    import anyio

    anyio.run(create_session, case_id, "session-v2-draft", None)

    payload = {
        "manual_input": {
            "basic_info": {
                "referral_source": {
                    "label_zh": "轉介來源",
                    "value": "school counselor",
                    "source_type": "manual",
                    "missing_reason": None,
                }
            }
        }
    }

    first = client.post(
        f"/api/cases/{case_id}/sessions/session-v2-draft/report-drafts",
        json=payload,
    )
    second = client.post(
        f"/api/cases/{case_id}/sessions/session-v2-draft/report-drafts",
        json=payload,
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["draft_id"] == first.json()["draft_id"]
    assert (
        second.json()["manual_input"]["basic_info"]["referral_source"]["value"]
        == "school counselor"
    )


def test_patch_report_draft_manual_input_updates_existing_draft(client):
    case_id = _create_case(client)

    import anyio

    anyio.run(create_session, case_id, "session-v2-draft", None)
    created = client.post(
        f"/api/cases/{case_id}/sessions/session-v2-draft/report-drafts"
    ).json()

    response = client.patch(
        f"/api/report-drafts/{created['draft_id']}/manual-input",
        json={
            "manual_input": {
                "basic_info": {
                    "session_count": {
                        "label_zh": "會談次數",
                        "value": 2,
                        "source_type": "manual",
                    }
                }
            }
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["draft_id"] == created["draft_id"]
    assert data["manual_input"]["basic_info"]["session_count"]["value"] == 2
    assert data["ai_generated"] is None
    assert data["final_report"] is None


def test_report_draft_routes_validate_manual_input_and_missing_resources(client):
    case_id = _create_case(client)

    import anyio

    anyio.run(create_session, case_id, "session-v2-draft", None)

    missing_case = client.post(
        "/api/cases/missing-case/sessions/session-v2-draft/report-drafts"
    )
    missing_session = client.post(
        f"/api/cases/{case_id}/sessions/missing-session/report-drafts"
    )
    invalid_manual_input = client.post(
        f"/api/cases/{case_id}/sessions/session-v2-draft/report-drafts",
        json={
            "manual_input": {
                "basic_info": {
                    "referral_source": {
                        "label_zh": "轉介來源",
                        "value": "private",
                        "source_type": "provider",
                    }
                }
            }
        },
    )
    missing_patch = client.patch(
        "/api/report-drafts/missing-draft/manual-input",
        json={"manual_input": {}},
    )

    assert missing_case.status_code == 404
    assert missing_session.status_code == 404
    assert invalid_manual_input.status_code == 422
    assert missing_patch.status_code == 404


def test_generate_report_v2_draft_persists_mocked_ai_output(client, monkeypatch):
    case_id = _create_case(client)

    import anyio

    anyio.run(create_session, case_id, "session-v2-generate", None)
    summary = TurnSummary(
        turn_number=1,
        emotion=EmotionDetail(primary="焦慮", intensity=6),
        emotion_dimensions=EmotionDimensions(anxiety=6),
        themes=["work stress"],
        key_statement="synthetic summary only",
        crisis_flag=False,
    )
    summary_row = anyio.run(
        add_summary,
        case_id,
        "session-v2-generate",
        1,
        summary.model_dump_json(),
        False,
        "none",
    )
    created = client.post(
        f"/api/cases/{case_id}/sessions/session-v2-generate/report-drafts",
        json={
            "manual_input": {
                "basic_info": {
                    "referral_source": {
                        "label_zh": "轉介來源",
                        "value": "school counselor",
                        "source_type": "manual",
                        "missing_reason": None,
                    }
                }
            }
        },
    ).json()
    captured = {}

    async def fake_generate_report_v2_ai_draft(
        *,
        case_id,
        session_id,
        summaries,
        manual_input,
        knowledge_excerpts=None,
    ):
        captured["case_id"] = case_id
        captured["session_id"] = session_id
        captured["summaries"] = summaries
        captured["manual_input"] = manual_input
        return ReportAIGeneratedV2(
            chief_complaint_draft=ReportField(
                label_zh="主訴摘要",
                value="可能與工作壓力相關，仍需諮商師確認。",
                source_type=ReportSourceType.AI,
                missing_reason=None,
                needs_review=True,
                evidence_refs=[
                    ReportEvidenceRefV2(
                        turn_number=1,
                        summary_id=summary_row["id"],
                        note="summary pointer",
                    )
                ],
            )
        )

    monkeypatch.setattr(
        "routers.reports.generate_report_v2_ai_draft",
        fake_generate_report_v2_ai_draft,
    )

    response = client.post(f"/api/report-drafts/{created['draft_id']}/generate")

    assert response.status_code == 200
    data = response.json()
    assert data["draft_id"] == created["draft_id"]
    assert data["status"] == "ai_generated"
    assert data["generated_at"]
    assert data["manual_input"]["basic_info"]["referral_source"]["value"] == "school counselor"
    assert data["final_report"] is None
    assert data["ai_generated"]["chief_complaint_draft"]["value"] == "可能與工作壓力相關，仍需諮商師確認。"
    assert data["source_refs"] == [
        {
            "turn_number": 1,
            "summary_id": summary_row["id"],
            "note": "summary pointer",
        }
    ]
    assert "raw_message_text" not in response.text
    assert captured["case_id"] == case_id
    assert captured["session_id"] == "session-v2-generate"
    assert captured["summaries"][0]["id"] == summary_row["id"]
    assert captured["summaries"][0]["crisis_level"] == "none"


def test_generate_report_v2_draft_provider_mode_persists_valid_provider_output(
    client,
    monkeypatch,
):
    monkeypatch.setenv("REPORT_V2_PROVIDER_MODE", "provider")
    monkeypatch.setenv("REPORT_V2_MODEL", "report-v2-route-model")
    case_id = _create_case(client)

    import anyio

    anyio.run(create_session, case_id, "session-v2-provider", None)
    summary = TurnSummary(
        turn_number=1,
        emotion=EmotionDetail(primary="?行", intensity=6),
        emotion_dimensions=EmotionDimensions(anxiety=6),
        themes=["work stress"],
        key_statement="synthetic summary only",
        crisis_flag=False,
    )
    summary_row = anyio.run(
        add_summary,
        case_id,
        "session-v2-provider",
        1,
        summary.model_dump_json(),
        False,
        "none",
    )
    created = client.post(
        f"/api/cases/{case_id}/sessions/session-v2-provider/report-drafts"
    ).json()
    calls = {}

    async def fake_call_report_v2_provider(messages, *, model):
        calls["messages"] = messages
        calls["model"] = model
        return {
            "chief_complaint_draft": {
                "label_zh": "銝餉迄??",
                "value": "可能與工作壓力相關，需諮商師確認。",
                "source_type": "ai",
                "missing_reason": None,
                "needs_review": True,
                "evidence_refs": [
                    {
                        "turn_number": 1,
                        "summary_id": summary_row["id"],
                        "note": "summary metadata",
                    }
                ],
            }
        }

    monkeypatch.setattr(
        "agents.analysis_agent._call_report_v2_provider",
        fake_call_report_v2_provider,
    )

    response = client.post(f"/api/report-drafts/{created['draft_id']}/generate")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ai_generated"
    assert data["generated_at"]
    assert data["ai_generated"]["chief_complaint_draft"]["value"] == "可能與工作壓力相關，需諮商師確認。"
    assert data["source_refs"] == [
        {
            "turn_number": 1,
            "summary_id": summary_row["id"],
            "note": "summary metadata",
        }
    ]
    assert calls["model"] == "report-v2-route-model"
    assert calls["messages"][0]["role"] == "system"


def test_generate_report_v2_draft_provider_failure_is_generic_and_does_not_overwrite(
    client,
    monkeypatch,
    caplog,
):
    caplog.set_level(logging.WARNING, logger="routers.reports")
    monkeypatch.setenv("REPORT_V2_PROVIDER_MODE", "provider")
    case_id = _create_case(client)
    sentinel = "PRIVATE_PROVIDER_FAILURE_DO_NOT_LEAK"

    import anyio

    anyio.run(create_session, case_id, "session-v2-provider-failure", None)
    summary = TurnSummary(
        turn_number=1,
        emotion=EmotionDetail(primary="?行", intensity=6),
        emotion_dimensions=EmotionDimensions(anxiety=6),
        themes=["work stress"],
        key_statement="synthetic summary only",
        crisis_flag=False,
    )
    summary_row = anyio.run(
        add_summary,
        case_id,
        "session-v2-provider-failure",
        1,
        summary.model_dump_json(),
        False,
        "none",
    )
    created = client.post(
        f"/api/cases/{case_id}/sessions/session-v2-provider-failure/report-drafts"
    ).json()

    async def first_provider_output(messages, *, model):
        return {
            "chief_complaint_draft": {
                "label_zh": "銝餉迄??",
                "value": "existing safe provider draft",
                "source_type": "ai",
                "missing_reason": None,
                "needs_review": True,
                "evidence_refs": [
                    {
                        "turn_number": 1,
                        "summary_id": summary_row["id"],
                        "note": "summary metadata",
                    }
                ],
            }
        }

    monkeypatch.setattr(
        "agents.analysis_agent._call_report_v2_provider",
        first_provider_output,
    )
    first = client.post(f"/api/report-drafts/{created['draft_id']}/generate")
    assert first.status_code == 200
    assert first.json()["ai_generated"]["chief_complaint_draft"]["value"] == "existing safe provider draft"

    async def failing_provider(messages, *, model):
        raise RuntimeError(sentinel)

    monkeypatch.setattr(
        "agents.analysis_agent._call_report_v2_provider",
        failing_provider,
    )
    second = client.post(f"/api/report-drafts/{created['draft_id']}/generate")
    current = client.get(
        f"/api/cases/{case_id}/sessions/session-v2-provider-failure/report-drafts/current"
    )

    assert second.status_code == 500
    assert second.json() == {"detail": "Failed to generate report draft"}
    assert sentinel not in second.text
    assert "category=provider_api_failure" in caplog.text
    assert sentinel not in caplog.text
    assert current.status_code == 200
    assert current.json()["ai_generated"]["chief_complaint_draft"]["value"] == "existing safe provider draft"


def test_generate_report_v2_draft_provider_config_failure_is_generic_and_classified(
    client,
    monkeypatch,
    caplog,
):
    caplog.set_level(logging.WARNING, logger="routers.reports")
    monkeypatch.setenv("REPORT_V2_PROVIDER_MODE", "surprise-provider")
    _, created, _ = _create_report_v2_draft_with_summary(
        client,
        session_id="session-v2-provider-config-failure",
    )

    response = client.post(f"/api/report-drafts/{created['draft_id']}/generate")

    assert response.status_code == 500
    assert response.json() == {"detail": "Failed to generate report draft"}
    assert "surprise-provider" not in response.text
    assert "category=provider_config" in caplog.text
    assert "surprise-provider" not in caplog.text


def test_generate_report_v2_draft_provider_api_exception_is_generic_and_classified(
    client,
    monkeypatch,
    caplog,
):
    caplog.set_level(logging.WARNING, logger="routers.reports")
    monkeypatch.setenv("REPORT_V2_PROVIDER_MODE", "provider")
    sentinel = "PRIVATE_PROVIDER_API_EXCEPTION_DO_NOT_LEAK"
    _, created, _ = _create_report_v2_draft_with_summary(
        client,
        session_id="session-v2-provider-api-failure",
    )

    async def failing_provider(messages, *, model):
        raise RuntimeError(sentinel)

    monkeypatch.setattr(
        "agents.analysis_agent._call_report_v2_provider",
        failing_provider,
    )

    response = client.post(f"/api/report-drafts/{created['draft_id']}/generate")

    assert response.status_code == 500
    assert response.json() == {"detail": "Failed to generate report draft"}
    assert sentinel not in response.text
    assert "category=provider_api_failure" in caplog.text
    assert sentinel not in caplog.text


def test_generate_report_v2_draft_invalid_provider_json_is_generic_and_non_leaking(
    client,
    monkeypatch,
    caplog,
):
    caplog.set_level(logging.WARNING, logger="routers.reports")
    monkeypatch.setenv("REPORT_V2_PROVIDER_MODE", "provider")
    sentinel = "RAW_PROVIDER_RESPONSE_DO_NOT_LEAK"
    _, created, _ = _create_report_v2_draft_with_summary(
        client,
        session_id="session-v2-invalid-provider-json",
    )

    async def invalid_json_provider(messages, *, model):
        return f"{sentinel}: not json"

    monkeypatch.setattr(
        "agents.analysis_agent._call_report_v2_provider",
        invalid_json_provider,
    )

    response = client.post(f"/api/report-drafts/{created['draft_id']}/generate")

    assert response.status_code == 500
    assert response.json() == {"detail": "Failed to generate report draft"}
    assert sentinel not in response.text
    assert "category=invalid_provider_json" in caplog.text
    assert sentinel not in caplog.text


def test_generate_report_v2_draft_schema_validation_failure_is_generic_and_classified(
    client,
    monkeypatch,
    caplog,
):
    caplog.set_level(logging.WARNING, logger="routers.reports")
    monkeypatch.setenv("REPORT_V2_PROVIDER_MODE", "provider")
    sentinel = "SCHEMA_PROVIDER_PAYLOAD_DO_NOT_LEAK"
    _, created, _ = _create_report_v2_draft_with_summary(
        client,
        session_id="session-v2-schema-validation-failure",
    )

    async def manual_only_provider_output(messages, *, model):
        return {
            "formal_diagnosis_notes": {
                "label_zh": "manual-only",
                "value": sentinel,
                "source_type": "ai",
            }
        }

    monkeypatch.setattr(
        "agents.analysis_agent._call_report_v2_provider",
        manual_only_provider_output,
    )

    response = client.post(f"/api/report-drafts/{created['draft_id']}/generate")

    assert response.status_code == 500
    assert response.json() == {"detail": "Failed to generate report draft"}
    assert sentinel not in response.text
    assert "category=schema_validation_failed" in caplog.text
    assert sentinel not in caplog.text


def test_generate_report_v2_draft_unsafe_evidence_refs_are_generic_and_classified(
    client,
    monkeypatch,
    caplog,
):
    caplog.set_level(logging.WARNING, logger="routers.reports")
    monkeypatch.setenv("REPORT_V2_PROVIDER_MODE", "provider")
    sentinel = "RAW_EVIDENCE_NOTE_DO_NOT_LEAK"
    _, created, summary_row = _create_report_v2_draft_with_summary(
        client,
        session_id="session-v2-unsafe-evidence-ref",
    )

    async def unsafe_evidence_provider_output(messages, *, model):
        return {
            "chief_complaint_draft": {
                "value": "safe draft value",
                "source_type": "ai",
                "evidence_refs": [
                    {
                        "turn_number": 1,
                        "summary_id": summary_row["id"],
                        "note": sentinel,
                    }
                ],
            }
        }

    monkeypatch.setattr(
        "agents.analysis_agent._call_report_v2_provider",
        unsafe_evidence_provider_output,
    )

    response = client.post(f"/api/report-drafts/{created['draft_id']}/generate")

    assert response.status_code == 500
    assert response.json() == {"detail": "Failed to generate report draft"}
    assert sentinel not in response.text
    assert "category=unsafe_evidence_refs" in caplog.text
    assert sentinel not in caplog.text


def test_generate_report_v2_draft_missing_draft_returns_404(client):
    response = client.post("/api/report-drafts/missing-draft/generate")

    assert response.status_code == 404


def test_generate_report_v2_draft_without_summaries_returns_422(
    client,
    monkeypatch,
    caplog,
):
    caplog.set_level(logging.WARNING, logger="routers.reports")
    monkeypatch.setenv("REPORT_V2_PROVIDER_MODE", "provider")
    case_id = _create_case(client)

    import anyio

    anyio.run(create_session, case_id, "session-v2-no-summaries", None)
    created = client.post(
        f"/api/cases/{case_id}/sessions/session-v2-no-summaries/report-drafts"
    ).json()
    calls = {"agent": 0}
    provider_calls = {"provider": 0}

    async def fake_generate_report_v2_ai_draft(**kwargs):
        calls["agent"] += 1
        return ReportAIGeneratedV2()

    monkeypatch.setattr(
        "routers.reports.generate_report_v2_ai_draft",
        fake_generate_report_v2_ai_draft,
    )

    async def fake_call_report_v2_provider(*args, **kwargs):
        provider_calls["provider"] += 1
        return {}

    monkeypatch.setattr(
        "agents.analysis_agent._call_report_v2_provider",
        fake_call_report_v2_provider,
    )

    response = client.post(f"/api/report-drafts/{created['draft_id']}/generate")

    assert response.status_code == 422
    assert calls["agent"] == 0
    assert provider_calls["provider"] == 0
    assert "category=missing_summaries" in caplog.text


def test_generate_report_v2_draft_invalid_agent_output_returns_safe_error(
    client,
    monkeypatch,
):
    case_id = _create_case(client)
    sentinel = "RAW_PROVIDER_SENTINEL_DO_NOT_LEAK"

    import anyio

    anyio.run(create_session, case_id, "session-v2-invalid-agent", None)
    summary = TurnSummary(
        turn_number=1,
        emotion=EmotionDetail(primary="焦慮", intensity=6),
        emotion_dimensions=EmotionDimensions(anxiety=6),
        themes=[],
        key_statement="synthetic summary only",
        crisis_flag=False,
    )
    anyio.run(
        add_summary,
        case_id,
        "session-v2-invalid-agent",
        1,
        summary.model_dump_json(),
        False,
        "none",
    )
    created = client.post(
        f"/api/cases/{case_id}/sessions/session-v2-invalid-agent/report-drafts"
    ).json()

    async def fake_generate_report_v2_ai_draft(**kwargs):
        return {
            "formal_diagnosis_notes": sentinel,
            "chief_complaint_draft": {
                "label_zh": "主訴摘要",
                "value": sentinel,
                "source_type": "ai",
            },
        }

    monkeypatch.setattr(
        "routers.reports.generate_report_v2_ai_draft",
        fake_generate_report_v2_ai_draft,
    )

    response = client.post(f"/api/report-drafts/{created['draft_id']}/generate")

    assert response.status_code == 500
    assert response.json() == {"detail": "Failed to generate report draft"}
    assert sentinel not in response.text


def test_generate_report_v2_draft_update_failure_returns_safe_error(
    client,
    monkeypatch,
    caplog,
):
    caplog.set_level(logging.WARNING, logger="routers.reports")
    case_id = _create_case(client)
    exception_text = "PRIVATE_AI_GENERATED_DB_ERROR_DO_NOT_LEAK"

    import anyio

    anyio.run(create_session, case_id, "session-v2-db-failure", None)
    summary = TurnSummary(
        turn_number=1,
        emotion=EmotionDetail(primary="焦慮", intensity=6),
        emotion_dimensions=EmotionDimensions(anxiety=6),
        themes=[],
        key_statement="synthetic summary only",
        crisis_flag=False,
    )
    anyio.run(
        add_summary,
        case_id,
        "session-v2-db-failure",
        1,
        summary.model_dump_json(),
        False,
        "none",
    )
    created = client.post(
        f"/api/cases/{case_id}/sessions/session-v2-db-failure/report-drafts"
    ).json()

    async def fake_generate_report_v2_ai_draft(**kwargs):
        return ReportAIGeneratedV2()

    async def fake_update_report_ai_generated(*args, **kwargs):
        raise RuntimeError(exception_text)

    monkeypatch.setattr(
        "routers.reports.generate_report_v2_ai_draft",
        fake_generate_report_v2_ai_draft,
    )
    monkeypatch.setattr(
        "routers.reports.update_report_ai_generated",
        fake_update_report_ai_generated,
    )

    response = client.post(f"/api/report-drafts/{created['draft_id']}/generate")

    assert response.status_code == 500
    assert response.json() == {"detail": "Failed to generate report draft"}
    assert exception_text not in response.text
    assert "category=db_persistence_failed" in caplog.text
    assert exception_text not in caplog.text
