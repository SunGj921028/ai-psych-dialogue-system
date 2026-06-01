from __future__ import annotations

import logging
from typing import NoReturn

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agents.analysis_agent import (
    ConceptualizationReport,
    ReportV2GenerationError,
    generate_report,
    generate_report_v2_ai_draft,
)
from agents.summary_agent import TurnSummary
from database.db import (
    create_or_get_report_draft,
    get_case,
    get_current_report_draft,
    get_report_draft,
    get_session,
    get_summaries_by_session,
    update_report_ai_generated,
    update_report_manual_input,
)
from models.report_schema_v2 import (
    ReportAIGeneratedV2,
    ReportDraftV2,
    ReportEvidenceRefV2,
    ReportField,
    ReportManualInputV2,
)


logger = logging.getLogger(__name__)
router = APIRouter()


class GenerateReportRequest(BaseModel):
    case_id: str
    session_id: str


class ReportDraftManualInputRequest(BaseModel):
    manual_input: ReportManualInputV2 | None = None


def _raise_report_v2_generation_http_error(
    error: ReportV2GenerationError,
    *,
    draft_id: str,
    case_id: str,
    session_id: str,
) -> NoReturn:
    logger.warning(
        "report_v2_generation_failed category=%s draft_id=%s case_id=%s session_id=%s",
        error.category,
        draft_id,
        case_id,
        session_id,
    )
    raise HTTPException(
        status_code=500,
        detail="Failed to generate report draft",
    ) from error


def _collect_ai_evidence_refs(
    ai_generated: ReportAIGeneratedV2,
    summary_rows: list[dict],
) -> list[ReportEvidenceRefV2]:
    refs: list[ReportEvidenceRefV2] = []
    seen: set[tuple[int | None, str | None, str | None]] = set()

    for value in ai_generated.model_dump().values():
        if not isinstance(value, dict):
            continue
        field = ReportField.model_validate(value)
        for ref in field.evidence_refs:
            key = (ref.turn_number, ref.summary_id, ref.note)
            if key not in seen:
                refs.append(ref)
                seen.add(key)

    if refs:
        return refs

    for row in summary_rows:
        ref = ReportEvidenceRefV2(
            turn_number=row.get("turn_number"),
            summary_id=row.get("id"),
            note="summary pointer",
        )
        key = (ref.turn_number, ref.summary_id, ref.note)
        if key not in seen:
            refs.append(ref)
            seen.add(key)

    return refs


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


@router.post(
    "/report-drafts/{draft_id}/generate",
    response_model=ReportDraftV2,
)
async def generate_report_draft_v2_route(draft_id: str) -> ReportDraftV2:
    try:
        existing = await get_report_draft(draft_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to get report draft") from exc

    if existing is None:
        raise HTTPException(status_code=404, detail="Report draft not found")

    try:
        summary_rows = await get_summaries_by_session(
            existing.case_id,
            existing.session_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to generate report draft") from exc

    if len(summary_rows) < 1:
        logger.warning(
            "report_v2_generation_failed category=%s draft_id=%s case_id=%s session_id=%s",
            "missing_summaries",
            draft_id,
            existing.case_id,
            existing.session_id,
        )
        raise HTTPException(
            status_code=422,
            detail="At least one persisted summary is required",
        )

    try:
        raw_ai_generated = await generate_report_v2_ai_draft(
            case_id=existing.case_id,
            session_id=existing.session_id,
            summaries=summary_rows,
            manual_input=existing.manual_input,
        )
    except ReportV2GenerationError as exc:
        _raise_report_v2_generation_http_error(
            exc,
            draft_id=draft_id,
            case_id=existing.case_id,
            session_id=existing.session_id,
        )
    except Exception as exc:
        _raise_report_v2_generation_http_error(
            ReportV2GenerationError("unknown_generation_failure", cause=exc),
            draft_id=draft_id,
            case_id=existing.case_id,
            session_id=existing.session_id,
        )

    try:
        ai_generated = ReportAIGeneratedV2.model_validate(raw_ai_generated)
    except Exception as exc:
        _raise_report_v2_generation_http_error(
            ReportV2GenerationError("schema_validation_failed", cause=exc),
            draft_id=draft_id,
            case_id=existing.case_id,
            session_id=existing.session_id,
        )

    try:
        source_refs = _collect_ai_evidence_refs(ai_generated, summary_rows)
    except ReportV2GenerationError as exc:
        _raise_report_v2_generation_http_error(
            exc,
            draft_id=draft_id,
            case_id=existing.case_id,
            session_id=existing.session_id,
        )
    except Exception as exc:
        _raise_report_v2_generation_http_error(
            ReportV2GenerationError("unknown_generation_failure", cause=exc),
            draft_id=draft_id,
            case_id=existing.case_id,
            session_id=existing.session_id,
        )

    try:
        updated = await update_report_ai_generated(
            draft_id,
            ai_generated,
            source_refs,
        )
    except Exception as exc:
        _raise_report_v2_generation_http_error(
            ReportV2GenerationError("db_persistence_failed", cause=exc),
            draft_id=draft_id,
            case_id=existing.case_id,
            session_id=existing.session_id,
        )

    if updated is None:
        raise HTTPException(status_code=404, detail="Report draft not found")

    return updated
