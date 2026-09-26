"""The agent's tools: CRM, calendar and email actions.

Tools are built per run so they close over the run's DB session and conversation.
Every tool returns a JSON-serialisable dict; errors are returned as {"error": ...} so the
agent can recover instead of crashing the run.
"""

from datetime import UTC, date, datetime
from typing import Any, Literal
from zoneinfo import ZoneInfo

from langchain_core.tools import BaseTool, StructuredTool
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, or_, select

from leadflow.agent.context import RunContext
from leadflow.models import Appointment, Lead, LeadStatus
from leadflow.services import calendar, email
from leadflow.services.scoring import missing_fields, score_lead


def lead_brief(lead: Lead, qualified_score: int | None = None) -> dict[str, Any]:
    data: dict[str, Any] = {
        "lead_id": lead.id,
        "name": lead.name,
        "email": lead.email,
        "company": lead.company,
        "phone": lead.phone,
        "status": lead.status,
        "requirement": lead.requirement,
        "budget_usd": lead.budget_usd,
        "timeline": lead.timeline,
        "timeline_days": lead.timeline_days,
        "authority": lead.authority,
        "company_size": lead.company_size,
        "score": lead.score,
        "grade": (lead.score_breakdown or {}).get("grade"),
        "missing_fields": missing_fields(lead),
    }
    if qualified_score is not None:
        data["qualified"] = lead.score >= qualified_score
    return data


# ---------------------------------------------------------------- arg schemas


class SearchCustomerArgs(BaseModel):
    query: str = Field(description="Email address, name or company to look up in the CRM.")


class CreateLeadArgs(BaseModel):
    name: str
    email: EmailStr
    company: str | None = None
    phone: str | None = None
    requirement: str | None = Field(None, description="What the lead needs, in their words.")


class UpdateLeadArgs(BaseModel):
    lead_id: str
    requirement: str | None = Field(None, description="Refined summary of what they need.")
    budget_usd: int | None = Field(None, description="Budget in US dollars (convert if needed).")
    timeline: str | None = Field(None, description="Timeline in words, e.g. 'within 3 weeks'.")
    timeline_days: int | None = Field(None, description="Timeline converted to days from today.")
    authority: Literal["decision_maker", "influencer", "researcher"] | None = None
    company_size: int | None = Field(None, description="Number of people in the company/team.")
    notes: str | None = Field(None, description="Anything else worth recording. Appended.")
    status: Literal["qualifying", "qualified", "booked", "nurture", "disqualified"] | None = None


class CheckCalendarArgs(BaseModel):
    preferred_date: date | None = Field(None, description="Earliest date the lead prefers.")
    time_of_day: Literal["morning", "afternoon"] | None = None
    limit: int = Field(4, ge=1, le=8)


class BookMeetingArgs(BaseModel):
    lead_id: str
    start_time: datetime = Field(
        description="Slot start as ISO-8601 with offset, exactly as returned by check_calendar."
    )
    title: str | None = None


class SendEmailArgs(BaseModel):
    to: EmailStr
    subject: str
    body: str = Field(description="Plain-text email body.")
    lead_id: str | None = None


# ---------------------------------------------------------------- tool factory


