"""Deterministic, explainable lead scoring (BANT-style, 0-100)."""

from dataclasses import dataclass
from typing import Any

FIT_KEYWORDS = (
    "ai",
    "agent",
    "automation",
    "automate",
    "chatbot",
    "bot",
    "crm",
    "lead",
    "sales",
    "appointment",
    "booking",
    "schedule",
    "workflow",
    "integration",
    "support",
    "pipeline",
    "qualif",
    "follow-up",
    "follow up",
    "outreach",
    "llm",
    "assistant",
)

QUALIFYING_FIELDS = ("budget_usd", "timeline_days", "authority", "company_size")


@dataclass(frozen=True)
class ScoreResult:
    score: int
    grade: str  # hot | warm | cold
    breakdown: dict[str, Any]


def _need_points(requirement: str | None) -> tuple[int, str]:
    if not requirement or len(requirement.strip()) < 8:
        return 0, "No clear requirement yet"
    words = set(requirement.lower().replace("-", " ").split())
    text = requirement.lower()
    hits = sum(1 for k in FIT_KEYWORDS if (k in words if len(k) <= 3 else k in text))
    if hits >= 2:
        return 30, "Strong fit with our services"
    if hits == 1:
        return 22, "Relevant requirement"
    return 12, "Requirement captured, fit unclear"


def _budget_points(budget: int | None) -> tuple[int, str]:
    if budget is None:
        return 0, "Budget unknown"
    if budget >= 20_000:
        return 25, f"${budget:,} budget"
    if budget >= 10_000:
        return 20, f"${budget:,} budget"
    if budget >= 5_000:
        return 14, f"${budget:,} budget"
    if budget >= 1_000:
        return 7, f"${budget:,} budget (small)"
    return 2, f"${budget:,} budget (very small)"


def _timeline_points(days: int | None) -> tuple[int, str]:
    if days is None:
        return 0, "Timeline unknown"
    if days <= 31:
        return 20, "Wants to start within a month"
    if days <= 92:
        return 14, "Starting this quarter"
    if days <= 185:
        return 8, "Starting within six months"
    return 3, "Long-term / exploring"


def _authority_points(authority: str | None) -> tuple[int, str]:
    return {
        "decision_maker": (15, "Decision maker"),
        "influencer": (8, "Influences the decision"),
        "researcher": (3, "Researching for someone else"),
    }.get(authority or "", (0, "Decision role unknown"))


def _size_points(size: int | None) -> tuple[int, str]:
    if size is None:
        return 0, "Team size unknown"
    if size >= 50:
        return 10, f"{size} people"
    if size >= 10:
        return 7, f"{size} people"
    return 4, f"{size} {'person' if size == 1 else 'people'}"


def score_lead(
    *,
    requirement: str | None,
    budget_usd: int | None,
    timeline_days: int | None,
    authority: str | None,
    company_size: int | None,
) -> ScoreResult:
    parts = {
        "need": (*_need_points(requirement), 30),
        "budget": (*_budget_points(budget_usd), 25),
        "timeline": (*_timeline_points(timeline_days), 20),
        "authority": (*_authority_points(authority), 15),
        "company_size": (*_size_points(company_size), 10),
    }
    total = sum(p[0] for p in parts.values())
    grade = "hot" if total >= 75 else "warm" if total >= 50 else "cold"
    breakdown: dict[str, Any] = {
        name: {"points": pts, "max": mx, "reason": reason}
        for name, (pts, reason, mx) in parts.items()
    }
    breakdown["grade"] = grade
    return ScoreResult(score=total, grade=grade, breakdown=breakdown)


def missing_fields(lead: Any) -> list[str]:
    return [f for f in QUALIFYING_FIELDS if getattr(lead, f) is None]
