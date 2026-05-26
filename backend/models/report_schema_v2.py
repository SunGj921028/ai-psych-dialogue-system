from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


SCHEMA_VERSION_V2 = "report_schema_v2"


class ReportDraftStatus(str, Enum):
    MANUAL_INPUT_STARTED = "manual_input_started"
    AI_GENERATED = "ai_generated"
    COUNSELOR_EDITING = "counselor_editing"
    REVIEWED = "reviewed"
    EXPORTED = "exported"


class ReportSourceType(str, Enum):
    MANUAL = "manual"
    AI = "ai"
    MIXED = "mixed"
    SYSTEM = "system"
    UNAVAILABLE = "unavailable"


class MissingReason(str, Enum):
    NO_DATA = "no_data"
    NOT_ASSESSED = "not_assessed"
    NOT_APPLICABLE = "not_applicable"
    LEGACY_DATA = "legacy_data"


class RiskLevel(str, Enum):
    NONE = "none"
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    UNKNOWN = "unknown"
    PENDING_ASSESSMENT = "pending_assessment"


FieldValue = str | int | float | bool | list[Any] | dict[str, Any] | None


class ReportEvidenceRefV2(BaseModel):
    """Safe source pointer; does not carry raw conversation text."""

    model_config = ConfigDict(extra="forbid")

    turn_number: int | None = None
    summary_id: str | None = None
    note: str | None = None


ReportSourceRefV2 = ReportEvidenceRefV2


class ReportField(BaseModel):
    label_zh: str
    value: FieldValue = None
    source_type: ReportSourceType = ReportSourceType.UNAVAILABLE
    missing_reason: MissingReason | None = MissingReason.NO_DATA
    needs_review: bool = True
    evidence_refs: list[ReportEvidenceRefV2] = Field(default_factory=list)


def _field(
    label_zh: str,
    *,
    source_type: ReportSourceType = ReportSourceType.UNAVAILABLE,
    missing_reason: MissingReason | None = MissingReason.NO_DATA,
    needs_review: bool = True,
):
    return Field(
        default_factory=lambda: ReportField(
            label_zh=label_zh,
            source_type=source_type,
            missing_reason=missing_reason,
            needs_review=needs_review,
        )
    )


class BasicInfoManualV2(BaseModel):
    case_code: ReportField = _field("個案代號", source_type=ReportSourceType.SYSTEM)
    age_gender: ReportField = _field("年齡／性別")
    occupation_school_status: ReportField = _field("職業／就學狀態")
    marital_family_status: ReportField = _field("婚姻／家庭狀態")
    referral_source: ReportField = _field("轉介來源")
    session_count: ReportField = _field("會談次數")
    session_date: ReportField = _field("會談日期")


class ProblemOnsetCourseManualV2(BaseModel):
    onset_time: ReportField = _field("起始時間")
    triggering_or_worsening_events: ReportField = _field("觸發／惡化事件")
    development_course: ReportField = _field("問題發展歷程")
    client_understanding: ReportField = _field("個案對問題的理解")


class SymptomFunctionImpactV2(BaseModel):
    domain: str
    observation: ReportField
    severity_0_to_10: ReportField


def _symptom_domain(domain: str) -> SymptomFunctionImpactV2:
    return SymptomFunctionImpactV2(
        domain=domain,
        observation=ReportField(
            label_zh=f"{domain}觀察／評估",
            source_type=ReportSourceType.MIXED,
            missing_reason=MissingReason.NO_DATA,
            needs_review=True,
        ),
        severity_0_to_10=ReportField(
            label_zh=f"{domain}嚴重度（0-10）",
            source_type=ReportSourceType.MANUAL,
            missing_reason=MissingReason.NOT_ASSESSED,
            needs_review=True,
        ),
    )


class AutomaticThoughtRowV2(BaseModel):
    situation: ReportField = _field("情境", source_type=ReportSourceType.MIXED)
    automatic_thought: ReportField = _field(
        "自動化思考",
        source_type=ReportSourceType.MIXED,
    )
    emotion: ReportField = _field("情緒", source_type=ReportSourceType.MIXED)
    behavior: ReportField = _field("行為", source_type=ReportSourceType.MIXED)


