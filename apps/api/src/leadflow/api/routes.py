"""REST + SSE endpoints for the website widget and the dashboard."""

import json
from collections import Counter
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from leadflow.agent.policy import format_form
from leadflow.agent.runner import create_conversation, run_turn, run_turn_collect
from leadflow.config import get_settings
from leadflow.db import get_session
from leadflow.models import AgentAction, Appointment, Conversation, Email, Lead, LeadStatus, Message
from leadflow.schemas import (
    AgentActionOut,
    AppointmentOut,
    ConversationDetail,
    ConversationSummary,
    EmailOut,
    InboundLeadIn,
    InboundResult,
    LeadDetail,
    LeadOut,
    MessageIn,
    MessageOut,
)

router = APIRouter(prefix="/api")
Session = Annotated[AsyncSession, Depends(get_session)]


# ---------------------------------------------------------------- helpers


def _sse(conversation_id: str, events: AsyncIterator[dict[str, Any]]) -> EventSourceResponse:
    async def gen() -> AsyncIterator[dict[str, str]]:
        yield {"event": "conversation", "data": json.dumps({"conversation_id": conversation_id})}
        async for ev in events:
            yield {"event": ev["event"], "data": json.dumps(ev["data"], default=str)}

    return EventSourceResponse(gen(), ping=15)


async def _conversation_or_404(session: AsyncSession, conversation_id: str) -> Conversation:
    conv = await session.get(Conversation, conversation_id)
    if conv is None:
        raise HTTPException(404, "Conversation not found")
    return conv


async def _summaries(session: AsyncSession, convs: list[Conversation]) -> list[ConversationSummary]:
    if not convs:
        return []
    ids = [c.id for c in convs]
    counts = dict(
        (
            await session.execute(
                select(Message.conversation_id, func.count())
                .where(Message.conversation_id.in_(ids), Message.role.in_(["user", "assistant"]))
                .group_by(Message.conversation_id)
            )
        ).all()
    )
    last_rows = (
        await session.execute(
            select(Message.conversation_id, Message.content, Message.seq)
            .where(
                Message.conversation_id.in_(ids), Message.role == "assistant", Message.content != ""
            )
            .order_by(Message.seq.desc())
        )
    ).all()
    last: dict[str, str] = {}
    for cid, content, _ in last_rows:
        last.setdefault(cid, content)
    lead_ids = {c.lead_id for c in convs if c.lead_id}
    leads = {
        lead.id: lead
        for lead in (await session.execute(select(Lead).where(Lead.id.in_(lead_ids)))).scalars()
    }
    out = []
    for c in convs:
        lead = leads.get(c.lead_id or "")
        out.append(
            ConversationSummary(
                id=c.id,
                lead_id=c.lead_id,
                channel=c.channel,
                status=c.status,
                lead_name=lead.name if lead else None,
                lead_company=lead.company if lead else None,
                lead_score=lead.score if lead else None,
                lead_status=lead.status if lead else None,
                message_count=counts.get(c.id, 0),
                last_message=last.get(c.id),
                created_at=c.created_at,
                updated_at=c.updated_at,
            )
        )
    return out


async def _actions_out(session: AsyncSession, rows: list[AgentAction]) -> list[AgentActionOut]:
    lead_ids = {a.lead_id for a in rows if a.lead_id}
    names = (
        dict((await session.execute(select(Lead.id, Lead.name).where(Lead.id.in_(lead_ids)))).all())
        if lead_ids
        else {}
    )
    return [
        AgentActionOut.model_validate(a).model_copy(
            update={"lead_name": names.get(a.lead_id or "")}
        )
        for a in rows
    ]


def _appointment_out(a: Appointment, lead: Lead | None) -> AppointmentOut:
    return AppointmentOut.model_validate(a).model_copy(
        update={
            "lead_name": lead.name if lead else None,
            "lead_company": lead.company if lead else None,
            "lead_email": lead.email if lead else None,
        }
    )


