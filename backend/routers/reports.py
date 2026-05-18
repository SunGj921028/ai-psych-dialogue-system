from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agents.analysis_agent import ConceptualizationReport, generate_report
from agents.summary_agent import TurnSummary
from database.db import get_case, get_summaries_by_session


router = APIRouter()


class GenerateReportRequest(BaseModel):
    case_id: str
    session_id: str


@router.post("/reports/generate", response_model=ConceptualizationReport)
async def generate_report_route(request: GenerateReportRequest) -> ConceptualizationReport:
    try:
        case = await get_case(request.case_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to get case") from exc

    if case is None:
        raise HTTPException(status_code=404, detail="Case not found")

    try:
        summary_rows = await get_summaries_by_session(request.case_id, request.session_id)
        summaries = [
            TurnSummary.model_validate(row["summary"])
            for row in summary_rows
        ]
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to get summaries") from exc

    try:
        return await generate_report(
            case_id=request.case_id,
            session_id=request.session_id,
            summaries=summaries,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to generate report") from exc
