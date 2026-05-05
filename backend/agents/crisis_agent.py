import json
import logging
import os
from datetime import datetime, timezone

from pydantic import BaseModel

from agents import get_llm_client, get_model_name

logger = logging.getLogger(__name__)


class CrisisDetectionResult(BaseModel):
    crisis_flag: bool
    crisis_level: str  # "none" / "low" / "high"
    reason: str


SYSTEM_PROMPT = """你是心理諮商輔助系統中的危機偵測模組，只做危機偵測，不做安撫建議或其他任務。
請依據使用者輸入判斷是否有危機語句，並且只輸出 JSON，禁止輸出任何前言或補充。

crisis_level 定義：
- none：沒有危機跡象。例：工作壓力大、睡不好。
- low：模糊或間接危機訊號。例：我很累了、不想撐了、覺得活著沒意義。
- high：明確自傷/自殺/傷害他人意圖、計畫或行動。例：我不想活了、我想自殺、我想拿刀傷人。

原則：模糊情況寧可判 low，不要漏掉風險。
語境：繁體中文心理諮商對話。

只能輸出這個 JSON 形狀：
{
  "crisis_flag": true,
  "crisis_level": "high",
  "reason": "使用者明確提到不想活了"
}
"""


def _now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_level(level: str) -> str:
    if level not in {"none", "low", "high"}:
        return "low"
    return level


def _heuristic_detect(text: str) -> CrisisDetectionResult:
    print(f"heuristic_detect: {text}")
    normalized = text.strip().lower()

    high_keywords = [
        "不想活", "想死", "自殺", "了結自己", "結束生命", "割腕", "上吊", "吞藥", "跳樓",
        "傷害他", "殺了他", "殺人", "拿刀", "同歸於盡",
    ]
    low_keywords = [
        "不想撐", "撐不下去", "活著沒意義", "好累", "絕望", "沒有希望", "想消失", "不如死",
    ]

    if any(k in normalized for k in high_keywords):
        return CrisisDetectionResult(
            crisis_flag=True,
            crisis_level="high",
            reason="偵測到明確自傷、自殺或傷害他人語句（fallback）",
        )

    if any(k in normalized for k in low_keywords):
        return CrisisDetectionResult(
            crisis_flag=True,
            crisis_level="low",
            reason="偵測到模糊危機語句，建議持續關注（fallback）",
        )

    return CrisisDetectionResult(
        crisis_flag=False,
        crisis_level="none",
        reason="未偵測到危機語句（fallback）",
    )


def _extract_json(text: str) -> str:
    text = text.strip()
    if text.startswith("{") and text.endswith("}"):
        return text

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        return text[start : end + 1]
    raise ValueError("找不到可解析的 JSON 物件")


async def detect_crisis(user_input: str) -> CrisisDetectionResult:
    """
    輸入：使用者（案主）本輪說的話
    輸出：CrisisDetectionResult

    設計選擇說明：
    1) JSON 解析失敗採 fail-safe：回退到規則式偵測（至少 low），避免漏判危機。
    2) 模型採 CRISIS_MODEL 獨立設定，預設 gpt-4o-mini（較快，符合並行低延遲需求）。
    3) 超長輸入做截斷（預設 1000 字）：保留開頭，降低延遲與成本。
    4) crisis_flag=True 時記錄 console log（含時間、level、原文）。
    """
    model = os.getenv("CRISIS_MODEL") or os.getenv("LLM_MODEL") or get_model_name()
    max_chars_raw = os.getenv("MAX_CRISIS_INPUT_CHARS", "1000")
    try:
        max_chars = max(1, int(max_chars_raw))
    except ValueError:
        max_chars = 1000

    text = (user_input or "").strip()
    truncated = text[:max_chars]

    if not truncated:
        return CrisisDetectionResult(
            crisis_flag=False,
            crisis_level="none",
            reason="輸入為空，無法判定危機",
        )

    try:
        client = get_llm_client()
        resp = await client.chat.completions.create(
            model=model,
            temperature=0,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": truncated},
            ],
            response_format={"type": "json_object"},
        )
        content = (resp.choices[0].message.content or "").strip()
        data = json.loads(_extract_json(content))

        validated = CrisisDetectionResult.model_validate(
            {
                "crisis_flag": data.get("crisis_flag", False),
                "crisis_level": str(data.get("crisis_level", "low")),
                "reason": str(data.get("reason", "模型未提供原因")),
            }
        )
        result = CrisisDetectionResult(
            crisis_flag=validated.crisis_flag,
            crisis_level=_normalize_level(validated.crisis_level),
            reason=validated.reason,
        )

        # 矛盾防呆機制
        if result.crisis_level in {"low", "high"} and not result.crisis_flag:
            result.crisis_flag = True
        if result.crisis_level == "none" and result.crisis_flag:
            result.crisis_level = "low"

    except Exception as exc:
        result = _heuristic_detect(truncated)
        result.reason = f"{result.reason}; LLM fallback: {exc.__class__.__name__}"

    if result.crisis_flag:
        logger.warning(
            "crisis_detected time=%s level=%s input=%s reason=%s",
            _now_utc_iso(),
            result.crisis_level,
            truncated,
            result.reason,
        )

    return result


class CrisisAgent:
    """提供 class 介面以便後續整合。"""

    async def detect(self, user_input: str) -> CrisisDetectionResult:
        return await detect_crisis(user_input)
