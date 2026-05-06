from openai import AsyncOpenAI
import os
from dotenv import load_dotenv

load_dotenv()


def get_llm_client(provider: str = "default") -> AsyncOpenAI:
    """
    取得 LLM 客戶端。

    provider 選項：
    - "groq"：使用 Groq API（適合危機偵測、摘要 Agent）
    - "gemini"：使用 Gemini API（適合對話、分析 Agent）
    - "default"：使用 .env 的 LLM_API_KEY / LLM_BASE_URL（向下相容）
    """
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

    # default：沿用原本的設定，向下相容
    return AsyncOpenAI(
        api_key=os.getenv("LLM_API_KEY"),
        base_url=os.getenv("LLM_BASE_URL"),
    )

def get_model_name() -> str:
    """取得預設模型名稱（向下相容用）。"""
    return os.getenv("LLM_MODEL", "gpt-4o")
