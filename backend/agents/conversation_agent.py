"""對話 Agent：同理回應與安全護欄（非 streaming）。"""

from __future__ import annotations

import logging
import os
import re

from pydantic import BaseModel, field_validator

from agents import get_llm_client

logger = logging.getLogger(__name__)

# TODO(P2): 改為 streaming 時，將 chat.completions.create 換成 stream=True，
# 並在 router 以 SSE / WebSocket 分段回傳；本 Task 維持單次完整回應以降低整合複雜度。


class ConversationMessage(BaseModel):
    role: str
    content: str

    @field_validator("role")
    @classmethod
    def role_must_be_chat(cls, value: str) -> str:
        if value not in ("user", "assistant"):
            raise ValueError('role 必須為 "user" 或 "assistant"')
        return value


class ConversationResponse(BaseModel):
    content: str
    is_safe: bool
    warning: str | None = None


SYSTEM_PROMPT = """你是繁體中文情境下、具有同理心的「傾聽者」助理，協助諮商師與案主對話練習與整理思緒。
你不是心理師或醫師，不提供診斷、治療或醫療建議。

【你可以做的】
- 反映案主的情緒與處境（情感反映），讓對方感到被聽見、被理解。
- 以溫和、不評判的語氣，搭配開放式問句，邀請案主多說一點。
- 回應長度約 2–4 句，簡潔有溫度。

【你絕對不能做（安全護欄）】
- 不做任何心理或精神疾病「診斷」、不判定是否患病。
- 不給藥物、劑量、停藥或替代療法建議。
- 不替代專業心理治療或醫療處置；不對案主處境下確定性結論。
- 不提供具體行動指令（例如「你應該立刻去…」「你一定要…」）；可改為探索感受與資源。

【越界時】
若案主要求你診斷、開藥或替代表達醫療意見，請溫和說明你的限制，並把對話帶回情緒與經驗的探索（仍維持 2–4 句）。

請直接輸出給案主看的回應文字，不要前言、不要標題、不要使用 Markdown。"""


# 使用者越界意圖：僅供寬鬆偵測與日誌，避免過度敏感（需搭配多關鍵或明確語境可再調整）
_USER_BOUNDARY_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"診斷"),
    re.compile(r"憂鬱症|抑鬱症|躁鬱|焦慮症|強迫症|人格障礙"),
    re.compile(r"吃藥|開藥|劑量|停藥|藥物|處方"),
    re.compile(r"是不是有病|我得的是什麼病"),
]

# 助理回應不得出現的「診斷式」用語（與單元測試對齊）
_ASSISTANT_DIAGNOSTIC_PHRASES: tuple[str, ...] = (
    "你有憂鬱症",
    "你患有",
    "你的診斷",
    "確診為",
    "你得了",
    "你確定是",
)

DEFAULT_CONVERSATION_MAX_TOKENS = 600
MIN_CONVERSATION_MAX_TOKENS = 1
MAX_CONVERSATION_MAX_TOKENS = 4096


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _conversation_max_tokens() -> int:
    raw = os.getenv("CONVERSATION_MAX_TOKENS")
    if raw is None or raw.strip() == "":
        value = DEFAULT_CONVERSATION_MAX_TOKENS
    else:
        try:
            value = int(raw)
        except ValueError as exc:
            logger.warning("Failed to parse CONVERSATION_MAX_TOKENS: %s", exc)
            value = DEFAULT_CONVERSATION_MAX_TOKENS
    return max(MIN_CONVERSATION_MAX_TOKENS, min(value, MAX_CONVERSATION_MAX_TOKENS))


def _slice_history(history: list[ConversationMessage], window_rounds: int) -> list[ConversationMessage]:
    """
    滑動視窗：以「輪」估算為 user+assistant 各一則，最多保留最後 window_rounds 輪
    （約 2 * window_rounds 則訊息），確保最新內容在視窗內。
    """
    cap = max(1, window_rounds) * 2
    return history[-cap:] if history else []


