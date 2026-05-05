import asyncio
import json
import os
import tempfile

from database.db import (
    init_db,
    create_case,
    get_case,
    get_all_cases,
    add_message,
    get_messages_by_session,
    add_summary,
    get_summaries_by_session,
    has_crisis_in_session,
)


async def run_smoke_test():
    # Use a throw-away temp DB so the real cases.db is never touched.
    with tempfile.TemporaryDirectory() as tmp_dir:
        os.environ["DATABASE_PATH"] = os.path.join(tmp_dir, "smoke_test.db")

        await init_db()

        # 測試 case CRUD
        case = await create_case("A001", note="測試個案")
        print("建立個案：", case)

        fetched = await get_case(case["id"])
        assert fetched["code_name"] == "A001", "get_case 失敗"

        all_cases = await get_all_cases()
        assert len(all_cases) >= 1, "get_all_cases 失敗"

        # 測試 message
        session_id = "test-session-001"
        msg = await add_message(case["id"], session_id, 1, "user", "我最近壓力很大")
        print("新增對話：", msg)

        msgs = await get_messages_by_session(case["id"], session_id)
        assert len(msgs) == 1, "get_messages_by_session 失敗"

        # 測試 summary
        summary_data = {
            "round": 1,
            "emotion": {"primary": "焦慮", "intensity": 7},
            "emotion_dimensions": {"anxiety": 7, "sadness": 3},
            "themes": ["工作壓力"],
            "key_statement": "我最近壓力很大",
            "crisis_flag": False,
        }
        s = await add_summary(case["id"], session_id, 1, json.dumps(summary_data), False)
        print("新增摘要：", s)
        assert isinstance(s["summary"], dict), "add_summary 應回傳已 parse 的 summary（dict）"

        summaries = await get_summaries_by_session(case["id"], session_id)
        assert len(summaries) == 1, "get_summaries_by_session 失敗"
        assert isinstance(summaries[0]["summary"], dict), "summary 應該被 parse 成 dict"

        crisis = await has_crisis_in_session(case["id"], session_id)
        assert crisis == False, "has_crisis_in_session 失敗"

        try:
            await add_summary(case["id"], session_id, 99, "這不是json{{{", False)
            assert False, "應該要拋出 ValueError"
        except ValueError:
            print("[OK] 非法 JSON 驗證正常")

        print("[OK] 所有測試通過")


if __name__ == "__main__":
    asyncio.run(run_smoke_test())
