from openai import AsyncOpenAI
import os
from dotenv import load_dotenv

load_dotenv()


def get_llm_client(provider: str = "default") -> AsyncOpenAI:
    """
    取得 LLM 客戶端。

    provider 選項：
    - "default"：優先使用 Gemini，若未設定則改用 Groq
    - "groq"：使用 Groq API（適合危機偵測、摘要 Agent）
    - "gemini"：使用 Gemini API（適合對話、分析 Agent）
    """
    if provider == "default":
        api_key = os.getenv("GEMINI_API_KEY")
        if api_key:
            return AsyncOpenAI(
                api_key=api_key,
                base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            )

        api_key = os.getenv("GROQ_API_KEY")
        if api_key:
            return AsyncOpenAI(
                api_key=api_key,
                base_url="https://api.groq.com/openai/v1",
            )

        raise ValueError("GEMINI_API_KEY 或 GROQ_API_KEY 至少需要設定一個")

    if provider == "groq":
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY 未設定，請在 .env 補上")
        return AsyncOpenAI(
            api_key=api_key,
            base_url="https://api.groq.com/openai/v1",
        )

    if provider == "gemini":
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY 未設定，請在 .env 補上")
        return AsyncOpenAI(
            api_key=api_key,
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        )

    raise ValueError(f"不支援的 provider：{provider}")
