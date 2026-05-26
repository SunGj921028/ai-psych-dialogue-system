from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from models.report_schema_v2 import (
    MissingReason,
    ReportAIGeneratedV2,
    ReportDraftStatus,
    ReportDraftV2,
    ReportEvidenceRefV2,
    ReportField,
    ReportManualInputV2,
    ReportSafetyFlagsV2,
    ReportSourceType,
    RiskLevel,
)


def test_valid_minimal_draft_can_be_created_with_missing_fields():
    draft = ReportDraftV2(
        case_id="case-1",
        session_id="session-1",
        disclaimer="本報告為 AI 草稿，僅供諮商師參考，非診斷文件。",
    )

    assert draft.schema_version == "report_schema_v2"
    assert draft.status == ReportDraftStatus.MANUAL_INPUT_STARTED
    assert isinstance(draft.manual_input, ReportManualInputV2)
    assert isinstance(draft.ai_generated, ReportAIGeneratedV2)
    assert draft.manual_input.basic_info.age_gender.value is None
    assert draft.ai_generated.chief_complaint_draft.value is None
    assert draft.safety_flags.has_crisis is False
    assert draft.safety_flags.has_persisted_high_crisis is False
    assert draft.safety_flags.missing_required_manual_fields is True


def test_persisted_draft_can_represent_not_yet_generated_sections_as_null():
    draft = ReportDraftV2(
        case_id="case-1",
        session_id="session-1",
        disclaimer="fixed disclaimer",
        ai_generated=None,
        counselor_edits=None,
        final_report=None,
    )

    payload = draft.model_dump(mode="json")

    assert payload["ai_generated"] is None
    assert payload["counselor_edits"] is None
    assert payload["final_report"] is None


def test_schema_version_is_fixed_and_validated():
    draft = ReportDraftV2(
        case_id="case-1",
        session_id="session-1",
        disclaimer="fixed disclaimer",
    )

    assert draft.schema_version == "report_schema_v2"

    with pytest.raises(ValidationError):
        ReportDraftV2(
            schema_version="report_schema_v1",
            case_id="case-1",
            session_id="session-1",
            disclaimer="fixed disclaimer",
        )


def test_report_field_supports_null_pending_assessment_and_missing_reason():
    blank_field = ReportField(label_zh="年齡／性別", value=None)
    pending_field = ReportField(
        label_zh="精神病性症狀",
        value="待評估",
        source_type=ReportSourceType.UNAVAILABLE,
        missing_reason=MissingReason.NOT_ASSESSED,
        needs_review=True,
    )

    assert blank_field.value is None
    assert pending_field.value == "待評估"
    assert pending_field.missing_reason == MissingReason.NOT_ASSESSED
    assert pending_field.source_type == ReportSourceType.UNAVAILABLE


def test_manual_only_fields_are_not_required_in_ai_generated_model():
    ai_generated = ReportAIGeneratedV2(
        chief_complaint_draft=ReportField(
            label_zh="主訴摘要",
            value="可能與近期壓力相關，尚待諮商師確認。",
            source_type=ReportSourceType.AI,
            evidence_refs=[ReportEvidenceRefV2(turn_number=1, note="summary only")],
        )
    )

    dumped = ai_generated.model_dump(mode="json")
    serialized = json.dumps(dumped, ensure_ascii=False)

    assert "可能與近期壓力相關" in serialized
    assert "test_scores" not in dumped
    assert "medication" not in dumped
    assert "legal" not in dumped
    assert "safety_plan" not in dumped
    assert "diagnosis" not in dumped


def test_ai_generated_model_rejects_unknown_manual_only_fields():
    with pytest.raises(ValidationError):
        ReportAIGeneratedV2.model_validate(
            {
                "chief_complaint_draft": {
                    "label_zh": "主訴摘要",
                    "value": "可能與近期壓力相關，仍需諮商師確認。",
                    "source_type": "ai",
                },
                "formal_diagnosis_notes": "AI must not fill diagnosis",
            }
        )

    with pytest.raises(ValidationError):
        ReportAIGeneratedV2.model_validate(
            {
                "safety_plan": {
                    "label_zh": "安全計畫",
                    "value": "AI must not write safety plans",
                    "source_type": "ai",
                }
            }
        )


def test_report_field_rejects_unknown_raw_or_manual_only_fields():
    with pytest.raises(ValidationError):
        ReportField(
            label_zh="主訴摘要",
            value="可能與壓力相關，仍需諮商師確認。",
            source_type=ReportSourceType.AI,
            raw_message_text="raw client text must not be accepted",
        )

    with pytest.raises(ValidationError):
        ReportField(
            label_zh="主訴摘要",
            value="可能與壓力相關，仍需諮商師確認。",
            source_type=ReportSourceType.AI,
            medication="manual-only field must not be accepted",
        )


