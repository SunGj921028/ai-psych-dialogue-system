import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

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
                "不是正式風險評估或整體風險等級。"
            ),
            "output_schema": "只輸出 JSON object，且必須符合 ReportAIGeneratedV2；未知欄位會被拒絕。",
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
        "只輸出 JSON，必須符合 ReportAIGeneratedV2。\n"
        "evidence_refs 的 note 只能使用 summary metadata、manual input、persisted crisis level。"
    )
    return [
        {"role": "system", "content": system_content},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]


async def _call_report_v2_provider(messages_or_payload: Any) -> str:
    _ = messages_or_payload
    raise NotImplementedError("Report v2 live provider integration is not enabled")


def _parse_report_v2_provider_output(raw_output: str | dict[str, Any]) -> ReportAIGeneratedV2:
    try:
        if isinstance(raw_output, str):
            data = _extract_json_object(raw_output)
        elif isinstance(raw_output, dict):
            data = raw_output
        else:
            raise ValueError("Report v2 provider output must be a JSON object")

        if not isinstance(data, dict):
            raise ValueError("Report v2 provider output must be a JSON object")

        ai_generated = ReportAIGeneratedV2.model_validate(data)
        _validate_report_v2_evidence_refs(ai_generated)
        return ai_generated
    except Exception as exc:
        raise ValueError("Invalid Report v2 provider output") from exc


def _validate_report_v2_evidence_refs(ai_generated: ReportAIGeneratedV2) -> None:
    for field_value in ai_generated.__dict__.values():
        if not isinstance(field_value, ReportField):
            continue
        for ref in field_value.evidence_refs:
            if ref.note is None:
                continue
            if ref.note not in REPORT_V2_ALLOWED_EVIDENCE_NOTES:
                raise ValueError("Report v2 evidence ref note is not pointer-only")


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
    Report Schema v2 deterministic placeholder.

    This first backend slice defines the safe contract only. It intentionally
    avoids live provider calls and returns a conservative schema-valid draft
    whose fields remain missing/pending for counselor review.
    """
    _ = (case_id, session_id, summaries, manual_input, knowledge_excerpts)
    return ReportAIGeneratedV2.model_validate({})


class AnalysisAgent:
    """分析 Agent class 介面。"""

    async def analyze(
        self,
        case_id: str,
        session_id: str,
        summaries: list[TurnSummary],
    ) -> ConceptualizationReport:
        return await generate_report(case_id=case_id, session_id=session_id, summaries=summaries)
