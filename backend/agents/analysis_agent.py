import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from agents import get_llm_client
from agents.summary_agent import TurnSummary

logger = logging.getLogger(__name__)

DISCLAIMER_TEXT = (
    "本報告為 AI 草稿，僅供諮商師參考，非診斷文件。\n"
    "所有判斷與決策須由專業諮商師負責審核。"
)


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


class AnalysisAgent:
    """分析 Agent class 介面。"""

    async def analyze(
        self,
        case_id: str,
        session_id: str,
        summaries: list[TurnSummary],
    ) -> ConceptualizationReport:
        return await generate_report(case_id=case_id, session_id=session_id, summaries=summaries)
