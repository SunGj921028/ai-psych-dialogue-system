import json
import logging
import os
from datetime import datetime, timezone

from pydantic import BaseModel

from agents import get_llm_client

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
- high：目前說話者明確自傷/自殺/傷害他人意圖、計畫或行動，或無法保證短期安全。例：我不想活了、我想自殺、我今晚不能保證自己安全、我想拿刀傷人。

歸因判斷：
- 先判斷危機語句是「說話者本人」的自我表達、第三人稱/照顧者/旁系報告、引述內容，或歸因不確定。
- 說話者本人自述 active self-harm/suicide intent、具體計畫/意圖、無法保證短期安全、迫切危險、或 harm-to-others intent，應判 high。
- 第三人稱、照顧者或旁系報告中的情緒反應（例如女兒眼眶紅、哭、很難過、很激動）不應自動提高「目前說話者」的危機等級。
- 引述或轉述內容要分清「目前說話者」與「被引述者」。若危機語句屬於被引述者或第三方，reason 必須說明歸因不確定或第三方/引述來源。
- 第三方危機內容仍可能需要關注；若包含明確自傷/自殺/傷人意圖、計畫、行動或迫切危險，可依嚴重度判 low 或 high，但 reason 必須保留歸因不確定。
- 歸因不明時，不要把第三方情緒反應直接視為目前說話者自己的危機。若有模糊危機語句，寧可判 low 並說明需要諮商師確認。
- 被動絕望、保護因子下降或「活著沒意義」通常判 low；只有合併 active/imminent 指標、計畫/意圖或短期安全無法保證時才判 high。

原則：模糊情況寧可判 low，不要漏掉風險；但不要把第三方情緒反應誤判為目前說話者本人的危機。
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


def _has_third_party_or_quote_attribution(text: str) -> bool:
    third_party_markers = [
        "我女兒", "我兒子", "我的孩子", "我孩子", "我太太", "我先生",
        "我媽媽", "我爸爸", "我朋友", "我學生", "我案主", "我個案",
        "女兒說", "兒子說", "孩子說", "媽媽說", "爸爸說", "朋友說",
        "老師說", "學生說", "案主說", "個案說", "太太說", "先生說",
        "她說", "他說", "轉述", "引述", "聽到",
    ]
    quote_markers = ["「", "」", "『", "』", "\"", "'"]
    has_reported_quote = "說" in text and any(marker in text for marker in quote_markers)
    return any(marker in text for marker in third_party_markers) or has_reported_quote


def _has_imminent_or_plan_marker(text: str) -> bool:
    imminent_markers = [
        "今晚", "今天", "現在", "馬上", "等一下", "已經", "準備", "計畫",
        "方法", "拿刀", "吞藥", "跳樓", "上吊", "割腕",
    ]
    return any(marker in text for marker in imminent_markers)


def _heuristic_detect(text: str) -> CrisisDetectionResult:
    normalized = text.strip().lower()

    high_keywords = [
        "不想活", "想死", "自殺", "了結自己", "結束生命", "割腕", "上吊", "吞藥", "跳樓",
        "傷害他", "殺了他", "殺人", "拿刀", "同歸於盡",
        "不能保證自己安全", "無法保證自己安全", "不能保證安全", "無法保證安全",
        "不能保證不傷害自己", "無法保證不傷害自己",
        "不能保證不會傷害自己", "無法保證不會傷害自己",
    ]
    low_keywords = [
        "不想撐", "撐不下去", "活著沒意義", "活著沒有意義",
        "好累", "絕望", "沒有希望", "想消失", "不如死",
    ]

    if any(k in normalized for k in high_keywords):
        if _has_third_party_or_quote_attribution(normalized):
            level = "high" if _has_imminent_or_plan_marker(normalized) else "low"
            return CrisisDetectionResult(
                crisis_flag=True,
                crisis_level=level,
                reason="偵測到第三方或引述危機語句，歸因不確定，建議諮商師確認（fallback）",
            )
        return CrisisDetectionResult(
            crisis_flag=True,
            crisis_level="high",
            reason="偵測到明確自傷、自殺或傷害他人語句（fallback）",
        )

    if any(k in normalized for k in low_keywords):
        if _has_third_party_or_quote_attribution(normalized):
            return CrisisDetectionResult(
                crisis_flag=True,
                crisis_level="low",
                reason="偵測到第三方或引述模糊危機語句，歸因不確定，建議諮商師確認（fallback）",
            )
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
    2) 模型採 CRISIS_MODEL 獨立設定，預設 llama-3.1-8b-instant（Groq 快速模型）。
    3) 超長輸入做截斷（預設 1000 字）：保留開頭，降低延遲與成本。
    4) crisis_flag=True 時記錄 console log（含時間、level、原文）。
    """
    model = os.getenv("CRISIS_MODEL", "llama-3.1-8b-instant")
    max_chars_raw = os.getenv("MAX_CRISIS_INPUT_CHARS", "1000")
    try:
        max_chars = max(1, int(max_chars_raw))
    except ValueError:
        max_chars = 1000

    text = (user_input or "").strip()
    # 同時保留前後 N 字元（如字數過長，取前半 N/2、後半 N/2 合併）
    if len(text) <= max_chars:
        truncated = text
    else:
        head_len = max_chars // 2
        tail_len = max_chars - head_len
        truncated = text[:head_len] + text[-tail_len:]

    if not truncated:
        return CrisisDetectionResult(
            crisis_flag=False,
            crisis_level="none",
            reason="輸入為空，無法判定危機",
        )

    import asyncio

    try:
        client = get_llm_client("groq")
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

        # 補預設值：crisis_level 僅在 crisis_flag 為 True 才缺省為 "low"，否則為 "none"
        raw_crisis_flag = data.get("crisis_flag", False)
        raw_crisis_level = data.get("crisis_level", None)
        level = None
        if raw_crisis_level is None:
            # 沒有明確 level，根據 flag 補預設
            level = "low" if raw_crisis_flag else "none"
        else:
            level = str(raw_crisis_level)
        validated = CrisisDetectionResult.model_validate(
            {
                "crisis_flag": raw_crisis_flag,
                "crisis_level": level,
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

    except asyncio.CancelledError:
        raise
    except Exception as exc:
        result = _heuristic_detect(truncated)
        result.reason = f"{result.reason}; LLM fallback: {exc.__class__.__name__}"

    if result.crisis_flag:
        import hashlib, re
        def _sanitize_text(text):
            # 移除控制字元並取前 30 字元
            sanitized = re.sub(r"[\x00-\x1F\x7F]", "", text)
            return sanitized[:30] + ("..." if len(sanitized) > 30 else "")
        input_len = len(truncated)
        input_hash = hashlib.sha256(truncated.encode("utf-8")).hexdigest()[:12]
        input_preview = _sanitize_text(truncated)
        logger.warning(
            "crisis_detected time=%s level=%s input_len=%d input_hash=%s input_preview=%r reason=%s",
            _now_utc_iso(),
            result.crisis_level,
            input_len,
            input_hash,
            input_preview,
            result.reason,
        )

    return result


class CrisisAgent:
    """提供 class 介面以便後續整合。"""

    async def detect(self, user_input: str) -> CrisisDetectionResult:
        return await detect_crisis(user_input)