def test_evidence_refs_do_not_accept_raw_message_text():
    evidence = ReportEvidenceRefV2(
        turn_number=2,
        summary_id="summary-2",
        note="safe summary reference",
    )

    assert evidence.turn_number == 2
    assert evidence.summary_id == "summary-2"

    with pytest.raises(ValidationError):
        ReportEvidenceRefV2(
            turn_number=2,
            summary_id="summary-2",
            raw_message_text="raw client text must not be accepted",
        )


def test_manual_input_can_mark_unsupported_sensitive_fields_unavailable():
    manual_input = ReportManualInputV2()
    manual_input.risk_assessment.psychotic_symptoms = ReportField(
        label_zh="精神病性症狀",
        value="待評估",
        source_type=ReportSourceType.UNAVAILABLE,
        missing_reason=MissingReason.NOT_ASSESSED,
        needs_review=True,
    )
    manual_input.formal_diagnosis_notes = ReportField(
        label_zh="診斷相關備註",
        value=None,
        source_type=ReportSourceType.UNAVAILABLE,
        missing_reason=MissingReason.NO_DATA,
        needs_review=True,
    )

    assert manual_input.risk_assessment.psychotic_symptoms.value == "待評估"
    assert manual_input.formal_diagnosis_notes.value is None
    assert manual_input.formal_diagnosis_notes.missing_reason == MissingReason.NO_DATA


@pytest.mark.parametrize(
    ("field_name", "invalid_value"),
    [
        ("status", "finished"),
        ("source_type", "provider"),
        ("missing_reason", "invented"),
        ("risk_level", "urgent"),
    ],
)
def test_enums_reject_invalid_values(field_name, invalid_value):
    if field_name == "status":
        with pytest.raises(ValidationError):
            ReportDraftV2(
                case_id="case-1",
                session_id="session-1",
                status=invalid_value,
                disclaimer="fixed disclaimer",
            )
    elif field_name == "source_type":
        with pytest.raises(ValidationError):
            ReportField(
                label_zh="欄位",
                value="內容",
                source_type=invalid_value,
            )
    elif field_name == "missing_reason":
        with pytest.raises(ValidationError):
            ReportField(
                label_zh="欄位",
                value=None,
                missing_reason=invalid_value,
            )
    elif field_name == "risk_level":
        with pytest.raises(ValidationError):
            ReportManualInputV2().risk_assessment.model_copy(
                update={"overall_risk_level": invalid_value}
            ).model_validate({"overall_risk_level": invalid_value})


def test_risk_level_accepts_only_supported_values():
    manual_input = ReportManualInputV2()
    manual_input.risk_assessment.overall_risk_level = RiskLevel.PENDING_ASSESSMENT

    assert manual_input.risk_assessment.overall_risk_level == RiskLevel.PENDING_ASSESSMENT

    with pytest.raises(ValidationError):
        type(manual_input.risk_assessment).model_validate(
            {"overall_risk_level": "emergency"}
        )


def test_safety_flags_default_safely_and_allow_explicit_backend_crisis_metadata():
    defaults = ReportSafetyFlagsV2()
    explicit = ReportSafetyFlagsV2(
        has_crisis=True,
        has_persisted_high_crisis=True,
        contains_diagnostic_language_needing_review=True,
        contains_manual_risk_input=True,
        missing_required_manual_fields=False,
    )

    assert defaults.has_crisis is False
    assert defaults.has_persisted_high_crisis is False
    assert defaults.contains_diagnostic_language_needing_review is False
    assert defaults.contains_manual_risk_input is False
    assert defaults.missing_required_manual_fields is True
    assert explicit.has_crisis is True
    assert explicit.has_persisted_high_crisis is True


def test_model_serialization_is_json_compatible():
    draft = ReportDraftV2(
        draft_id="draft-1",
        case_id="case-1",
        session_id="session-1",
        status=ReportDraftStatus.AI_GENERATED,
        disclaimer="fixed disclaimer",
        source_refs=[
            ReportEvidenceRefV2(turn_number=1, summary_id="summary-1", note="safe ref")
        ],
        ai_generated=ReportAIGeneratedV2(
            formation_factors=ReportField(
                label_zh="形成因素",
                value=["可能與長期壓力相關"],
                source_type=ReportSourceType.AI,
                needs_review=True,
            )
        ),
        generated_at="2026-05-27T00:00:00+00:00",
    )

    payload = draft.model_dump(mode="json")
    encoded = json.dumps(payload, ensure_ascii=False)

    assert payload["schema_version"] == "report_schema_v2"
    assert payload["status"] == "ai_generated"
    assert payload["source_refs"][0]["turn_number"] == 1
    assert "raw_message_text" not in encoded


def test_absent_sensitive_history_fields_are_not_required():
    draft = ReportDraftV2(
        case_id="case-1",
        session_id="session-1",
        disclaimer="fixed disclaimer",
    )
    payload = draft.model_dump(mode="json")
    encoded = json.dumps(payload, ensure_ascii=False)

    assert draft.manual_input.assessment_testing_data.value is None
    assert draft.manual_input.formal_diagnosis_notes.value is None
    assert "medication_history" not in encoded
    assert "legal_issues" not in encoded
    assert "trauma_history" not in encoded
    assert "family_history" not in encoded
