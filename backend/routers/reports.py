from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agents.analysis_agent import ConceptualizationReport, generate_report
from agents.summary_agent import TurnSummary
from database.db import (
    create_or_get_report_draft,
    get_case,
    get_current_report_draft,
    get_report_draft,
    get_session,
    get_summaries_by_session,
    update_report_manual_input,
)
from models.report_schema_v2 import ReportDraftV2, ReportManualInputV2


router = APIRouter()


class GenerateReportRequest(BaseModel):
    case_id: str
    session_id: str


class ReportDraftManualInputRequest(BaseModel):
    manual_input: ReportManualInputV2 | None = None


async def _ensure_case_and_session(case_id: str, session_id: str) -> None:
    try:
        case = await get_case(case_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to get case") from exc

    if case is None:
        raise HTTPException(status_code=404, detail="Case not found")

    try:
        session = await get_session(case_id, session_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to get session") from exc

    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")


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


@router.get(
    "/cases/{case_id}/sessions/{session_id}/report-drafts/current",
    response_model=ReportDraftV2,
)
async def get_current_report_draft_route(
    case_id: str,
    session_id: str,
) -> ReportDraftV2:
    await _ensure_case_and_session(case_id, session_id)

    try:
        draft = await get_current_report_draft(case_id, session_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to get report draft") from exc

    if draft is None:
        raise HTTPException(status_code=404, detail="Report draft not found")

    return draft


@router.post(
    "/cases/{case_id}/sessions/{session_id}/report-drafts",
    response_model=ReportDraftV2,
)
async def create_report_draft_route(
    case_id: str,
    session_id: str,
    request: ReportDraftManualInputRequest | None = None,
) -> ReportDraftV2:
    await _ensure_case_and_session(case_id, session_id)

    try:
        return await create_or_get_report_draft(
            case_id,
            session_id,
            request.manual_input if request else None,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Failed to create report draft",
        ) from exc


@router.patch(
    "/report-drafts/{draft_id}/manual-input",
    response_model=ReportDraftV2,
)
async def update_report_draft_manual_input_route(
    draft_id: str,
    request: ReportDraftManualInputRequest,
) -> ReportDraftV2:
    try:
        existing = await get_report_draft(draft_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to get report draft") from exc

    if existing is None:
        raise HTTPException(status_code=404, detail="Report draft not found")

    try:
        updated = await update_report_manual_input(
            draft_id,
            request.manual_input or ReportManualInputV2(),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Failed to update report draft",
        ) from exc

    if updated is None:
        raise HTTPException(status_code=404, detail="Report draft not found")

    return updated
