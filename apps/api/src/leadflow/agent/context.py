"""Per-run context shared by the graph nodes and tools."""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from leadflow.config import Settings
from leadflow.models import Conversation, Lead

Emit = Callable[[str, dict[str, Any]], Awaitable[None]]


async def _noop_emit(event: str, data: dict[str, Any]) -> None:
    return None


@dataclass
class RunContext:
    session: AsyncSession
    settings: Settings
    conversation: Conversation
    emit: Emit = _noop_emit
    use_llm: bool = False

    async def lead(self) -> Lead | None:
        if not self.conversation.lead_id:
            return None
        return await self.session.get(Lead, self.conversation.lead_id)

    def remember(self, **values: Any) -> None:
        """Merge values into the conversation's working memory (JSON column)."""
        self.conversation.state = {**(self.conversation.state or {}), **values}