def build_tools(ctx: RunContext) -> list[BaseTool]:
    s, settings = ctx.session, ctx.settings
    tz = ZoneInfo(settings.business_timezone)

    async def search_customer(query: str) -> dict[str, Any]:
        q = query.strip()
        like = f"%{q.lower()}%"
        rows = (
            (
                await s.execute(
                    select(Lead)
                    .where(
                        or_(
                            func.lower(Lead.email) == q.lower(),
                            func.lower(Lead.name).like(like),
                            func.lower(Lead.company).like(like),
                        )
                    )
                    .limit(5)
                )
            )
            .scalars()
            .all()
        )
        matches = []
        for lead in rows:
            upcoming = (
                (
                    await s.execute(
                        select(Appointment).where(
                            Appointment.lead_id == lead.id,
                            Appointment.status == "confirmed",
                            Appointment.start_at >= datetime.now(UTC),
                        )
                    )
                )
                .scalars()
                .all()
            )
            brief = lead_brief(lead)
            brief["upcoming_meetings"] = [a.start_at.astimezone(tz).isoformat() for a in upcoming]
            matches.append(brief)
        return {"found": bool(matches), "count": len(matches), "matches": matches}

    async def create_lead(
        name: str,
        email: str,
        company: str | None = None,
        phone: str | None = None,
        requirement: str | None = None,
    ) -> dict[str, Any]:
        existing = (
            await s.execute(select(Lead).where(func.lower(Lead.email) == email.lower()))
        ).scalar_one_or_none()
        if existing:
            ctx.conversation.lead_id = existing.id
            await s.flush()
            return {
                "created": False,
                "note": "Lead already existed; linked it.",
                **lead_brief(existing),
            }
        result = score_lead(
            requirement=requirement,
            budget_usd=None,
            timeline_days=None,
            authority=None,
            company_size=None,
        )
        lead = Lead(
            name=name.strip(),
            email=email.lower(),
            company=company,
            phone=phone,
            requirement=requirement,
            status=LeadStatus.QUALIFYING,
            score=result.score,
            score_breakdown=result.breakdown,
        )
        s.add(lead)
        await s.flush()
        ctx.conversation.lead_id = lead.id
        await s.flush()
        return {"created": True, **lead_brief(lead, settings.qualified_score)}

    async def update_lead(lead_id: str, **fields: Any) -> dict[str, Any]:
        lead = await s.get(Lead, lead_id)
        if not lead:
            return {"error": f"No lead with id {lead_id}. Use search_customer or create_lead."}
        notes = fields.pop("notes", None)
        changed = []
        for key, value in fields.items():
            if value is not None and getattr(lead, key) != value:
                setattr(lead, key, value)
                changed.append(key)
        if notes:
            lead.notes = f"{lead.notes}\n{notes}".strip() if lead.notes else notes
            changed.append("notes")
        result = score_lead(
            requirement=lead.requirement,
            budget_usd=lead.budget_usd,
            timeline_days=lead.timeline_days,
            authority=lead.authority,
            company_size=lead.company_size,
        )
        lead.score, lead.score_breakdown = result.score, result.breakdown
        if lead.status == LeadStatus.NEW:
            lead.status = LeadStatus.QUALIFYING
        if (
            "status" not in changed
            and lead.status == LeadStatus.QUALIFYING
            and result.score >= settings.qualified_score
            and not missing_fields(lead)
        ):
            lead.status = LeadStatus.QUALIFIED
        ctx.conversation.lead_id = ctx.conversation.lead_id or lead.id
        lead.updated_at = datetime.now(UTC)
        await s.flush()
        return {
            "updated_fields": changed,
            "score_breakdown": {k: v for k, v in result.breakdown.items() if isinstance(v, dict)},
            **lead_brief(lead, settings.qualified_score),
        }

    async def check_calendar(
        preferred_date: date | None = None,
        time_of_day: str | None = None,
        limit: int = 4,
    ) -> dict[str, Any]:
        slots = await calendar.find_slots(
            s, settings, preferred_date=preferred_date, time_of_day=time_of_day, limit=limit
        )
        offered = [
            {
                "option": i + 1,
                "start_time": sl.start.astimezone(tz).isoformat(),
                "label": sl.label(tz),
            }
            for i, sl in enumerate(slots)
        ]
        ctx.remember(offered_slots=offered)
        await s.flush()
        return {
            "timezone": settings.business_timezone,
            "meeting_minutes": settings.meeting_minutes,
            "slots": offered,
        }

    async def book_meeting(
        lead_id: str, start_time: datetime, title: str | None = None
    ) -> dict[str, Any]:
        lead = await s.get(Lead, lead_id)
        if not lead:
            return {"error": f"No lead with id {lead_id}."}
        if start_time.tzinfo is None:
            start_time = start_time.replace(tzinfo=tz)
        try:
            slot = await calendar.ensure_bookable(s, settings, start_time)
        except calendar.SlotUnavailableError as exc:
            return {
                "booked": False,
                "error": str(exc),
                "hint": "Call check_calendar for open slots.",
            }
        appt = Appointment(
            lead_id=lead.id,
            title=title or f"Discovery call — {lead.company or lead.name}",
            start_at=slot.start,
            end_at=slot.end,
        )
        s.add(appt)
        await s.flush()
        appt.meeting_url = f"https://meet.leadflow.ai/{appt.id}"
        lead.status = LeadStatus.BOOKED
        ctx.remember(
            booked_appointment_id=appt.id,
            booked_label=slot.label(tz),
            offered_slots=[],
        )
        await s.flush()
        return {
            "booked": True,
            "appointment_id": appt.id,
            "title": appt.title,
            "start_time": slot.start.astimezone(tz).isoformat(),
            "label": slot.label(tz),
            "meeting_url": appt.meeting_url,
        }

    async def send_email_tool(
        to: str, subject: str, body: str, lead_id: str | None = None
    ) -> dict[str, Any]:
        record = await email.send_email(
            s,
            settings,
            to=to,
            subject=subject,
            body=body,
            lead_id=lead_id or ctx.conversation.lead_id,
        )
        return {"email_id": record.id, "status": record.status, "to": to, "subject": subject}

    return [
        StructuredTool.from_function(
            coroutine=search_customer,
            name="search_customer",
            args_schema=SearchCustomerArgs,
            description="Look up existing customers/leads in the CRM by email, name or company. "
            "Always call this first for a new inbound lead to avoid duplicates.",
        ),
        StructuredTool.from_function(
            coroutine=create_lead,
            name="create_lead",
            args_schema=CreateLeadArgs,
            description="Create a new lead in the CRM and link it to this conversation. "
            "Idempotent on email.",
        ),
        StructuredTool.from_function(
            coroutine=update_lead,
            name="update_lead",
            args_schema=UpdateLeadArgs,
            description="Record qualification details (budget, timeline, authority, team size, "
            "requirement, notes) or change status. Returns the recalculated lead score (0-100), "
            "whether the lead is qualified, and which fields are still missing.",
        ),
        StructuredTool.from_function(
            coroutine=check_calendar,
            name="check_calendar",
            args_schema=CheckCalendarArgs,
            description="Get open discovery-call slots from the sales calendar.",
        ),
        StructuredTool.from_function(
            coroutine=book_meeting,
            name="book_meeting",
            args_schema=BookMeetingArgs,
            description="Book a discovery call for a lead at a slot returned by check_calendar. "
            "Marks the lead as booked.",
        ),
        StructuredTool.from_function(
            coroutine=send_email_tool,
            name="send_email",
            args_schema=SendEmailArgs,
            description="Send an email to the lead (meeting confirmations, follow-ups, resources).",
        ),
    ]
