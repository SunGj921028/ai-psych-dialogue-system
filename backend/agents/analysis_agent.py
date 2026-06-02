import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Literal

from openai import AsyncOpenAI
from pydantic import BaseModel, Field, ValidationError, field_validator

from agents import get_llm_client
from agents.summary_agent import TurnSummary
from models.report_schema_v2 import ReportAIGeneratedV2, ReportField, ReportManualInputV2

logger = logging.getLogger(__name__)

DISCLAIMER_TEXT = (
    "本報告為 AI 草稿，僅供諮商師參考，非診斷文件。\n"
    "所有判斷與決策須由專業諮商師負責審核。"
)

REPORT_V2_PROMPT_VERSION = "report_v2_prompt_001"
REPORT_V2_MAX_KEY_STATEMENT_CHARS = 160
REPORT_V2_ALLOWED_EVIDENCE_NOTES = {
    "summary metadata",
    "manual input",
    "persisted crisis level",
}
REPORT_V2_PROVIDER_MODE_DETERMINISTIC = "deterministic"
REPORT_V2_PROVIDER_MODE_PROVIDER = "provider"
REPORT_V2_PROVIDER_MODES = {
    REPORT_V2_PROVIDER_MODE_DETERMINISTIC,
    REPORT_V2_PROVIDER_MODE_PROVIDER,
}
REPORT_V2_PROVIDER_GEMINI = "gemini"
REPORT_V2_PROVIDER_GROQ = "groq"
REPORT_V2_PROVIDERS = {
    REPORT_V2_PROVIDER_GEMINI,
    REPORT_V2_PROVIDER_GROQ,
}
REPORT_V2_PROVIDER_BASE_URLS = {
    REPORT_V2_PROVIDER_GEMINI: "https://generativelanguage.googleapis.com/v1beta/openai/",
    REPORT_V2_PROVIDER_GROQ: "https://api.groq.com/openai/v1",
}
REPORT_V2_DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
REPORT_V2_DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile"
ReportV2GenerationErrorCategory = Literal[
    "missing_summaries",
    "provider_config",
    "provider_api_failure",
    "invalid_provider_json",
    "schema_validation_failed",
    "unsafe_evidence_refs",
    "db_persistence_failed",
    "unknown_generation_failure",
]
REPORT_V2_ALLOWED_AI_FIELDS = [
    "chief_complaint_draft",
    "problem_development_draft",
    "client_understanding_draft",
    "emotion_pattern",
    "cognitive_pattern",
    "behavior_coping_pattern",
    "psychological_factors",
    "theoretical_orientation_rationale",
    "conceptualization_narrative",
    "formation_factors",
    "precipitating_factors",
    "maintaining_factors",
    "protective_factors",
    "crisis_language_summary",
]
REPORT_V2_AI_FIELD_LABELS = {
    "chief_complaint_draft": "主訴草稿",
    "problem_development_draft": "問題發展草稿",
    "client_understanding_draft": "個案對問題理解草稿",
    "emotion_pattern": "情緒模式",
    "cognitive_pattern": "認知模式",
    "behavior_coping_pattern": "行為與因應模式",
    "psychological_factors": "心理因素",
    "theoretical_orientation_rationale": "理論取向理由",
    "conceptualization_narrative": "概念化敘述",
    "formation_factors": "形成因素",
    "precipitating_factors": "誘發因素",
    "maintaining_factors": "維持因素",
    "protective_factors": "保護因素",
    "crisis_language_summary": "危機語言摘要",
}
REPORT_V2_AI_SOURCE_TYPE_ALIASES = {
    "ai",
    "ai_draft",
    "ai-generated",
    "ai_generated",
    "generated",
    "ai 草稿",
    "llm",
    "model",
    "provider",
}
REPORT_V2_FORBIDDEN_FIELDS = [
    "formal_diagnosis_notes",
    "assessment_testing_data",
    "medication",
    "legal_issues",
    "test_scores",
    "safety_plan",
    "overall_risk_level",
    "treatment_plan",
    "trauma_history",
    "family_history",
    "raw_message_text",
    "disclaimer",
    "status",
    "generated_at",
]


