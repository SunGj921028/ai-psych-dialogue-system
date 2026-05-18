from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from database.db import create_case, delete_case, get_all_cases, get_case


router = APIRouter()


class CreateCaseRequest(BaseModel):
    code_name: str = Field(min_length=1)
    note: str | None = None


class CaseResponse(BaseModel):
    id: str
    code_name: str
    created_at: str
    note: str | None = None


class DeleteCaseResponse(BaseModel):
    deleted: bool


@router.post("/cases", response_model=CaseResponse)
async def create_case_route(request: CreateCaseRequest) -> dict:
    try:
        return await create_case(code_name=request.code_name, note=request.note)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to create case") from exc


@router.get("/cases", response_model=list[CaseResponse])
async def list_cases_route() -> list[dict]:
    try:
        return await get_all_cases()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to list cases") from exc


@router.get("/cases/{case_id}", response_model=CaseResponse)
async def get_case_route(case_id: str) -> dict:
    try:
        case = await get_case(case_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to get case") from exc

    if case is None:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


@router.delete("/cases/{case_id}", response_model=DeleteCaseResponse)
async def delete_case_route(case_id: str) -> dict[str, bool]:
    try:
        deleted = await delete_case(case_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to delete case") from exc

    if not deleted:
        raise HTTPException(status_code=404, detail="Case not found")
    return {"deleted": True}
