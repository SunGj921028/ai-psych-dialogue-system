import asyncio

from _path import ensure_backend_path

ensure_backend_path()

from agents.analysis_agent import ConceptualizationReport, generate_report
from agents.summary_agent import EmotionDetail, EmotionDimensions, TurnSummary


def make_summary(turn: int, intensity: int, themes: list, crisis: bool = False) -> TurnSummary:
    return TurnSummary(
        turn_number=turn,
        emotion=EmotionDetail(primary="焦慮", intensity=intensity),
        emotion_dimensions=EmotionDimensions(
            anxiety=intensity,
            sadness=3,
            anger=1,
            hopelessness=4,
            confusion=3,
            hope=2,
        ),
        themes=themes,
        key_statement=f"第 {turn} 輪的關鍵陳述",
        crisis_flag=crisis,
    )


async def test():
    # 測試一：正常報告生成（多輪對話）
    summaries = [
        make_summary(1, 6, ["工作壓力", "睡眠問題"]),
        make_summary(2, 8, ["自我懷疑", "人際關係"]),
        make_summary(3, 5, ["家庭壓力"]),
        make_summary(4, 7, ["工作壓力", "自我懷疑"]),
    ]
    result = await generate_report(
        case_id="test-case-001",
        session_id="test-session-001",
        summaries=summaries,
    )
    print("測試一（正常報告）：")
    print(f"  主訴：{result.chief_complaint}")
    print(f"  情緒趨勢：{result.emotion_pattern.intensity_trend}")
    print(f"  peak_turn：{result.emotion_pattern.peak_turn}")
    print(f"  建議方向：{result.suggested_directions}")
    assert isinstance(result, ConceptualizationReport)
    assert result.chief_complaint != ""
    assert result.emotion_pattern.peak_turn == 2
    assert result.has_crisis == False
    assert result.disclaimer != ""

    # 測試二：包含危機語句的報告
    summaries_with_crisis = [
        make_summary(1, 6, ["工作壓力"]),
        make_summary(2, 9, ["自我傷害"], crisis=True),
        make_summary(3, 7, ["無助感"]),
    ]
    result = await generate_report(
        case_id="test-case-001",
        session_id="test-session-002",
        summaries=summaries_with_crisis,
    )
    print(f"測試二（含危機）：has_crisis={result.has_crisis}")
    assert result.has_crisis == True

    # 測試三：對話輪次不足（低於 MIN_TURNS_FOR_REPORT）
    short_summaries = [
        make_summary(1, 5, ["壓力"]),
        make_summary(2, 6, ["焦慮"]),
    ]
    result = await generate_report(
        case_id="test-case-001",
        session_id="test-session-003",
        summaries=short_summaries,
    )
    print(f"測試三（輪次不足）：{result.chief_complaint}")
    assert "不足" in result.chief_complaint

    # 測試四：空白 summaries
    result = await generate_report(
        case_id="test-case-001",
        session_id="test-session-004",
        summaries=[],
    )
    print(f"測試四（空白）：{result.chief_complaint}")
    assert "不足" in result.chief_complaint

    print("[OK] 所有分析 Agent 測試通過")


asyncio.run(test())