def _detect_user_boundary_attempt(user_input: object | None) -> str | None:
    text = ("" if user_input is None else str(user_input)).strip()
    if not text:
        return None
    hits = [p.pattern for p in _USER_BOUNDARY_PATTERNS if p.search(text)]
    if not hits:
        return None
    return f"使用者輸入可能涉及診斷/用藥等越界請求（關鍵模式：{', '.join(hits[:5])}）"


def _response_passes_safety(content: str) -> bool:
    normalized = content.strip()
    if not normalized:
        return False
    lower = normalized.lower()
    for phrase in _ASSISTANT_DIAGNOSTIC_PHRASES:
        if phrase in normalized or phrase.lower() in lower:
            return False
    return True


def _safe_refusal_reply() -> str:
    return (
        "謝謝你願意說出來。我沒辦法代替專業人員幫你下診斷或決定治療方式，"
        "不過我很願意陪著你，多聊聊你現在的感受與這段時間最讓你在意的是什麼？"
    )


def _fallback_reply(user_input: str) -> str:
    """LLM 不可用時的保守同理回應（不診斷、不指令）。"""
    snippet = (user_input or "").strip()
    if not snippet:
        snippet = "你提到的狀況"
    return (
        f"聽起來「{snippet[:80]}」讓你很有感。這裡我沒辦法給診斷或具體指示，"
        "但我想多了解：此刻最困擾你的一點是什麼？你希望自己接下來能輕鬆一點點嗎？"
    )


async def generate_response(
    user_input: str,
    conversation_history: list[ConversationMessage],
) -> ConversationResponse:
    """
    設計選擇說明（Task 05）：
    1) 歷史採滑動視窗：以 CONVERSATION_WINDOW_SIZE 代表「輪數」，每輪約 2 則訊息，控制 token。
    2) 越界偵測：以寬鬆 regex 偵測使用者意圖並寫入 warning + logging；避免過敏單一關鍵字可再調整。
    3) 長度：System 提示 2–4 句，並以 CONVERSATION_MAX_TOKENS 硬性上限。
    4) 先不做 streaming，降低 router 複雜度（見檔案頂端 TODO）。
    """
    window_rounds = _env_int("CONVERSATION_WINDOW_SIZE", 10)
    max_tokens = _conversation_max_tokens()
    model = os.getenv("CONVERSATION_MODEL", "gemini-2.0-flash")

    boundary_note = _detect_user_boundary_attempt(user_input)
    if boundary_note:
        logger.info("conversation_boundary_hint: %s", boundary_note)

    recent = _slice_history(conversation_history, window_rounds)
    messages: list[dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in recent:
        messages.append({"role": m.role, "content": m.content})
    messages.append({"role": "user", "content": (user_input or "").strip()})

    warning: str | None = boundary_note

    try:
        client = get_llm_client("gemini")
        resp = await client.chat.completions.create(
            model=model,
            temperature=0.7,
            max_tokens=max_tokens,
            messages=messages,
        )
        raw = (resp.choices[0].message.content or "").strip()
        if not raw:
            raise ValueError("模型回傳空白內容")

        if not _response_passes_safety(raw):
            logger.warning("conversation_unsafe_model_output_truncated")
            content = _safe_refusal_reply()
            return ConversationResponse(
                content=content,
                is_safe=False,
                warning=warning or "模型輸出含診斷式語句，已改為安全回覆",
            )

        return ConversationResponse(content=raw, is_safe=True, warning=warning)

    except Exception as exc:
        logger.warning("conversation_llm_failed: %s", exc)
        content = _fallback_reply(user_input)
        return ConversationResponse(
            content=content,
            is_safe=True,
            warning=warning or f"LLM 呼叫失敗，使用 fallback：{exc.__class__.__name__}",
        )


class ConversationAgent:
    """Class 包裝，供後續整合。"""

    async def run(
        self,
        user_input: str,
        conversation_history: list[ConversationMessage],
    ) -> ConversationResponse:
        return await generate_response(user_input, conversation_history)
