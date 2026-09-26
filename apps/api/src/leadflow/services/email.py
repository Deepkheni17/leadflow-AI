"""Outbound email. Sends through SMTP when configured; otherwise records a simulated send."""

from email.message import EmailMessage

import aiosmtplib
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from leadflow.config import Settings
from leadflow.models import Email

log = structlog.get_logger(__name__)


async def send_email(
    session: AsyncSession,
    settings: Settings,
    *,
    to: str,
    subject: str,
    body: str,
    lead_id: str | None = None,
) -> Email:
    status, error = "simulated", None
    if settings.smtp_host:
        msg = EmailMessage()
        msg["From"] = settings.smtp_from
        msg["To"] = to
        msg["Subject"] = subject
        msg.set_content(body)
        try:
            await aiosmtplib.send(
                msg,
                hostname=settings.smtp_host,
                port=settings.smtp_port,
                username=settings.smtp_username,
                password=settings.smtp_password,
                start_tls=settings.smtp_starttls,
                timeout=20,
            )
            status = "sent"
        except (aiosmtplib.SMTPException, OSError) as exc:
            status, error = "failed", str(exc)
            log.warning("email.send_failed", to=to, error=error)

    email = Email(lead_id=lead_id, to=to, subject=subject, body=body, status=status, error=error)
    session.add(email)
    await session.flush()
    log.info("email.recorded", to=to, subject=subject, status=status)
    return email
