import asyncio

from _path import ensure_backend_path

ensure_backend_path()

from agents.crisis_agent import CrisisDetectionResult, detect_crisis


async def test():
    # 測試一：明顯無危機
    result = await detect_crisis("我最近工作壓力很大，睡眠不太好")
    print(f"測試一（無危機）：{result}")
    assert result.crisis_level == "none"

    # 測試二：模糊語句（應該是 low）
    result = await detect_crisis("我真的好累，不知道還要撐多久")
    print(f"測試二（模糊）：{result}")
    assert result.crisis_level in ["low", "high"]  # 允許模型判 low 或 high

    # 測試三：明確危機語句（應該是 high）
    result = await detect_crisis("我不想活了，已經想好怎麼做了")
    print(f"測試三（明確危機）：{result}")
    assert result.crisis_flag == True
    assert result.crisis_level == "high"

    # 測試四：輸入超過 MAX_CRISIS_INPUT_CHARS 的長文字
    long_input = "我很好。" * 500  # 製造超長輸入
    result = await detect_crisis(long_input)
    print(f"測試四（超長輸入）：{result}")
    assert isinstance(result, CrisisDetectionResult)  # 不應該炸掉

    print("[OK] 所有危機偵測測試通過")


asyncio.run(test())