class ReportV2GenerationError(ValueError):
    """Safe internal Report v2 generation failure classification."""

    def __init__(
        self,
        category: ReportV2GenerationErrorCategory,
        *,
        cause: Exception | None = None,
    ) -> None:
        self.category = category
        super().__init__(f"Report v2 generation failed ({category})")
        if cause is not None:
            self.__cause__ = cause


class EmotionPattern(BaseModel):
    description: str
    dominant_emotions: list[str] = Field(default_factory=list)
    intensity_trend: Literal["ascending", "descending", "fluctuating", "stable"] = "stable"
    peak_turn: int

    @field_validator("dominant_emotions", mode="before")
    @classmethod
    def trim_dominant_emotions(cls, value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        cleaned = [str(v).strip() for v in value if str(v).strip()]
        return cleaned[:3]


class ConceptualizationReport(BaseModel):
    case_id: str
    session_id: str
    generated_at: str
    chief_complaint: str
    emotion_pattern: EmotionPattern
    cognitive_behavioral_analysis: str
    initial_conceptualization: str
    suggested_directions: list[str] = Field(default_factory=list)
    crisis_summary: str
    disclaimer: str
    has_crisis: bool

    @field_validator("suggested_directions", mode="before")
    @classmethod
    def trim_directions(cls, value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        cleaned = [str(v).strip() for v in value if str(v).strip()]
        return cleaned[:3]


def _now_iso_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _get_report_v2_provider_mode() -> str:
    raw = os.getenv("REPORT_V2_PROVIDER_MODE", "").strip().lower()
    if not raw:
        return REPORT_V2_PROVIDER_MODE_DETERMINISTIC
    if raw not in REPORT_V2_PROVIDER_MODES:
        raise ReportV2GenerationError("provider_config")
    return raw


def _get_report_v2_provider() -> str:
    raw = os.getenv("REPORT_V2_PROVIDER", "").strip().lower()
    if not raw:
        return REPORT_V2_PROVIDER_GEMINI
    if raw not in REPORT_V2_PROVIDERS:
        raise ReportV2GenerationError("provider_config")
    return raw


def _get_report_v2_model(provider: str) -> str:
    configured_model = (os.getenv("REPORT_V2_MODEL") or "").strip()
    if configured_model:
        return configured_model

    if provider == REPORT_V2_PROVIDER_GEMINI:
        return os.getenv("ANALYSIS_MODEL") or REPORT_V2_DEFAULT_GEMINI_MODEL

    if provider == REPORT_V2_PROVIDER_GROQ:
        return REPORT_V2_DEFAULT_GROQ_MODEL

    raise ReportV2GenerationError("provider_config")


def _get_report_v2_provider_client(provider: str) -> AsyncOpenAI:
    if provider not in REPORT_V2_PROVIDERS:
        raise ReportV2GenerationError("provider_config")

    report_api_key = (os.getenv("REPORT_V2_API_KEY") or "").strip()
    if not report_api_key:
        try:
            return get_llm_client(provider)
        except ReportV2GenerationError:
            raise
        except Exception as exc:
            raise ReportV2GenerationError("provider_config", cause=exc) from exc

    base_url = REPORT_V2_PROVIDER_BASE_URLS.get(provider)
    if not base_url:
        raise ReportV2GenerationError("provider_config")

    try:
        return AsyncOpenAI(
            api_key=report_api_key,
            base_url=base_url,
        )
    except Exception as exc:
        raise ReportV2GenerationError("provider_config", cause=exc) from exc


def _extract_json_object(text: str) -> dict[str, Any]:
    body = (text or "").strip()
    if body.startswith("{") and body.endswith("}"):
        return json.loads(body)

    start = body.find("{")
    end = body.rfind("}")
    if start != -1 and end != -1 and end > start:
        return json.loads(body[start : end + 1])

    raise ValueError("找不到可解析的 JSON 物件")


def _get_report_v2_curated_knowledge_excerpts() -> list[str]:
    """Fixed, allowlisted reference excerpts for future Report v2 prompting."""
    return [
        "知識庫僅提供概念化語彙、撰寫風格與安全邊界，不可作為個案事實來源。",
        "撰寫時需區分事實與推論；推論使用「可能」「推測」「尚待確認」「需由諮商師確認」。",
        "缺失資料應留空、設為 null，或標示「待評估」，不得臆造症狀、史實、測驗分數或風險細節。",
        "理論取向可提供初步概念化語言，但不得自動化診斷、用藥建議、正式治療計畫或正式風險等級。",
    ]


def _bounded_report_v2_text(value: Any, max_chars: int = REPORT_V2_MAX_KEY_STATEMENT_CHARS) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if len(text) <= max_chars:
        return text
    return f"{text[:max_chars]}..."


def _safe_report_v2_summary_payload(row: dict[str, Any]) -> dict[str, Any]:
    summary = row.get("summary")
    if isinstance(summary, TurnSummary):
        summary_data = summary.model_dump(mode="json")
    elif isinstance(summary, dict):
        summary_data = summary
    else:
        summary_data = {}

    turn_number = row.get("turn_number", summary_data.get("turn_number"))
    crisis_flag = row.get("crisis_flag", summary_data.get("crisis_flag"))

    shaped: dict[str, Any] = {
        "summary_id": row.get("id"),
        "turn_number": turn_number,
        "emotion": summary_data.get("emotion"),
        "emotion_dimensions": summary_data.get("emotion_dimensions"),
        "themes": summary_data.get("themes"),
        "key_statement": _bounded_report_v2_text(summary_data.get("key_statement")),
        "crisis_flag": crisis_flag,
        "crisis_level": row.get("crisis_level"),
    }
    return {key: value for key, value in shaped.items() if value is not None}


def _build_report_v2_prompt_payload(
    *,
    case_id: str,
    session_id: str,
    summaries: list[dict[str, Any]],
    manual_input: ReportManualInputV2,
    knowledge_excerpts: list[str] | None = None,
) -> dict[str, Any]:
    excerpts = knowledge_excerpts if knowledge_excerpts is not None else _get_report_v2_curated_knowledge_excerpts()
    return {
        "prompt_version": REPORT_V2_PROMPT_VERSION,
        "case_id": case_id,
        "session_id": session_id,
        "instructions": {
            "system_role": "你是協助諮商師撰寫個案概念化報告草稿的 AI 文件助理；諮商師是唯一決策者。",
            "safety_boundaries": [
                "不得提供心理或精神科診斷。",
                "不得填寫診斷、用藥、法律、測驗分數、正式風險等級、安全計畫或治療計畫等人工確認欄位。",
                "不得將知識庫內容當作個案事實。",
                "所有推論都需使用可能、推測、尚待確認、需由諮商師確認等謹慎語句。",
            ],
            "authoritative_template_sections": [
                "一、基本資料與主訴",
                "二、現況評估與觀察",
                "三、心理評估",
                "四、理論取向與個案概念化",
                "五、風險評估",
            ],
            "allowed_ai_owned_fields": REPORT_V2_ALLOWED_AI_FIELDS,
            "forbidden_manual_only_or_system_fields": REPORT_V2_FORBIDDEN_FIELDS,
            "source_data_policy": (
                "source data 僅包含經驗證的 manual_input 與結構化 session summaries；"
                "不得使用 raw messages、crisis reason、session title、browser storage、provider debug output 或 DB round。"
            ),
            "crisis_level_policy": (
                "persisted crisis_level 只是後端偵測到的語句中繼資料，"
                "不是正式風險評估或整體風險等級；可作為 crisis_language_summary 的語言線索背景，"
                "但不得使用或推測 crisis detector reasons。"
            ),
            "risk_language_screening": {
                "target_field": "crisis_language_summary",
                "purpose": (
                    "Write a language-cue screening summary based only on available conversation "
                    "summaries and persisted crisis_level metadata; this is not a formal risk "
                    "assessment and requires counselor review."
                ),
                "subareas_to_cover_when_possible": [
                    "suicide ideation language",
                    "suicide plan/intent language",
                    "self-harm language",
                    "harm-to-others language",
                    "substance-use language",
                    "psychotic-symptom language",
                    "overall risk-language screening impression",
                ],
                "writing_rules": [
                    "Use Traditional Chinese in the ReportField value.",
                    "If a topic is explicitly denied in the summaries, state that the dialogue contains denial of that cue.",
                    "If a topic is simply absent, state that no related language cue is shown in the available summaries instead of treating it as confirmed absent.",
                    "For overall risk-language screening impression, reference persisted crisis_level only as system metadata / screening impression, not as a formal clinical risk level.",
                    "Do not add formal diagnosis, formal risk assessment, safety plan generation, treatment decisions, or manual-only risk fields.",
                ],
            },
            "client_understanding_draft_guidance": {
                "target_field": "client_understanding_draft",
                "purpose": (
                    "When summaries provide enough evidence, draft the client's own understanding, "
                    "attribution, or meaning-making about the problem. The manual input remains "
                    "counselor-confirmed and primary; AI output is only a review-needed supplement."
                ),
                "writing_rules": [
                    "Use Traditional Chinese in the ReportField value.",
                    "Describe the client's own wording-level understanding, attribution, or meaning-making when it is supported by summaries.",
                    "Do not infer this field from general symptoms alone.",
                    "If evidence is insufficient, leave the field empty/null/待評估 and set missing_reason to no_data or not_assessed.",
                    "不得臆造個案觀點、歸因、意義建構或主訴補充。",
                ],
            },
            "theoretical_orientation_rationale_guidance": {
                "target_field": "theoretical_orientation_rationale",
                "purpose": (
                    "Provide a cautious initial orientation recommendation only when evidence supports it, "
                    "then explain why it may fit. This is draft wording for counselor review, not a formal clinical decision."
                ),
                "required_opening": [
                    "初步建議取向：認知行為治療（CBT）。",
                    "初步建議取向：待與督導確認。",
                ],
                "writing_rules": [
                    "theoretical_orientation_rationale 的 value 必須以「初步建議取向：」開頭。",
                    "If cognitive, behavioral, emotion-regulation, avoidance, or coping-pattern evidence supports CBT, explicitly name 認知行為治療（CBT） as the initial recommended orientation.",
                    "If evidence does not support a specific orientation, begin with 初步建議取向：待與督導確認。",
                    "Use cautious wording such as 初步建議取向、可能適合、需諮商師審閱、待與督導確認.",
                    "不得宣稱最終治療模式、正式治療決策、診斷或處遇計畫。",
                ],
            },
            "output_schema": "只輸出 JSON object，且必須符合 ReportAIGeneratedV2；未知欄位會被拒絕。",
            "output_field_contract": (
                "每個 AI 欄位都必須是完整 ReportField object，包含 "
                "label_zh、value、source_type、missing_reason、needs_review、evidence_refs。"
            ),
            "evidence_ref_policy": {
                "allowed_notes": sorted(REPORT_V2_ALLOWED_EVIDENCE_NOTES),
                "rules": [
                    "evidence_refs 僅能使用 turn_number、summary_id 與短標籤 note。",
                    "note 不得包含 raw message、summary excerpt、key_statement、crisis reason 或 provider text。",
                ],
            },
            "missing_data_policy": "缺失或未評估資料使用 null、空白或「待評估」，並設定合適 missing_reason；不得臆造。",
            "curated_knowledge_excerpts": excerpts,
        },
        "source_data": {
            "manual_input": manual_input.model_dump(mode="json"),
            "summaries": [_safe_report_v2_summary_payload(row) for row in summaries],
        },
    }


def _build_report_v2_messages(payload: dict[str, Any]) -> list[dict[str, str]]:
    system_content = (
        "你是 Report Schema v2 的個案概念化報告草稿助理。\n"
        "請遵守安全邊界：不得填寫診斷、不得提供用藥建議、不得產生正式風險等級、"
        "不得產生治療計畫，且不得將知識庫當作個案事實。\n"
        "For crisis_language_summary, write a dialogue-based risk-language screening only: "
        "it is not a formal risk assessment, uses summaries plus persisted crisis_level as metadata, "
        "requires counselor review, and must not use crisis detector reasons.\n"
        "For client_understanding_draft, write the client's own understanding, attribution, "
        "or meaning-making only when supported by summaries. If evidence is insufficient, "
        "leave it empty/null/待評估 with missing_reason no_data or not_assessed; manual input remains "
        "counselor-confirmed and primary.\n"
        "For theoretical_orientation_rationale, the value must begin with 初步建議取向：. "
        "When evidence supports CBT, begin with 初步建議取向：認知行為治療（CBT）。; "
        "otherwise begin with 初步建議取向：待與督導確認。. Use cautious wording such as "
        "可能適合、需諮商師審閱、待與督導確認. Do not claim a final treatment model "
        "or formal clinical decision.\n"
        "Cover suicide ideation language, suicide plan/intent language, self-harm language, "
        "harm-to-others language, substance-use language, psychotic-symptom language, "
        "and an overall risk-language screening impression when evidence allows.\n"
        "Do not provide formal diagnosis, formal risk assessment, safety plan generation, "
        "or treatment decisions.\n"
        "只輸出 JSON，必須符合 ReportAIGeneratedV2。\n"
        "每個欄位都必須輸出完整 ReportField object，包含 label_zh、value、"
        "source_type、missing_reason、needs_review、evidence_refs。\n"
        "evidence_refs 的 note 只能使用 summary metadata、manual input、persisted crisis level。"
    )
    return [
        {"role": "system", "content": system_content},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]


async def _call_report_v2_provider(
    messages_or_payload: Any,
    *,
    provider: str,
    model: str,
) -> str:
    if provider not in REPORT_V2_PROVIDERS:
        raise ReportV2GenerationError("provider_config")

    client = _get_report_v2_provider_client(provider)
    resp = await client.chat.completions.create(
        model=model,
        temperature=0.2,
        response_format={"type": "json_object"},
        messages=messages_or_payload,
    )
    return resp.choices[0].message.content or ""


def _parse_report_v2_provider_output(raw_output: str | dict[str, Any]) -> ReportAIGeneratedV2:
    try:
        if isinstance(raw_output, str):
            data = _extract_json_object(raw_output)
        elif isinstance(raw_output, dict):
            data = raw_output
        else:
            raise ReportV2GenerationError("invalid_provider_json")

        if not isinstance(data, dict):
            raise ReportV2GenerationError("invalid_provider_json")
    except ReportV2GenerationError:
        raise
    except (json.JSONDecodeError, ValueError) as exc:
        raise ReportV2GenerationError("invalid_provider_json", cause=exc) from exc
    except Exception as exc:
        raise ReportV2GenerationError("unknown_generation_failure", cause=exc) from exc

    try:
        normalized_data = _normalize_report_v2_ai_generated_payload(data)
        ai_generated = ReportAIGeneratedV2.model_validate(normalized_data)
    except ValidationError as exc:
        raise ReportV2GenerationError("schema_validation_failed", cause=exc) from exc
    except Exception as exc:
        raise ReportV2GenerationError("schema_validation_failed", cause=exc) from exc

    try:
        _validate_report_v2_evidence_refs(ai_generated)
    except ReportV2GenerationError:
        raise
    except Exception as exc:
        raise ReportV2GenerationError("unsafe_evidence_refs", cause=exc) from exc

    return ai_generated


def _is_report_v2_empty_value(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    if isinstance(value, (list, tuple, set, dict)):
        return len(value) == 0
    return False


def _default_report_v2_missing_reason(value: Any) -> str | None:
    return "no_data" if _is_report_v2_empty_value(value) else None


def _normalize_report_v2_ai_source_type(value: Any) -> Any:
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in REPORT_V2_AI_SOURCE_TYPE_ALIASES:
            return "ai"
    return "ai"


def _normalize_report_v2_missing_reason(value: Any, field_value: Any) -> str | None:
    default = _default_report_v2_missing_reason(field_value)
    if value is None:
        return default
    if not isinstance(value, str):
        return default

    normalized = value.strip().lower()
    if normalized in {"", "none"}:
        return default
    if normalized in {"missing", "unknown"}:
        return "no_data"
    if normalized in {"not evaluated", "not assessed", "待評估"}:
        return "not_assessed"
    if normalized == "不適用":
        return "not_applicable"
    if normalized in {"no_data", "not_assessed", "not_applicable", "legacy_data"}:
        return normalized
    return default


def _normalize_report_v2_ai_generated_payload(parsed: dict[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}

    for field_name, field_value in parsed.items():
        if field_name not in REPORT_V2_ALLOWED_AI_FIELDS:
            normalized[field_name] = field_value
            continue

        label_zh = REPORT_V2_AI_FIELD_LABELS[field_name]
        if isinstance(field_value, str):
            normalized[field_name] = {
                "label_zh": label_zh,
                "value": field_value,
                "source_type": "ai",
                "missing_reason": _default_report_v2_missing_reason(field_value),
                "needs_review": True,
                "evidence_refs": [],
            }
            continue

        if field_value is None:
            normalized[field_name] = {
                "label_zh": label_zh,
                "value": None,
                "source_type": "ai",
                "missing_reason": "no_data",
                "needs_review": True,
                "evidence_refs": [],
            }
            continue

        if isinstance(field_value, dict):
            normalized_field = dict(field_value)
            value = normalized_field.get("value")
            normalized_field.setdefault("label_zh", label_zh)
            normalized_field.setdefault("source_type", "ai")
            normalized_field["source_type"] = _normalize_report_v2_ai_source_type(
                normalized_field.get("source_type")
            )
            normalized_field.setdefault("needs_review", True)
            normalized_field.setdefault("evidence_refs", [])
            normalized_field["missing_reason"] = _normalize_report_v2_missing_reason(
                normalized_field.get("missing_reason"),
                value,
            )
            normalized[field_name] = normalized_field
            continue

        normalized[field_name] = field_value

    return normalized


def _validate_report_v2_evidence_refs(ai_generated: ReportAIGeneratedV2) -> None:
    for field_value in ai_generated.__dict__.values():
        if not isinstance(field_value, ReportField):
            continue
        for ref in field_value.evidence_refs:
            if ref.note is None:
                continue
            if ref.note not in REPORT_V2_ALLOWED_EVIDENCE_NOTES:
                raise ReportV2GenerationError("unsafe_evidence_refs")


def _calculate_peak_turn(summaries: list[TurnSummary]) -> int:
    if not summaries:
        return 0
    return max(summaries, key=lambda s: s.emotion.intensity).turn_number


def _build_insufficient_data_report(
    case_id: str,
    session_id: str,
    has_crisis: bool,
    peak_turn: int,
    min_turns: int,
) -> ConceptualizationReport:
    return ConceptualizationReport(
        case_id=case_id,
        session_id=session_id,
        generated_at=_now_iso_utc(),
        chief_complaint=f"對話輪次不足，無法生成完整報告（最少需要 {min_turns} 輪）",
        emotion_pattern=EmotionPattern(
            description="資料不足，無法判定穩定情緒模式。",
            dominant_emotions=[],
            intensity_trend="stable",
            peak_turn=peak_turn,
        ),
        cognitive_behavioral_analysis="",
        initial_conceptualization="",
        suggested_directions=[],
        crisis_summary=(
            "本次資料量不足，危機資訊需由諮商師進一步確認。"
            if has_crisis
            else "本次會談未偵測到危機語句。"
        ),
        disclaimer=DISCLAIMER_TEXT,
        has_crisis=has_crisis,
    )


def _build_generation_failed_report(
    case_id: str,
    session_id: str,
    has_crisis: bool,
    peak_turn: int,
) -> ConceptualizationReport:
    return ConceptualizationReport(
        case_id=case_id,
        session_id=session_id,
        generated_at=_now_iso_utc(),
        chief_complaint="報告生成失敗，請重試",
        emotion_pattern=EmotionPattern(
            description="",
            dominant_emotions=[],
            intensity_trend="stable",
            peak_turn=peak_turn,
        ),
        cognitive_behavioral_analysis="",
        initial_conceptualization="",
        suggested_directions=[],
        crisis_summary="",
        disclaimer=DISCLAIMER_TEXT,
        has_crisis=has_crisis,
    )


SYSTEM_PROMPT = """你是一位協助心理諮商師整理個案概念化的 AI 助理。
你將收到「單次會談」的 TurnSummary JSON 清單，請根據結構化欄位進行分析。

要求：
- 使用繁體中文，語氣專業但謹慎，避免確定性判斷。
- 可使用「可能」「初步觀察」「有待諮商師確認」等措辭。
- 不做 DSM 診斷，不提供確定診斷名稱。
- suggested_directions 僅列治療取向名稱（最多三個），不給具體治療計畫。

只輸出 JSON，且只能包含下列欄位：
{
  "chief_complaint": "...",
  "emotion_pattern": {
    "description": "...",
    "dominant_emotions": ["焦慮", "無助"],
    "intensity_trend": "ascending"
  },
  "cognitive_behavioral_analysis": "...",
  "initial_conceptualization": "...",
  "suggested_directions": ["認知行為治療（CBT）", "敘事治療"],
  "crisis_summary": "..."
}
"""


async def generate_report(
    case_id: str,
    session_id: str,
    summaries: list[TurnSummary],
) -> ConceptualizationReport:
    """
    設計選擇說明：
    1) 若 summaries 少於 MIN_TURNS_FOR_REPORT（預設 3），不呼叫 LLM，直接回傳資料不足報告。
    2) has_crisis 由程式碼彙整（any），不交給 LLM 判斷。
    3) peak_turn 由程式碼計算（最高 emotion.intensity 輪次），避免 LLM 數值誤判。
    4) JSON 解析/驗證失敗時回傳 fallback 報告並 logging.error，避免整體功能中斷。
    """
    min_turns = max(1, _env_int("MIN_TURNS_FOR_REPORT", 3))
    has_crisis = any(s.crisis_flag for s in summaries)
    peak_turn = _calculate_peak_turn(summaries)

    if len(summaries) < min_turns:
        return _build_insufficient_data_report(
            case_id=case_id,
            session_id=session_id,
            has_crisis=has_crisis,
            peak_turn=peak_turn,
            min_turns=min_turns,
        )

    model = os.getenv("ANALYSIS_MODEL", "gemini-1.5-pro")
    payload = [s.model_dump() for s in summaries]

    raw_content = ""
    try:
        client = get_llm_client("gemini")
        resp = await client.chat.completions.create(
            model=model,
            temperature=0.2,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "case_id": case_id,
                            "session_id": session_id,
                            "has_crisis": has_crisis,
                            "summaries": payload,
                        },
                        ensure_ascii=False,
                    ),
                },
            ],
        )

        raw_content = resp.choices[0].message.content or ""
        data = _extract_json_object(raw_content)

        emotion_raw = data.get("emotion_pattern", {}) if isinstance(data, dict) else {}
        if not isinstance(emotion_raw, dict):
            emotion_raw = {}
        emotion_raw.setdefault("description", "")
        emotion_raw.setdefault("intensity_trend", "stable")
        emotion_raw.setdefault("dominant_emotions", [])
        emotion_raw["peak_turn"] = peak_turn

        report = ConceptualizationReport(
            case_id=case_id,
            session_id=session_id,
            generated_at=_now_iso_utc(),
            chief_complaint=str(data.get("chief_complaint", "")).strip(),
            emotion_pattern=EmotionPattern.model_validate(emotion_raw),
            cognitive_behavioral_analysis=str(data.get("cognitive_behavioral_analysis", "")).strip(),
            initial_conceptualization=str(data.get("initial_conceptualization", "")).strip(),
            suggested_directions=data.get("suggested_directions", []),
            crisis_summary=str(data.get("crisis_summary", "")).strip(),
            disclaimer=DISCLAIMER_TEXT,
            has_crisis=has_crisis,
        )

        if not report.chief_complaint:
            report.chief_complaint = "報告生成失敗，請重試"
        return report

    except Exception as exc:
        import hashlib

        raw_content_str = raw_content if isinstance(raw_content, str) else str(raw_content)
        raw_preview = raw_content_str[:60].replace("\n", " ") + ("..." if len(raw_content_str) > 60 else "")
        raw_length = len(raw_content_str)
        raw_hash = hashlib.sha256(raw_content_str.encode("utf-8")).hexdigest()[:12]
        
        logger.error(
            "analysis_report_generation_failed case_id=%s session_id=%s error=%s raw_output_len=%d raw_hash=%s raw_preview=%r",
            case_id,
            session_id,
            type(exc).__name__,
            raw_length,
            raw_hash,
            raw_preview,
        )
        if logger.isEnabledFor(logging.DEBUG):
            logger.debug(
                "analysis_report_generation_failed FULL raw_output for case_id=%s session_id=%s: %r",
                case_id,
                session_id,
                raw_content_str,
            )
        return _build_generation_failed_report(
            case_id=case_id,
            session_id=session_id,
            has_crisis=has_crisis,
            peak_turn=peak_turn,
        )


