# TODO: Task 09 - 實作對話相關路由
# 這個檔案將在 Task 09 填入完整實作

from fastapi import APIRouter

router = APIRouter()


@router.get("/placeholder")
async def conversation_placeholder() -> dict[str, str]:
    """預留端點，Task 09 替換為實際對話 API。"""
    raise NotImplementedError
