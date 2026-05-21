import asyncio

from _path import ensure_backend_path

ensure_backend_path()

from agents.summary_agent import TurnSummary, generate_summary


async def test():
    # 測試一：正常對話摘要
    result = await generate_summary(
        turn_number=1,
        user_input="我最近工作壓力很大，常常睡不著，覺得自己什麼都做不好",
        assistant_response="聽起來你最近承受了很多，工作上的壓力讓你感到很疲憊。能多說說是什麼樣的壓力嗎？",
        crisis_flag=False,
    )
    print(f"測試一（正常對話）：{result}")
    assert isinstance(result, TurnSummary)
    assert result.turn_number == 1
    assert 1 <= result.emotion.intensity <= 10
    assert 0 <= result.emotion_dimensions.anxiety <= 10
    assert len(result.themes) >= 1
    assert result.key_statement != ""
    assert result.crisis_flag == False

    # 測試二：確認 crisis_flag 以外部傳入為準
    result = await generate_summary(
        turn_number=2,
        user_input="我不想活了",
        assistant_response="我聽到你說的了，這種感受一定很沉重。",
        crisis_flag=True,
    )
    print(f"測試二（crisis_flag 一致性）：{result}")
    assert result.crisis_flag == True

    # 測試三：情緒強度數值在合法範圍內
    result = await generate_summary(
        turn_number=3,
        user_input="今天好一點了，和朋友出去走走，心情有稍微好轉",
        assistant_response="很高興聽到你今天有好一點，和朋友相處對你有幫助。",
        crisis_flag=False,
    )
    print(f"測試三（正向情緒）：{result}")
    assert 0 <= result.emotion.intensity <= 10
    for field in result.emotion_dimensions.__class__.model_fields:
        val = getattr(result.emotion_dimensions, field)
        assert 0 <= val <= 10, f"{field} 超出範圍：{val}"

    print("[OK] 所有摘要 Agent 測試通過")


asyncio.run(test())