# ---------------------------------------------------------------- system


@router.get("/health")
async def health(session: Session) -> dict[str, Any]:
    settings = get_settings()
    await session.execute(select(1))
    return {
        "status": "ok",
        "agent_brain": "claude" if settings.llm_enabled else "built-in",
        "model": settings.anthropic_model if settings.llm_enabled else None,
        "database": settings.database_url.split(":", 1)[0],
        "timezone": settings.business_timezone,
        "company": settings.company_name,
    }


# ---------------------------------------------------------------- website lead intake / chat


@router.post("/inbound", response_model=InboundResult)
async def inbound_lead(body: InboundLeadIn) -> dict[str, Any]:
    """Webhook-style intake: runs the agent's first turn and returns its reply as JSON."""
    cid = await create_conversation()
    return await run_turn_collect(cid, format_form(**body.model_dump()))


@router.post("/inbound/stream")
async def inbound_lead_stream(body: InboundLeadIn) -> EventSourceResponse:
    """Website form intake with live agent events over Server-Sent Events."""
    cid = await create_conversation()
    return _sse(cid, run_turn(cid, format_form(**body.model_dump())))


@router.post("/conversations/{conversation_id}/messages", response_model=InboundResult)
async def post_message(conversation_id: str, body: MessageIn, session: Session) -> dict[str, Any]:
    await _conversation_or_404(session, conversation_id)
    return await run_turn_collect(conversation_id, body.content)


@router.post("/conversations/{conversation_id}/messages/stream")
async def post_message_stream(
    conversation_id: str, body: MessageIn, session: Session
) -> EventSourceResponse:
    await _conversation_or_404(session, conversation_id)
    return _sse(conversation_id, run_turn(conversation_id, body.content))


# ---------------------------------------------------------------- dashboard data


@router.get("/conversations", response_model=list[ConversationSummary])
async def list_conversations(
    session: Session, limit: int = Query(50, le=200)
) -> list[ConversationSummary]:
    convs = (
        (
            await session.execute(
                select(Conversation).order_by(Conversation.updated_at.desc()).limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return await _summaries(session, list(convs))


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(conversation_id: str, session: Session) -> ConversationDetail:
    conv = await _conversation_or_404(session, conversation_id)
    messages = (
        (
            await session.execute(
                select(Message)
                .where(
                    Message.conversation_id == conversation_id,
                    Message.role.in_(["user", "assistant"]),
                    Message.content != "",
                )
                .order_by(Message.seq)
            )
        )
        .scalars()
        .all()
    )
    actions = (
        (
            await session.execute(
                select(AgentAction)
                .where(AgentAction.conversation_id == conversation_id)
                .order_by(AgentAction.id)
            )
        )
        .scalars()
        .all()
    )
    lead = await session.get(Lead, conv.lead_id) if conv.lead_id else None
    return ConversationDetail(
        id=conv.id,
        status=conv.status,
        channel=conv.channel,
        created_at=conv.created_at,
        lead=LeadOut.model_validate(lead) if lead else None,
        messages=[MessageOut.model_validate(m) for m in messages],
        actions=await _actions_out(session, list(actions)),
    )


@router.get("/leads", response_model=list[LeadOut])
async def list_leads(
    session: Session,
    status: str | None = None,
    q: str | None = None,
    sort: str = Query("recent", pattern="^(recent|score)$"),
    limit: int = Query(200, le=500),
) -> list[Lead]:
    stmt = select(Lead)
    if status:
        stmt = stmt.where(Lead.status == status)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Lead.name).like(like),
                func.lower(Lead.email).like(like),
                func.lower(Lead.company).like(like),
            )
        )
    order = Lead.score.desc() if sort == "score" else Lead.created_at.desc()
    return list((await session.execute(stmt.order_by(order).limit(limit))).scalars())