class CurrentAssessmentManualV2(BaseModel):
    symptom_function_impacts: list[SymptomFunctionImpactV2] = Field(
        default_factory=lambda: [
            _symptom_domain("情緒"),
            _symptom_domain("認知"),
            _symptom_domain("行為"),
            _symptom_domain("生理"),
            _symptom_domain("人際"),
            _symptom_domain("學業／工作"),
            _symptom_domain("日常生活功能"),
        ]
    )
    primary_emotions: ReportField = _field(
        "主要情緒",
        source_type=ReportSourceType.MIXED,
    )
    triggering_situations: ReportField = _field(
        "誘發情境",
        source_type=ReportSourceType.MIXED,
    )
    intensity_and_duration: ReportField = _field(
        "強度與持續時間",
        source_type=ReportSourceType.MIXED,
    )
    regulation_methods: ReportField = _field(
        "調節方式",
        source_type=ReportSourceType.MIXED,
    )
    automatic_thoughts: list[AutomaticThoughtRowV2] = Field(default_factory=list)
    intermediate_beliefs: ReportField = _field(
        "中間信念",
        source_type=ReportSourceType.MIXED,
    )
    core_beliefs: ReportField = _field(
        "核心信念",
        source_type=ReportSourceType.MIXED,
    )
    problem_behaviors: ReportField = _field(
        "問題行為",
        source_type=ReportSourceType.MIXED,
    )
    coping_strategies: ReportField = _field(
        "因應策略",
        source_type=ReportSourceType.MIXED,
    )
    interpersonal_style: ReportField = _field(
        "人際互動風格",
        source_type=ReportSourceType.MIXED,
    )


class PsychologicalAssessmentManualV2(BaseModel):
    temperament_personality_traits: ReportField = _field(
        "氣質／人格特質",
        source_type=ReportSourceType.MIXED,
    )
    defense_mechanisms: ReportField = _field(
        "防衛機制",
        source_type=ReportSourceType.MIXED,
    )
    internal_conflicts: ReportField = _field(
        "內在衝突",
        source_type=ReportSourceType.MIXED,
    )


class TheoryOrientationManualV2(BaseModel):
    selected_orientations: ReportField = _field(
        "主要理論取向",
        source_type=ReportSourceType.MIXED,
    )
    other_orientation: ReportField = _field("其他理論取向")


class RiskAssessmentManualV2(BaseModel):
    suicide_ideation: ReportField = _field("自殺意念")
    suicide_plan_intent: ReportField = _field("自殺計畫／意圖")
    self_harm_behavior: ReportField = _field("自傷行為")
    harm_to_others_risk: ReportField = _field("他傷風險")
    substance_misuse: ReportField = _field("物質濫用")
    psychotic_symptoms: ReportField = _field(
        "精神病性症狀",
        missing_reason=MissingReason.NOT_ASSESSED,
    )
    overall_risk_level: RiskLevel = RiskLevel.PENDING_ASSESSMENT
    overall_risk_notes: ReportField = _field("整體風險等級說明")
    safety_plan: ReportField = _field("安全計畫／危機處置")


class ReportManualInputV2(BaseModel):
    basic_info: BasicInfoManualV2 = Field(default_factory=BasicInfoManualV2)
    problem_onset_course: ProblemOnsetCourseManualV2 = Field(
        default_factory=ProblemOnsetCourseManualV2
    )
    current_assessment: CurrentAssessmentManualV2 = Field(
        default_factory=CurrentAssessmentManualV2
    )
    psychological_assessment: PsychologicalAssessmentManualV2 = Field(
        default_factory=PsychologicalAssessmentManualV2
    )
    theory_orientation: TheoryOrientationManualV2 = Field(
        default_factory=TheoryOrientationManualV2
    )
    risk_assessment: RiskAssessmentManualV2 = Field(
        default_factory=RiskAssessmentManualV2
    )
    assessment_testing_data: ReportField = _field("心理評估／測驗資料")
    formal_diagnosis_notes: ReportField = _field("診斷相關備註")


