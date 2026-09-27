"""Built-in, deterministic agent policy.

When no Anthropic API key is configured, this policy stands in for the LLM inside the same
LangGraph graph: it reads the conversation and tool results and emits the same kind of
`AIMessage` (text or tool calls). The tools, audit log, dashboard and API behave identically,
so the whole product runs end to end offline and in tests.
"""

import json
import re
import uuid
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage

from leadflow.agent.context import RunContext
from leadflow.models import Lead, LeadStatus
from leadflow.services.extraction import extract_all, extract_budget
from leadflow.services.scoring import missing_fields

FORM_PREFIX = "[Website form submission]"
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")

QUESTIONS = {
    "budget_usd": "What budget range have you set aside for this?",
    "timeline_days": "When would you ideally like this up and running?",
    "authority": "Will you be making the final call on this, or is someone else involved?",
    "company_size": "Roughly how many people are on the team that would use it?",
}
FOLLOW_UPS = {
    "budget_usd": "Even a rough budget range helps me match you with the right team — "
    "is it closer to $5k, $20k, or more?",
    "timeline_days": "Is this more of a this-month priority, or something for later in the year?",
    "authority": "Are you the person who'd sign off on this project?",
    "company_size": "Is it a small team (under 10), or a larger group?",
}


def format_form(
    *, name: str, email: str, message: str, company: str | None = None, phone: str | None = None
) -> str:
    lines = [FORM_PREFIX, f"Name: {name}", f"Email: {email}"]
    if company:
        lines.append(f"Company: {company}")
    if phone:
        lines.append(f"Phone: {phone}")
    lines.append(f"Message: {message}")
    return "\n".join(lines)


def parse_form(text: str) -> dict[str, str] | None:
    if not text.startswith(FORM_PREFIX):
        return None
    out: dict[str, str] = {}
    key = None
    for line in text.splitlines()[1:]:
        m = re.match(r"^(Name|Email|Company|Phone|Message):\s?(.*)$", line)
        if m:
            key = m.group(1).lower()
            out[key] = m.group(2).strip()
        elif key == "message":
            out["message"] += "\n" + line
    return out


def _call(tool: str, /, **args: Any) -> AIMessage:
    args = {k: v for k, v in args.items() if v is not None}
    return AIMessage(
        content="",
        tool_calls=[
            {"name": tool, "args": args, "id": f"call_{uuid.uuid4().hex[:16]}", "type": "tool_call"}
        ],
    )


def _first_name(lead: Lead) -> str:
    return lead.name.split()[0] if lead.name else "there"


_INTENT = re.compile(
    r"^(?:we|i)(?:'re| are|'m| am|'d| would)?\s*(?:really\s+)?"
    r"(?:looking for|looking to (?:build|get|set up|add)|want(?: to (?:build|get|set up|add))?|"
    r"would like(?: to (?:build|get|set up|add))?|like|need(?: to (?:build|get|set up|add))?|"
    r"are interested in|interested in)\s+",
    re.IGNORECASE,
)


def _need_phrase(text: str | None) -> str | None:
    """'We want an AI agent that…' -> 'an AI agent that…'; None if it can't be rephrased."""
    if not text:
        return None
    sentence = re.split(r"(?<=[.!?])\s", text.strip())[0].rstrip(".!?")
    sentence = re.sub(r"^(hi|hello|hey)( there| team)?[,!.\s]+", "", sentence, flags=re.IGNORECASE)
    m = _INTENT.match(sentence)
    if m:
        phrase = sentence[m.end() :]
    elif re.match(r"^(an?|the|some)\s", sentence, re.IGNORECASE):
        # Already a noun phrase, e.g. an LLM-written "An AI agent that qualifies…".
        phrase = sentence[:1].lower() + sentence[1:]
    else:
        return None
    if len(phrase) > 110:
        phrase = phrase[:107].rsplit(" ", 1)[0] + "…"
    return phrase or None


def _need_summary(text: str | None) -> str:
    phrase = _need_phrase(text)
    return phrase if phrase else "your goals and current workflow"


