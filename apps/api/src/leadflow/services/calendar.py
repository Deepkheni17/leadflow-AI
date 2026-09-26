"""Calendar availability and booking against the appointments table."""

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from leadflow.config import Settings
from leadflow.models import Appointment


@dataclass(frozen=True)
class Slot:
    start: datetime  # UTC
    end: datetime  # UTC

    def label(self, tz: ZoneInfo) -> str:
        local = self.start.astimezone(tz)
        hour = local.strftime("%I:%M %p").lstrip("0")
        return f"{local.strftime('%A, %b')} {local.day} at {hour} {local.tzname()}"


class SlotUnavailableError(ValueError):
    pass


def _tz(settings: Settings) -> ZoneInfo:
    return ZoneInfo(settings.business_timezone)


def _round_up(dt: datetime, minutes: int) -> datetime:
    dt = dt.replace(second=0, microsecond=0)
    over = dt.minute % minutes
    return dt if over == 0 else dt + timedelta(minutes=minutes - over)


async def _busy(
    session: AsyncSession, start: datetime, end: datetime
) -> list[tuple[datetime, datetime]]:
    rows = await session.execute(
        select(Appointment.start_at, Appointment.end_at).where(
            Appointment.status == "confirmed",
            Appointment.start_at < end,
            Appointment.end_at > start,
        )
    )
    return [(s, e) for s, e in rows.all()]


def _in_business_hours(start: datetime, settings: Settings) -> bool:
    tz = _tz(settings)
    local = start.astimezone(tz)
    end_local = local + timedelta(minutes=settings.meeting_minutes)
    open_at = datetime.combine(local.date(), time(settings.business_start_hour), tz)
    close_at = datetime.combine(local.date(), time(settings.business_end_hour), tz)
    return local.weekday() < 5 and open_at <= local and end_local <= close_at


async def find_slots(
    session: AsyncSession,
    settings: Settings,
    *,
    preferred_date: date | None = None,
    time_of_day: str | None = None,
    limit: int = 4,
    now: datetime | None = None,
) -> list[Slot]:
    """Return open meeting slots, spread across days (at most two per day)."""
    tz = _tz(settings)
    step = settings.meeting_minutes
    now = now or datetime.now(UTC)
    earliest = _round_up(now + timedelta(hours=2), step)
    horizon = now + timedelta(days=settings.booking_horizon_days)
    busy = await _busy(session, earliest, horizon + timedelta(days=7))

    start_day = earliest.astimezone(tz).date()
    if preferred_date and preferred_date > start_day:
        start_day = preferred_date

    slots: list[Slot] = []
    day = start_day
    days_scanned = 0
    while len(slots) < limit and days_scanned < settings.booking_horizon_days + 7:
        days_scanned += 1
        if day.weekday() >= 5:
            day += timedelta(days=1)
            continue
        first_hour, last_hour = settings.business_start_hour, settings.business_end_hour
        if time_of_day == "morning":
            last_hour = min(last_hour, 12)
        elif time_of_day == "afternoon":
            first_hour = max(first_hour, 12)
        # Offer a morning and an afternoon option each day where possible.
        candidates: list[datetime] = []
        cursor = datetime.combine(day, time(first_hour), tz)
        close = datetime.combine(day, time(last_hour), tz)
        while cursor + timedelta(minutes=step) <= close:
            candidates.append(cursor.astimezone(UTC))
            cursor += timedelta(minutes=step)
        per_day = 0
        last_pick: datetime | None = None
        for c in candidates:
            if c < earliest:
                continue
            end = c + timedelta(minutes=step)
            if any(s < end and e > c for s, e in busy):
                continue
            if last_pick and c - last_pick < timedelta(hours=3):
                continue
            slots.append(Slot(c, end))
            last_pick = c
            per_day += 1
            if per_day == 2 or len(slots) == limit:
                break
        day += timedelta(days=1)
    return slots


async def ensure_bookable(session: AsyncSession, settings: Settings, start: datetime) -> Slot:
    start = start.astimezone(UTC).replace(second=0, microsecond=0)
    end = start + timedelta(minutes=settings.meeting_minutes)
    if start < datetime.now(UTC) + timedelta(minutes=30):
        raise SlotUnavailableError("That time is in the past or too soon to book.")
    if not _in_business_hours(start, settings):
        raise SlotUnavailableError(
            f"Outside business hours ({settings.business_start_hour}:00-"
            f"{settings.business_end_hour}:00 {settings.business_timezone}, Mon-Fri)."
        )
    if await _busy(session, start, end):
        raise SlotUnavailableError("That slot was just taken.")
    return Slot(start, end)
