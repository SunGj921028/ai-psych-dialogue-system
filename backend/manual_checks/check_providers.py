import asyncio
from _path import ensure_backend_path

ensure_backend_path()

from agents import get_llm_client


async def test():
    # 測試 Groq
    try:
        client = get_llm_client("groq")
        resp = await client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": "回覆「Groq OK」，不要說其他的"}],
            max_tokens=10,
        )
        print(f"[OK] Groq 連線正常：{resp.choices[0].message.content}")
    except Exception as e:
        print(f"[FAIL] Groq 連線失敗：{e}")

    # 測試 Gemini
    try:
        client = get_llm_client("gemini")
        resp = await client.chat.completions.create(
            model="gemini-2.5-flash-lite",
            messages=[{"role": "user", "content": "回覆「Gemini OK」，不要說其他的"}],
            max_tokens=10,
        )
        print(f"[OK] Gemini 連線正常：{resp.choices[0].message.content}")
    except Exception as e:
        print(f"[FAIL] Gemini 連線失敗：{e}")

    # 測試 default provider 不傳 key 時的錯誤提示
    try:
        client = get_llm_client("groq")
        print("[OK] get_llm_client('groq') 正常回傳 client")
    except ValueError as e:
        print(f"[OK] GROQ_API_KEY 未設定時正確拋出 ValueError：{e}")


asyncio.run(test())