@router.get("/leads/{lead_id}", response_model=LeadDetail)
async def get_lead(lead_id: str, session: Session) -> LeadDetail:
    lead = await session.get(Lead, lead_id)
    if lead is None:
        raise HTTPException(404, "Lead not found")
    convs = (
        (
            await session.execute(
                select(Conversation)
                .where(Conversation.lead_id == lead_id)
                .order_by(Conversation.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    appts = (
        (
            await session.execute(
                select(Appointment)
                .where(Appointment.lead_id == lead_id)
                .order_by(Appointment.start_at)
            )
        )
        .scalars()
        .all()
    )
    actions = (
        (
            await session.execute(
                select(AgentAction)
                .where(AgentAction.lead_id == lead_id)
                .order_by(AgentAction.id.desc())
            )
        )
        .scalars()
        .all()
    )
    emails = (
        (
            await session.execute(
                select(Email).where(Email.lead_id == lead_id).order_by(Email.id.desc())
            )
        )
        .scalars()
        .all()
    )
    return LeadDetail(
        lead=LeadOut.model_validate(lead),
        conversations=await _summaries(session, list(convs)),
        appointments=[_appointment_out(a, lead) for a in appts],
        actions=await _actions_out(session, list(actions)),
        emails=[EmailOut.model_validate(e) for e in emails],
    )


@router.get("/appointments", response_model=list[AppointmentOut])
async def list_appointments(session: Session, upcoming: bool = False) -> list[AppointmentOut]:
    stmt = select(Appointment, Lead).join(Lead, Lead.id == Appointment.lead_id)
    if upcoming:
        stmt = stmt.where(
            Appointment.start_at >= datetime.now(UTC), Appointment.status == "confirmed"
        )
    rows = (await session.execute(stmt.order_by(Appointment.start_at))).all()
    return [_appointment_out(a, lead) for a, lead in rows]


@router.post("/appointments/{appointment_id}/cancel", response_model=AppointmentOut)
async def cancel_appointment(appointment_id: str, session: Session) -> AppointmentOut:
    appt = await session.get(Appointment, appointment_id)
    if appt is None:
        raise HTTPException(404, "Appointment not found")
    appt.status = "cancelled"
    lead = await session.get(Lead, appt.lead_id)
    if lead and lead.status == LeadStatus.BOOKED:
        lead.status = LeadStatus.QUALIFIED
    await session.commit()
    return _appointment_out(appt, lead)


@router.get("/actions", response_model=list[AgentActionOut])
async def list_actions(
    session: Session, tool: str | None = None, limit: int = Query(100, le=500)
) -> list[AgentActionOut]:
    stmt = select(AgentAction)
    if tool:
        stmt = stmt.where(AgentAction.tool == tool)
    rows = (
        (await session.execute(stmt.order_by(AgentAction.id.desc()).limit(limit))).scalars().all()
    )
    return await _actions_out(session, list(rows))


@router.get("/emails", response_model=list[EmailOut])
async def list_emails(session: Session, limit: int = Query(50, le=200)) -> list[Email]:
    return list(
        (await session.execute(select(Email).order_by(Email.id.desc()).limit(limit))).scalars()
    )


@router.get("/dashboard")
async def dashboard(session: Session, days: int = Query(14, ge=7, le=90)) -> dict[str, Any]:
    settings = get_settings()
    now = datetime.now(UTC)
    leads = (await session.execute(select(Lead))).scalars().all()
    total = len(leads)
    booked = sum(1 for lead in leads if lead.status == LeadStatus.BOOKED)
    qualified = sum(1 for lead in leads if lead.status in (LeadStatus.QUALIFIED, LeadStatus.BOOKED))
    conversations = (await session.execute(select(func.count(Conversation.id)))).scalar_one()
    messages = (
        await session.execute(
            select(func.count(Message.id)).where(
                Message.role.in_(["user", "assistant"]), Message.content != ""
            )
        )
    ).scalar_one()
    appts = (await session.execute(select(Appointment, Lead).join(Lead))).all()
    upcoming = sorted(
        [(a, lead) for a, lead in appts if a.status == "confirmed" and a.start_at >= now],
        key=lambda r: r[0].start_at,
    )
    actions = (
        await session.execute(select(AgentAction.tool, AgentAction.status, AgentAction.created_at))
    ).all()

    start_day = (now - timedelta(days=days - 1)).date()
    series = {
        start_day + timedelta(days=i): {"leads": 0, "booked": 0, "actions": 0} for i in range(days)
    }
    for lead in leads:
        d = lead.created_at.date()
        if d in series:
            series[d]["leads"] += 1
            if lead.status == LeadStatus.BOOKED:
                series[d]["booked"] += 1
    for _, _, created in actions:
        if (d := created.date()) in series:
            series[d]["actions"] += 1

    buckets = [0] * 5
    for lead in leads:
        buckets[min(lead.score // 20, 4)] += 1

    prev_cut, cut = now - timedelta(days=14), now - timedelta(days=7)
    this_week = sum(1 for lead in leads if lead.created_at >= cut)
    last_week = sum(1 for lead in leads if prev_cut <= lead.created_at < cut)
    recent_actions = (
        (await session.execute(select(AgentAction).order_by(AgentAction.id.desc()).limit(12)))
        .scalars()
        .all()
    )

    return {
        "kpis": {
            "leads": total,
            "leads_this_week": this_week,
            "leads_last_week": last_week,
            "avg_score": round(sum(lead.score for lead in leads) / total) if total else 0,
            "qualified": qualified,
            "conversations": conversations,
            "messages": messages,
            "appointments": sum(1 for a, _ in appts if a.status == "confirmed"),
            "upcoming_appointments": len(upcoming),
            "agent_actions": len(actions),
            "agent_actions_24h": sum(1 for *_, c in actions if c >= now - timedelta(hours=24)),
            "action_success_rate": round(
                100 * sum(1 for _, s, _ in actions if s == "success") / len(actions), 1
            )
            if actions
            else 100.0,
            "conversion_rate": round(100 * booked / total, 1) if total else 0.0,
            "qualification_rate": round(100 * qualified / total, 1) if total else 0.0,
        },
        "series": [{"date": d.isoformat(), **v} for d, v in series.items()],
        "pipeline": [
            {"status": s.value, "count": sum(1 for lead in leads if lead.status == s)}
            for s in LeadStatus
        ],
        "score_distribution": [
            {"range": f"{i * 20}-{i * 20 + 19 if i < 4 else 100}", "count": c}
            for i, c in enumerate(buckets)
        ],
        "tool_usage": [
            {"tool": t, "count": c} for t, c in Counter(t for t, *_ in actions).most_common()
        ],
        "hot_leads": [
            LeadOut.model_validate(lead).model_dump(mode="json")
            for lead in sorted(
                (x for x in leads if x.status not in (LeadStatus.NURTURE, LeadStatus.DISQUALIFIED)),
                key=lambda x: x.score,
                reverse=True,
            )[:5]
        ],
        "upcoming": [_appointment_out(a, lead).model_dump(mode="json") for a, lead in upcoming[:5]],
        "recent_actions": [
            a.model_dump(mode="json") for a in await _actions_out(session, list(recent_actions))
        ],
        "agent_brain": "claude" if settings.llm_enabled else "built-in",
        "qualified_score": settings.qualified_score,
    }


@router.post("/demo/simulate", response_model=InboundResult)
async def simulate_lead() -> dict[str, Any]:
    """Push a realistic sample lead through the agent (for demos)."""
    from leadflow.seed import simulate_one

    return await simulate_one()


@router.post("/conversations", status_code=201)
async def start_conversation() -> dict[str, str]:
    """Start an empty chat (no form); the agent will ask who it is talking to."""
    return {"conversation_id": await create_conversation()}
