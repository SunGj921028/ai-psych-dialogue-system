from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from agents.conversation_agent import (
    ConversationMessage,
    ConversationResponse,
    generate_response,
)
from agents.crisis_agent import CrisisDetectionResult, detect_crisis
from agents.summary_agent import TurnSummary, generate_summary
from database.db import (
    add_message,
    add_summary,
    get_case,
    get_messages_by_session,
    get_session_metadata_by_case,
    get_summaries_by_session,
)


router = APIRouter()


class ConversationTurnRequest(BaseModel):
    case_id: str
    session_id: str
    turn_number: int = Field(ge=1)
    user_input: str
    conversation_history: list[ConversationMessage] = Field(default_factory=list)


class ConversationTurnResponse(BaseModel):
    case_id: str
    session_id: str
    turn_number: int
    assistant_response: ConversationResponse
    crisis: CrisisDetectionResult
    summary: TurnSummary


class MessageResponse(BaseModel):
    id: str
    case_id: str
    session_id: str
    turn_number: int
    role: str
    content: str
    created_at: str


class SummaryRowResponse(BaseModel):
    id: str
    case_id: str
    session_id: str
    turn_number: int
    summary: TurnSummary
    crisis_flag: bool
    created_at: str


class SessionMetadataResponse(BaseModel):
    session_id: str
    message_count: int
    summary_count: int
    last_turn_number: int
    last_updated: str | None = None
    has_crisis: bool
    latest_summary_preview: str | None = None


async def _ensure_case_exists(case_id: str) -> None:
    try:
        case = await get_case(case_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to get case") from exc

    if case is None:
        raise HTTPException(status_code=404, detail="Case not found")


@router.get(
    "/cases/{case_id}/sessions",
    response_model=list[SessionMetadataResponse],
)
async def list_case_sessions_route(case_id: str) -> list[dict]:
    await _ensure_case_exists(case_id)
    try:
        return await get_session_metadata_by_case(case_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to list sessions") from exc


@router.post("/conversation/turn", response_model=ConversationTurnResponse)
async def conversation_turn_route(request: ConversationTurnRequest) -> ConversationTurnResponse:
    await _ensure_case_exists(request.case_id)

    try:
        assistant_response, crisis = await asyncio.gather(
            generate_response(
                user_input=request.user_input,
                conversation_history=request.conversation_history,
            ),
            detect_crisis(request.user_input),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to generate conversation turn") from exc

    try:
        await add_message(
            case_id=request.case_id,
            session_id=request.session_id,
            turn_number=request.turn_number,
            role="user",
            content=request.user_input,
        )
        await add_message(
            case_id=request.case_id,
            session_id=request.session_id,
            turn_number=request.turn_number,
            role="assistant",
            content=assistant_response.content,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to persist messages") from exc

    try:
        summary = await generate_summary(
            turn_number=request.turn_number,
            user_input=request.user_input,
            assistant_response=assistant_response.content,
            crisis_flag=crisis.crisis_flag,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to generate summary") from exc

    try:
        await add_summary(
            case_id=request.case_id,
            session_id=request.session_id,
            turn_number=request.turn_number,
            summary_json=summary.model_dump_json(),
            crisis_flag=crisis.crisis_flag,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to persist summary") from exc

    return ConversationTurnResponse(
        case_id=request.case_id,
        session_id=request.session_id,
        turn_number=request.turn_number,
        assistant_response=assistant_response,
        crisis=crisis,
        summary=summary,
    )


@router.get(
    "/cases/{case_id}/sessions/{session_id}/messages",
    response_model=list[MessageResponse],
)
async def get_session_messages_route(case_id: str, session_id: str) -> list[dict]:
    await _ensure_case_exists(case_id)
    try:
        return await get_messages_by_session(case_id, session_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to get messages") from exc


@router.get(
    "/cases/{case_id}/sessions/{session_id}/summaries",
    response_model=list[SummaryRowResponse],
)
async def get_session_summaries_route(case_id: str, session_id: str) -> list[dict]:
    await _ensure_case_exists(case_id)
    try:
        return await get_summaries_by_session(case_id, session_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to get summaries") from exc
