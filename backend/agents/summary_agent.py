import json
import logging
import os
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

from agents import get_llm_client

logger = logging.getLogger(__name__)


class EmotionDetail(BaseModel):
    primary: str
    intensity: int = Field(default=0)

    @field_validator("intensity", mode="before")
    @classmethod
    def clamp_intensity(cls, value: Any) -> int:
        try:
            n = int(value)
        except (TypeError, ValueError):
            n = 0
        return max(0, min(10, n))


class EmotionDimensions(BaseModel):
    anxiety: int = 0
    sadness: int = 0
    anger: int = 0
    hopelessness: int = 0
    confusion: int = 0
    hope: int = 0

    @field_validator(
        "anxiety",
        "sadness",
        "anger",
        "hopelessness",
        "confusion",
        "hope",
        mode="before",
    )
    @classmethod
    def clamp_dimension(cls, value: Any) -> int:
        try:
            n = int(value)
        except (TypeError, ValueError):
            n = 0
        return max(0, min(10, n))


class TurnSummary(BaseModel):
    turn_number: int
    emotion: EmotionDetail
    emotion_dimensions: EmotionDimensions
    themes: list[str]
    key_statement: str
    crisis_flag: bool

    @field_validator("themes", mode="before")
    @classmethod
    def normalize_themes(cls, value: Any) -> list[str]:
        if not isinstance(value, list):
            return ["待補充"]

        cleaned = [str(item).strip() for item in value if str(item).strip()]
        if not cleaned:
            cleaned = ["待補充"]
        return cleaned[:3]

    @model_validator(mode="after")
    def ensure_fields(self) -> "TurnSummary":
        if not self.key_statement.strip():
            self.key_statement = "（未擷取到代表性陳述）"
        return self


SYSTEM_PROMPT = """你是一位專業的心理諮商紀錄助理，任務是把單輪對話轉成結構化 JSON 微摘要。
只回傳 JSON，不要任何前言、解釋、Markdown 或 code fence。

輸入會提供：turn_number、user_input、assistant_response、crisis_flag。
你只需根據這一輪內容做摘要，不要使用歷史對話。

欄位規格：
1) turn_number: 整數，沿用輸入輪次。
2) emotion.primary: 主要情緒（繁中詞，例如焦慮/悲傷/憤怒/無助/困惑/希望）。
3) emotion.intensity: 0-10。
4) emotion_dimensions: anxiety/sadness/anger/hopelessness/confusion/hope，皆 0-10。
5) themes: 1-3 個核心主題，精簡短詞。
6) key_statement: 優先直接引用案主原話，不要改寫。
7) crisis_flag: 直接沿用輸入值，不要自行改判。

評分參考：
- 0-2：幾乎沒有該情緒
- 3-5：輕到中度
- 6-8：明顯且持續
- 9-10：非常強烈

輸出必須完全符合此 JSON 形狀：
{
  "turn_number": 1,
  "emotion": {
    "primary": "焦慮",
    "intensity": 7
  },
  "emotion_dimensions": {
    "anxiety": 7,
    "sadness": 3,
    "anger": 1,
    "hopelessness": 4,
    "confusion": 5,
    "hope": 2
  },
  "themes": ["工作壓力", "自我懷疑"],
  "key_statement": "我覺得我什麼都做不好",
  "crisis_flag": false
}
"""


def _extract_json(text: str) -> dict[str, Any]:
    body = (text or "").strip()
    if body.startswith("{") and body.endswith("}"):
        return json.loads(body)

    start = body.find("{")
    end = body.rfind("}")
    if start != -1 and end != -1 and end > start:
        return json.loads(body[start : end + 1])

    raise ValueError("LLM 輸出中找不到 JSON 物件")


def _fallback_summary(
    turn_number: int,
    user_input: str,
    crisis_flag: bool,
    error: Exception,
) -> TurnSummary:
    logger.warning(
        "summary_fallback turn=%s crisis_flag=%s error=%s",
        turn_number,
        crisis_flag,
        error,
    )
    return TurnSummary(
        turn_number=turn_number,
        emotion=EmotionDetail(primary="未知", intensity=1),
        emotion_dimensions=EmotionDimensions(),
        themes=["待補充"],
        key_statement=(user_input or "").strip()[:120] or "（未擷取到代表性陳述）",
        crisis_flag=crisis_flag,
    )


async def generate_summary(
    turn_number: int,
    user_input: str,
    assistant_response: str,
    crisis_flag: bool,
) -> TurnSummary:
    """
    設計選擇說明：
    1) JSON 解析失敗時採「不遺失資料」策略：回傳 fallback TurnSummary 並記錄 log。
    2) 情緒分數做 clamp（0-10），避免模型超界導致 ValidationError。
    3) crisis_flag 一律以外部傳入為準，覆蓋 LLM 回傳值，確保一致性。
    4) 只送本輪內容（user_input + assistant_response），跨輪分析交由後續分析 Agent。
    """
    model = os.getenv("SUMMARY_MODEL", "llama-3.3-70b-versatile")

    try:
        client = get_llm_client("groq")
        response = await client.chat.completions.create(
            model=model,
            temperature=0,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "turn_number": turn_number,
                            "user_input": user_input,
                            "assistant_response": assistant_response,
                            "crisis_flag": crisis_flag,
                        },
                        ensure_ascii=False,
                    ),
                },
            ],
        )

        data = _extract_json(response.choices[0].message.content or "")
        data["turn_number"] = turn_number
        data["crisis_flag"] = crisis_flag
        summary = TurnSummary.model_validate(data)
        summary.crisis_flag = crisis_flag
        return summary
    except Exception as exc:
        return _fallback_summary(turn_number, user_input, crisis_flag, exc)


class SummaryAgent:
    """摘要 Agent class 介面（供後續整合）。"""

    async def summarize(
        self,
        turn_number: int,
        user_input: str,
        assistant_response: str,
        crisis_flag: bool,
    ) -> TurnSummary:
        return await generate_summary(
            turn_number=turn_number,
            user_input=user_input,
            assistant_response=assistant_response,
            crisis_flag=crisis_flag,
        )

