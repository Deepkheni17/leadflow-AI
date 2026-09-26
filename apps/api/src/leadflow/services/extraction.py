"""Rule-based extraction of qualification signals from free text.

Used by the built-in agent policy when no LLM is configured. With Claude enabled, the model
extracts these fields itself and passes them to `update_lead`.
"""

import re
from typing import Any

_MULT = {"k": 1_000, "thousand": 1_000, "m": 1_000_000, "mn": 1_000_000, "million": 1_000_000}
_MONEY = re.compile(
    r"(?P<cur>\$|usd|us\$|€|eur|£|gbp)?\s*"
    r"(?P<num>\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*"
    r"(?P<mult>k|thousand|mn|m|million)?\b\s*(?P<cur2>usd|dollars|eur|euros|gbp)?",
    re.IGNORECASE,
)
_BUDGET_WORDS = re.compile(r"budget|spend|invest|afford|price|cost|pay", re.IGNORECASE)
_NO_BUDGET = re.compile(
    r"\b(no budget|not sure (about|on) (the )?budget|budget (is )?(tbd|unknown|not set))",
    re.IGNORECASE,
)
_NOT_MONEY_TAIL = re.compile(
    r"\s*(people|employees|staff|reps|agents|person|members|days|weeks|months|years|users|"
    r"seats|leads|am|pm|%)",
    re.IGNORECASE,
)


def extract_budget(text: str) -> int | None:
    if _NO_BUDGET.search(text):
        return None
    has_budget_context = bool(_BUDGET_WORDS.search(text))
    values: list[int] = []
    for m in _MONEY.finditer(text):
        cur = m.group("cur") or m.group("cur2")
        mult = (m.group("mult") or "").lower()
        explicit = bool(cur or mult)
        if not (explicit or has_budget_context):
            continue
        tail = text[m.end() - len(m.group("cur2") or "") : m.end() + 14]
        if not explicit and _NOT_MONEY_TAIL.match(tail):
            continue
        try:
            value = float(m.group("num").replace(",", "")) * _MULT.get(mult, 1)
        except ValueError:
            continue
        if not explicit and 1900 <= value <= 2100:  # looks like a year
            continue
        if value >= 100:
            values.append(int(value))
    if not values:
        return None
    # A range like "10-20k": the first number has no multiplier of its own.
    if len(values) >= 2 and values[0] < 1000 <= values[1]:
        values[0] *= 1000
    if len(values) >= 2 and values[1] > values[0]:
        return (values[0] + values[1]) // 2
    return values[0]


_NUM_WORDS = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "a": 1,
    "an": 1,
    "a couple of": 2,
    "couple of": 2,
    "few": 3,
    "a few": 3,
}


def extract_timeline(text: str) -> tuple[str, int] | None:
    t = text.lower()
    m = re.search(
        r"\b(\d+|one|two|three|four|five|six|a couple of|couple of|a few|few|an|a)\s*"
        r"(day|week|month)s?\b",
        t,
    )
    if m:
        token = m.group(1)
        n = int(token) if token.isdigit() else _NUM_WORDS[token]
        unit = m.group(2)
        days = max(1, n * {"day": 1, "week": 7, "month": 30}[unit])
        return f"Within {n} {unit}{'s' if n != 1 else ''}", days
    fixed = [
        (r"\b(asap|immediately|right away|urgent(ly)?|this week|yesterday)\b", "ASAP", 7),
        (r"\b(this month|next month|30 days)\b", "Within a month", 30),
        (r"\b(this quarter|next quarter|90 days|q[1-4])\b", "This quarter", 90),
        (
            r"\b(this year|end of (the )?year|later this year|half a year)\b",
            "Within six months",
            180,
        ),
        (
            r"\b(next year|no rush|just exploring|exploring options|someday|not urgent)\b",
            "Exploring",
            365,
        ),
    ]
    for pattern, label, days in fixed:
        if re.search(pattern, t):
            return label, days
    return None


_TITLES = (
    r"(?:managing |general |senior )?(?:founder|co-?founder|ceo|cto|coo|cfo|cmo|cro|owner|head|"
    r"director|vp|president|partner|principal|proprietor|decision)"
)


def extract_authority(text: str) -> str | None:
    t = text.lower().replace("’", "'")
    # Someone else signs off -> influencer (checked first: "I'm the CMO but the CEO signs off").
    if re.search(
        r"(my (boss|manager|ceo|cto|founder|director|vp)|need (approval|sign-?off)"
        r"|the (board|team|leadership|ceo|cfo|founder|owner|founders) (decides|will decide|signs off|"
        r"approves|makes the call|has the final say)"
        r"|i('ll| will) (recommend|present|pitch)|with my (team|manager|boss)|not the final"
        r"|someone else decides|we decide together|not the decision)",
        t,
    ):
        return "influencer"
    if re.search(r"(research(ing)? for|on behalf of|just gathering)", t):
        return "researcher"
    if re.search(
        rf"(i'?m (the |a )?{_TITLES}|i am (the |a )?{_TITLES}"
        r"|\bi (own|run|founded)\b|\bi (make|decide|sign off)\b|decision[- ]maker"
        r"|final (say|decision) is mine|\bi can (approve|sign)\b|it'?s my (call|decision)"
        r"|\bi decide\b|\bme\b.{0,20}\bdecid)",
        t,
    ):
        return "decision_maker"
    return None


def extract_company_size(text: str) -> int | None:
    t = text.lower()
    if re.search(r"\b(just me|solo|one-person|freelancer|by myself)\b", t):
        return 1
    m = re.search(
        r"\b(\d{1,6})\+?\s*(?:-\s*person|people|employees|staff|person|members|member|reps|"
        r"sales ?reps|salespeople|agents|seats|engineers|folks)\b",
        t,
    )
    if m:
        return int(m.group(1))
    m = re.search(r"\bteam of (\d{1,6})\b", t)
    return int(m.group(1)) if m else None


def extract_all(text: str) -> dict[str, Any]:
    out: dict[str, Any] = {}
    if (budget := extract_budget(text)) is not None:
        out["budget_usd"] = budget
    if timeline := extract_timeline(text):
        out["timeline"], out["timeline_days"] = timeline
    if authority := extract_authority(text):
        out["authority"] = authority
    if (size := extract_company_size(text)) is not None:
        out["company_size"] = size
    return out
