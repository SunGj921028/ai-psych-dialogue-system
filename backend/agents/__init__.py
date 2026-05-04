from openai import AsyncOpenAI
import os
from dotenv import load_dotenv

load_dotenv()

def get_llm_client() -> AsyncOpenAI:
    return AsyncOpenAI(
        api_key=os.getenv("LLM_API_KEY"),
        base_url=os.getenv("LLM_BASE_URL"),
    )

def get_model_name() -> str:
    return os.getenv("LLM_MODEL", "gpt-4o")