async def generate_report_v2_ai_draft(
    *,
    case_id: str,
    session_id: str,
    summaries: list[dict],
    manual_input: ReportManualInputV2,
    knowledge_excerpts: list[str] | None = None,
) -> ReportAIGeneratedV2:
    """
    Report Schema v2 AI draft generation.

    Default deterministic mode avoids live provider calls and returns a
    conservative schema-valid draft. Explicit provider mode builds the safe v2
    prompt payload, calls the provider boundary, and accepts only validated
    ReportAIGeneratedV2 output.
    """
    mode = _get_report_v2_provider_mode()
    if mode == REPORT_V2_PROVIDER_MODE_DETERMINISTIC:
        _ = (case_id, session_id, summaries, manual_input, knowledge_excerpts)
        return ReportAIGeneratedV2.model_validate({})

    payload = _build_report_v2_prompt_payload(
        case_id=case_id,
        session_id=session_id,
        summaries=summaries,
        manual_input=manual_input,
        knowledge_excerpts=knowledge_excerpts,
    )
    messages = _build_report_v2_messages(payload)
    try:
        provider = _get_report_v2_provider()
        raw_output = await _call_report_v2_provider(
            messages,
            provider=provider,
            model=_get_report_v2_model(provider),
        )
    except ReportV2GenerationError:
        raise
    except Exception as exc:
        raise ReportV2GenerationError("provider_api_failure", cause=exc) from exc
    return _parse_report_v2_provider_output(raw_output)


class AnalysisAgent:
    """分析 Agent class 介面。"""

    async def analyze(
        self,
        case_id: str,
        session_id: str,
        summaries: list[TurnSummary],
    ) -> ConceptualizationReport:
        return await generate_report(case_id=case_id, session_id=session_id, summaries=summaries)