class ReportAIGeneratedV2(BaseModel):
    chief_complaint_draft: ReportField = _field(
        "主訴摘要",
        source_type=ReportSourceType.AI,
    )
    problem_development_draft: ReportField = _field(
        "問題起始與演變草稿",
        source_type=ReportSourceType.AI,
    )
    client_understanding_draft: ReportField = _field(
        "個案對問題的理解草稿",
        source_type=ReportSourceType.AI,
    )
    emotion_pattern: ReportField = _field(
        "情緒模式",
        source_type=ReportSourceType.AI,
    )
    cognitive_pattern: ReportField = _field(
        "認知模式",
        source_type=ReportSourceType.AI,
    )
    behavior_coping_pattern: ReportField = _field(
        "行為與因應模式",
        source_type=ReportSourceType.AI,
    )
    psychological_factors: ReportField = _field(
        "心理因素",
        source_type=ReportSourceType.AI,
    )
    theoretical_orientation_rationale: ReportField = _field(
        "理論取向理由",
        source_type=ReportSourceType.AI,
    )
    conceptualization_narrative: ReportField = _field(
        "概念化敘述",
        source_type=ReportSourceType.AI,
    )
    formation_factors: ReportField = _field(
        "形成因素",
        source_type=ReportSourceType.AI,
    )
    precipitating_factors: ReportField = _field(
        "誘發因素",
        source_type=ReportSourceType.AI,
    )
    maintaining_factors: ReportField = _field(
        "維持因素",
        source_type=ReportSourceType.AI,
    )
    protective_factors: ReportField = _field(
        "保護因素",
        source_type=ReportSourceType.AI,
    )
    crisis_language_summary: ReportField = _field(
        "危機語句摘要",
        source_type=ReportSourceType.AI,
    )


class ReportTemplateSectionsV2(BaseModel):
    basic_information_and_chief_complaint: dict[str, ReportField] = Field(
        default_factory=dict
    )
    current_assessment_and_observation: dict[str, ReportField] = Field(
        default_factory=dict
    )
    psychological_assessment: dict[str, ReportField] = Field(default_factory=dict)
    theoretical_orientation_and_conceptualization: dict[str, ReportField] = Field(
        default_factory=dict
    )
    risk_assessment: dict[str, ReportField] = Field(default_factory=dict)


class ReportCounselorEditsV2(ReportTemplateSectionsV2):
    pass


class ReportFinalV2(ReportTemplateSectionsV2):
    pass


class ReportSafetyFlagsV2(BaseModel):
    has_crisis: bool = False
    has_persisted_high_crisis: bool = False
    contains_diagnostic_language_needing_review: bool = False
    contains_manual_risk_input: bool = False
    missing_required_manual_fields: bool = True


class ReportDraftV2(BaseModel):
    schema_version: Literal["report_schema_v2"] = SCHEMA_VERSION_V2
    draft_id: str | None = None
    case_id: str
    session_id: str
    status: ReportDraftStatus = ReportDraftStatus.MANUAL_INPUT_STARTED
    manual_input: ReportManualInputV2 = Field(default_factory=ReportManualInputV2)
    ai_generated: ReportAIGeneratedV2 = Field(default_factory=ReportAIGeneratedV2)
    counselor_edits: ReportCounselorEditsV2 = Field(
        default_factory=ReportCounselorEditsV2
    )
    final_report: ReportFinalV2 = Field(default_factory=ReportFinalV2)
    source_refs: list[ReportSourceRefV2] = Field(default_factory=list)
    safety_flags: ReportSafetyFlagsV2 = Field(default_factory=ReportSafetyFlagsV2)
    disclaimer: str
    created_at: str | datetime | None = None
    updated_at: str | datetime | None = None
    generated_at: str | datetime | None = None
    reviewed_at: str | datetime | None = None
    exported_at: str | datetime | None = None
