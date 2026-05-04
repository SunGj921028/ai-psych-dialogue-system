# TODO: Task 09 - 實作個案 CRUD 路由
# 這個檔案將在 Task 09 填入完整實作

from fastapi import APIRouter

router = APIRouter()


@router.get("/placeholder")
async def cases_placeholder() -> dict[str, str]:
    """預留端點，Task 09 替換為實際個案 API。"""
    raise NotImplementedError