def _captured(fields: dict[str, Any]) -> str:
    bits = []
    if "budget_usd" in fields:
        bits.append(f"${fields['budget_usd']:,} budget")
    if "timeline" in fields:
        bits.append(fields["timeline"].lower())
    if "company_size" in fields:
        n = fields["company_size"]
        bits.append(f"{n} {'person' if n == 1 else 'people'}")
    if "authority" in fields:
        bits.append(
            {
                "decision_maker": "you make the call",
                "influencer": "others weigh in on the decision",
                "researcher": "you're researching for the team",
            }[fields["authority"]]
        )
    return ", ".join(bits)


_ORDINALS = {
    "first": 1,
    "1st": 1,
    "second": 2,
    "2nd": 2,
    "third": 3,
    "3rd": 3,
    "fourth": 4,
    "4th": 4,
}
_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def pick_slot(text: str, offered: list[dict[str, Any]], tz: ZoneInfo) -> dict[str, Any] | None:
    t = text.lower().strip()
    starts = [(o, datetime.fromisoformat(o["start_time"]).astimezone(tz)) for o in offered]
    weekday = next((i for i, d in enumerate(_WEEKDAYS) if d in t or d[:3] + " " in t + " "), None)

    tm = re.search(r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", t)
    if tm:
        hour = int(tm.group(1)) % 12 + (12 if tm.group(3) == "pm" else 0)
        minute = int(tm.group(2) or 0)
        hits = [
            o
            for o, dt in starts
            if dt.hour == hour
            and dt.minute == minute
            and (weekday is None or dt.weekday() == weekday)
        ]
        if hits:
            return hits[0]
    m = re.search(r"\b(?:option|slot|number|no\.?|#)\s*([1-8])\b", t) or re.fullmatch(
        r"\D*([1-8])\D*", t
    )
    if m and 1 <= int(m.group(1)) <= len(offered):
        return offered[int(m.group(1)) - 1]
    for word, n in _ORDINALS.items():
        if re.search(rf"\b{word}\b", t) and n <= len(offered):
            return offered[n - 1]
    if re.search(r"\blast\b", t):
        return offered[-1]
    if weekday is not None:
        hits = [(o, dt) for o, dt in starts if dt.weekday() == weekday]
        if "afternoon" in t:
            hits = [h for h in hits if h[1].hour >= 12] or hits
        elif "morning" in t:
            hits = [h for h in hits if h[1].hour < 12] or hits
        if hits:
            return hits[0][0]
    if len(offered) == 1 and re.search(
        r"\b(yes|yep|sure|works|perfect|great|ok|okay|book it)\b", t
    ):
        return offered[0]
    return None


def _wants_other_times(text: str) -> bool:
    return bool(
        re.search(
            r"\b(other|another|different|none|neither|later|next week|don'?t work|doesn'?t work|"
            r"can'?t make|not available|busy|morning|afternoon)\b",
            text.lower(),
        )
    )


def _wants_meeting(text: str) -> bool:
    return bool(
        re.search(
            r"\b(book|call|meeting|demo|talk to|speak (to|with)|schedule|hop on|chat with (a|someone))\b",
            text.lower(),
        )
    )


def _contextual_answers(text: str, last_asked: list[str], lead: Lead) -> dict[str, Any]:
    """Interpret short answers ("yes", "about 20000", "12") against the questions just asked."""
    t = text.lower().strip()
    out: dict[str, Any] = {}
    if "authority" in last_asked and lead.authority is None:
        if re.match(
            r"^(yes|yep|yeah|yup|i am|i do|i will|me|correct|that'?s me|it'?s me|sure)\b", t
        ):
            out["authority"] = "decision_maker"
        elif re.match(r"^(no|nope|not me|not really)\b", t):
            out["authority"] = "influencer"
    if "budget_usd" in last_asked and lead.budget_usd is None:
        if (b := extract_budget(text + " budget")) is not None:
            out["budget_usd"] = b
    if "company_size" in last_asked and lead.company_size is None and "budget_usd" not in out:
        m = re.fullmatch(r"\D*?(\d{1,5})\D*", t)
        if m and int(m.group(1)) < 100_000:
            out["company_size"] = int(m.group(1))
    return out


class BuiltinPolicy:
    """Deterministic lead-qualification policy that emits LangChain tool calls."""

    async def decide(self, ctx: RunContext, messages: list[BaseMessage]) -> AIMessage:
        last_human = max(i for i, m in enumerate(messages) if isinstance(m, HumanMessage))
        human = str(messages[last_human].content)
        done = self._tool_results(messages[last_human + 1 :])
        tz = ZoneInfo(ctx.settings.business_timezone)
        state = ctx.conversation.state or {}
        lead = await ctx.lead()
        form = parse_form(human)

        # --- 1. Understand the inbound lead: dedupe against the CRM, then create it. ---------
        if form:
            if "search_customer" not in done:
                return _call("search_customer", query=form.get("email", ""))
            if lead is None:
                return _call(
                    "create_lead",
                    name=form.get("name", "Unknown"),
                    email=form.get("email", ""),
                    company=form.get("company") or None,
                    phone=form.get("phone") or None,
                    requirement=form.get("message"),
                )
            if "update_lead" not in done:
                extracted = extract_all(form.get("message", ""))
                return _call("update_lead", lead_id=lead.id, status="qualifying", **extracted)
            return self._next_step(
                ctx, lead, done, human, first_turn=True, captured=done["update_lead"][-1]["args"]
            )

        if lead is None:
            return await self._identify(ctx, human, done)
        if "create_lead" in done:  # chat started without the form; lead identified this turn
            if "update_lead" not in done:
                return _call(
                    "update_lead", lead_id=lead.id, status="qualifying", **extract_all(human)
                )
            return self._next_step(
                ctx, lead, done, human, first_turn=True, captured=done["update_lead"][-1]["args"]
            )

        # --- 2. Booking flow. ---------------------------------------------------------------
        if "book_meeting" in done:
            result = done["book_meeting"][-1]["result"]
            if result.get("booked"):
                if "send_email" not in done:
                    return _call(
                        "send_email",
                        lead_id=lead.id,
                        to=lead.email,
                        subject=f"Confirmed: {result['title']}",
                        body=self._confirmation_email(ctx, lead, result),
                    )
                if not any(c["args"].get("notes") for c in done.get("update_lead", [])):
                    return _call(
                        "update_lead",
                        lead_id=lead.id,
                        notes=f"Discovery call booked for {result['label']}.",
                    )
                return AIMessage(
                    content=(
                        f"Done — you're booked for {result['label']}. I've emailed a confirmation to "
                        f"{lead.email} with the meeting link ({result['meeting_url']}). Our team will "
                        f"come prepared to talk through {_need_summary(lead.requirement)}. "
                        "Anything else I can help with before then?"
                    )
                )
            if "check_calendar" not in done:
                return _call("check_calendar", limit=4)
            return AIMessage(content="Sorry — that slot just got taken. " + self._slot_list(done))

        if state.get("booked_appointment_id"):
            if _wants_other_times(human) or re.search(
                r"\b(reschedul|move|change)\w*", human.lower()
            ):
                return AIMessage(
                    content=(
                        f"No problem. You're currently booked for {state.get('booked_label')}. "
                        "Use the reschedule link in your confirmation email, or reply with a day that "
                        "suits you and a teammate will move it for you."
                    )
                )
            return AIMessage(
                content=(
                    f"You're all set for {state.get('booked_label')} — the link is in your inbox. "
                    "Is there anything you'd like the team to prepare before the call?"
                )
            )

        offered = state.get("offered_slots") or []
        if offered and "check_calendar" not in done:
            choice = pick_slot(human, offered, tz)
            if choice:
                return _call("book_meeting", lead_id=lead.id, start_time=choice["start_time"])
            if _wants_other_times(human):
                ctx.remember(reoffering=True)
                t = human.lower()
                pref: date | None = None
                if "next week" in t:
                    today = datetime.now(tz).date()
                    pref = today + timedelta(days=7 - today.weekday())
                tod = "morning" if "morning" in t else "afternoon" if "afternoon" in t else None
                return _call(
                    "check_calendar",
                    preferred_date=pref and pref.isoformat(),
                    time_of_day=tod,
                    limit=4,
                )

        # --- 3. Qualify: capture any new facts from this reply. ----------------------------
        extracted = {
            **_contextual_answers(human, state.get("last_asked", []), lead),
            **extract_all(human),
        }
        extracted = {k: v for k, v in extracted.items() if getattr(lead, k) != v}
        if extracted and "update_lead" not in done:
            return _call("update_lead", lead_id=lead.id, **extracted)
        captured = done["update_lead"][-1]["args"] if "update_lead" in done else {}
        return self._next_step(ctx, lead, done, human, first_turn=False, captured=captured)

    # ------------------------------------------------------------------------------------

    def _next_step(
        self,
        ctx: RunContext,
        lead: Lead,
        done: dict[str, list[dict[str, Any]]],
        human: str,
        *,
        first_turn: bool,
        captured: dict[str, Any],
    ) -> AIMessage:
        threshold = ctx.settings.qualified_score
        state = ctx.conversation.state or {}
        asked: dict[str, int] = dict(state.get("asked", {}))
        askable = [f for f in missing_fields(lead) if asked.get(f, 0) < 2]
        wants_meeting = _wants_meeting(human) and not first_turn

        if "check_calendar" in done:
            slots = done["check_calendar"][-1]["result"].get("slots", [])
            if not slots:
                return AIMessage(
                    content=(
                        "Our calendar is fully booked for the next couple of weeks. I've flagged you "
                        "for a priority callback — someone from the team will reach out by email."
                    )
                )
            if state.get("reoffering"):
                ctx.remember(reoffering=False)
                return AIMessage(
                    content="No problem — here are some other options:\n\n" + self._slot_list(done)
                )
            opener = (
                f"Great news — you're a strong fit (lead score {lead.score}/100). "
                if lead.score >= threshold
                else "Happy to set that up. "
            )
            if first_turn:
                opener = f"Hi {_first_name(lead)}, thanks for reaching out! {opener}"
            return AIMessage(
                content=(
                    f"{opener}Here are a few times for a {ctx.settings.meeting_minutes}-minute "
                    f"discovery call with our team:\n\n{self._slot_list(done)}"
                )
            )

        if lead.score >= threshold and (not askable or wants_meeting):
            return _call("check_calendar", limit=4)
        if wants_meeting and lead.budget_usd is not None and lead.score >= threshold - 15:
            return _call("check_calendar", limit=4)

        if askable:
            fields = askable[:2]
            for f in fields:
                asked[f] = asked.get(f, 0) + 1
            ctx.remember(asked=asked, last_asked=fields)
            questions = [(FOLLOW_UPS if asked[f] > 1 else QUESTIONS)[f] for f in fields]
            if first_turn:
                company = f" at {lead.company}" if lead.company else ""
                phrase = _need_phrase(lead.requirement)
                intro = (
                    f"Hi {_first_name(lead)}, thanks for reaching out! I'm the "
                    f"{ctx.settings.company_name} assistant. "
                    + (
                        f"It sounds like the team{company} needs {phrase} — that's right in our "
                        "wheelhouse."
                        if phrase
                        else "Thanks for sharing what you're working on — I'd love to learn a "
                        "bit more."
                    )
                )
                if note := _captured(captured):
                    intro += f" I've noted: {note}."
                intro += " A couple of quick questions so I can connect you with the right people:"
            else:
                note = _captured(captured)
                intro = f"Thanks, that helps — noted: {note}." if note else "Thanks!"
                intro += " Just " + ("one more thing:" if len(fields) == 1 else "a couple more:")
            return AIMessage(content=intro + "\n\n" + "\n".join(f"• {q}" for q in questions))

        # Fully qualified but below threshold -> nurture.
        nurture_done = any(
            c["args"].get("status") == "nurture" for c in done.get("update_lead", [])
        )
        if lead.status != LeadStatus.NURTURE and not nurture_done:
            return _call(
                "update_lead",
                lead_id=lead.id,
                status="nurture",
                notes=f"Scored {lead.score}/100 (< {threshold}); moved to nurture.",
            )
        if "send_email" not in done and not state.get("nurture_email_sent"):
            ctx.remember(nurture_email_sent=True)
            return _call(
                "send_email",
                lead_id=lead.id,
                to=lead.email,
                subject=f"Resources for your AI automation plans — {ctx.settings.company_name}",
                body=self._nurture_email(ctx, lead),
            )
        return AIMessage(
            content=(
                f"Thanks, {_first_name(lead)} — really appreciate the detail. Based on your timeline "
                "and scope, a full engagement may be early right now, so I've emailed you a short "
                "guide and a few case studies to help you plan. Whenever you're ready to move "
                "forward, just reply here and I'll get a call on the calendar right away."
            )
        )

    async def _identify(
        self, ctx: RunContext, human: str, done: dict[str, list[dict[str, Any]]]
    ) -> AIMessage:
        """Chat started without the form: find the person by email or ask for it."""
        m = _EMAIL.search(human)
        if not m:
            return AIMessage(
                content=(
                    f"Hi! I'm the {ctx.settings.company_name} assistant. I can help you scope an AI "
                    "automation project and book time with our team. What's your name and work email, "
                    "and what are you hoping to automate?"
                )
            )
        email = m.group(0).lower()
        if "search_customer" not in done:
            return _call("search_customer", query=email)
        name_m = re.search(
            r"\b(?:i'?m|i am|my name is|this is)\s+([A-Z][a-z]+(?: [A-Z][a-z]+)?)", human
        )
        name = name_m.group(1) if name_m else email.split("@")[0].replace(".", " ").title()
        sentences = re.split(r"(?<=[.!?])\s+", human.strip())
        kept = [
            s
            for s in sentences
            if not _EMAIL.search(s)
            and not re.match(
                r"^(hi|hello|hey)?[,!\s]*(i'?m|i am|my name is|this is)\b", s, re.IGNORECASE
            )
        ]
        requirement = " ".join(kept).strip() or None
        return _call("create_lead", name=name, email=email, requirement=requirement)

    @staticmethod
    def _tool_results(turn: list[BaseMessage]) -> dict[str, list[dict[str, Any]]]:
        calls: dict[str, dict[str, Any]] = {}
        for m in turn:
            if isinstance(m, AIMessage):
                for tc in m.tool_calls:
                    calls[tc["id"]] = tc
        out: dict[str, list[dict[str, Any]]] = {}
        for m in turn:
            if isinstance(m, ToolMessage):
                tc = calls.get(m.tool_call_id, {})
                try:
                    result = json.loads(m.content) if isinstance(m.content, str) else {}
                except json.JSONDecodeError:
                    result = {"raw": m.content}
                out.setdefault(m.name or tc.get("name", "?"), []).append(
                    {
                        "args": tc.get("args", {}),
                        "result": result if isinstance(result, dict) else {},
                    }
                )
        return out

    @staticmethod
    def _slot_list(done: dict[str, list[dict[str, Any]]]) -> str:
        slots = done.get("check_calendar", [{}])[-1].get("result", {}).get("slots", [])
        lines = "\n".join(f"{s['option']}. {s['label']}" for s in slots)
        return f"{lines}\n\nWhich works best? Just reply with the number."

    @staticmethod
    def _confirmation_email(ctx: RunContext, lead: Lead, booking: dict[str, Any]) -> str:
        return (
            f"Hi {_first_name(lead)},\n\n"
            f"Your discovery call with {ctx.settings.company_name} is confirmed.\n\n"
            f"When: {booking['label']} ({ctx.settings.meeting_minutes} minutes)\n"
            f"Where: {booking['meeting_url']}\n\n"
            + (
                f"We'll walk through {phrase}, your current workflow, and what a first "
                if (phrase := _need_phrase(lead.requirement))
                else "We'll walk through your goals, your current workflow, and what a first "
            )
            + "version could look like — including timeline and investment.\n\n"
            "Need to reschedule? Just reply to this email.\n\n"
            f"— The {ctx.settings.company_name} team"
        )

    @staticmethod
    def _nurture_email(ctx: RunContext, lead: Lead) -> str:
        return (
            f"Hi {_first_name(lead)},\n\n"
            "Thanks for telling us about your plans. Here are a few resources to help you scope "
            "your first AI automation:\n\n"
            "• Playbook: where AI agents pay off first in sales & support\n"
            "• Case study: 3x faster lead response with an AI qualification agent\n"
            "• Checklist: data and integrations to line up before you start\n\n"
            "When the timing is right, reply to this email and we'll set up a call.\n\n"
            f"— The {ctx.settings.company_name} team"
        )
