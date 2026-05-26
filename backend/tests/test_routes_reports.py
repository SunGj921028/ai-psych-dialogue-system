from __future__ import annotations

import agents.analysis_agent as analysis_agent
from agents.analysis_agent import DISCLAIMER_TEXT, ConceptualizationReport, EmotionPattern
from agents.summary_agent import EmotionDetail, EmotionDimensions, TurnSummary
from database.db import add_message, add_summary, create_session


def _create_case(client) -> str:
    response = client.post("/api/cases", json={"code_name": "A001"})
    assert response.status_code == 200
    return response.json()["id"]


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
