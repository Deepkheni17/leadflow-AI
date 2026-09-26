"""Runs one conversational turn through the agent graph and persists the result."""

import asyncio
from collections import defaultdict
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any

import structlog
from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    ToolMessage,
    message_to_dict,
    messages_from_dict,
)
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from leadflow.agent.context import RunContext
from leadflow.agent.graph import lead_agent
from leadflow.agent.tools import lead_brief
from leadflow.config import Settings, get_settings
from leadflow.db import SessionLocal, utcnow
from leadflow.models import Conversation, Message

log = structlog.get_logger(__name__)

_locks: defaultdict[str, asyncio.Lock] = defaultdict(asyncio.Lock)


def _role(m: BaseMessage) -> str:
    return {HumanMessage: "user", AIMessage: "assistant", ToolMessage: "tool"}.get(
        type(m), "system"
    )


def _text(m: BaseMessage) -> str:
    if isinstance(m.content, str):
        return m.content
    return "".join(
        b.get("text", "") for b in m.content if isinstance(b, dict) and b.get("type") == "text"
    )


async def _load_history(session: AsyncSession, conversation_id: str) -> list[BaseMessage]:
    rows = (
        (
            await session.execute(
                select(Message)
                .where(Message.conversation_id == conversation_id)
                .order_by(Message.seq)
            )
        )
        .scalars()
        .all()
    )
    return messages_from_dict([r.payload for r in rows if r.payload])


async def _persist(
    session: AsyncSession,
    conversation: Conversation,
    messages: list[BaseMessage],
    started_at: datetime | None = None,
) -> None:
    seq = (
        await session.execute(
            select(func.coalesce(func.max(Message.seq), 0)).where(
                Message.conversation_id == conversation.id
            )
        )
    ).scalar_one()
    now = utcnow()
    for m in messages:
        seq += 1
        # The user's message is stamped with the turn start so it sorts before the tool calls.
        created = started_at if (started_at and isinstance(m, HumanMessage)) else now
        session.add(
            Message(
                conversation_id=conversation.id,
                seq=seq,
                role=_role(m),
                content=_text(m),
                payload=message_to_dict(m),
                created_at=created,
            )
        )
    conversation.updated_at = utcnow()
    await session.commit()


async def run_turn(
    conversation_id: str,
    user_text: str,
    *,
    settings: Settings | None = None,
    use_llm: bool | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Process a user message and yield streaming events:

    action_start / action_end / lead / message / notice / error / done
    """
    settings = settings or get_settings()
    queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()

    async def emit(event: str, data: dict[str, Any]) -> None:
        await queue.put({"event": event, "data": data})

    async def work() -> None:
        async with _locks[conversation_id], SessionLocal() as session:
            conversation = await session.get(Conversation, conversation_id)
            if conversation is None:
                await emit("error", {"message": "Conversation not found"})
                return
            ctx = RunContext(
                session=session,
                settings=settings,
                conversation=conversation,
                emit=emit,
                use_llm=settings.llm_enabled if use_llm is None else use_llm,
            )
            history = await _load_history(session, conversation_id)
            human = HumanMessage(content=user_text)
            started_at = utcnow()
            try:
                result = await lead_agent.ainvoke(
                    {"messages": [*history, human]},
                    config={"configurable": {"ctx": ctx}, "recursion_limit": 40},
                )
                await _persist(
                    session, conversation, result["messages"][len(history) :], started_at
                )
            except Exception as exc:
                log.exception("agent.run_failed", conversation_id=conversation_id)
                await session.rollback()
                apology = AIMessage(
                    content=(
                        "Sorry — I hit a problem on my side. A teammate has been notified and will "
                        "follow up by email shortly."
                    )
                )
                await _persist(session, conversation, [human, apology], started_at)
                await emit("error", {"message": f"{type(exc).__name__}: {exc}"})
                await emit("message", {"role": "assistant", "content": apology.content})
            lead = await ctx.lead()
            await emit(
                "done",
                {
                    "conversation_id": conversation_id,
                    "lead": lead_brief(lead, settings.qualified_score) if lead else None,
                },
            )

    async def runner() -> None:
        try:
            await work()
        finally:
            await queue.put(None)

    task = asyncio.create_task(runner())
    try:
        while (item := await queue.get()) is not None:
            yield item
    finally:
        await task


async def create_conversation(channel: str = "web_chat") -> str:
    async with SessionLocal() as session:
        conversation = Conversation(channel=channel, state={})
        session.add(conversation)
        await session.commit()
        return conversation.id


async def run_turn_collect(conversation_id: str, user_text: str, **kw: Any) -> dict[str, Any]:
    """Non-streaming helper: run a turn and return the reply, actions and lead."""
    replies: list[str] = []
    actions: list[dict[str, Any]] = []
    out: dict[str, Any] = {"conversation_id": conversation_id, "lead": None, "error": None}
    async for ev in run_turn(conversation_id, user_text, **kw):
        if ev["event"] == "message":
            replies.append(ev["data"]["content"])
        elif ev["event"] == "action_end":
            actions.append(ev["data"])
        elif ev["event"] == "error":
            out["error"] = ev["data"]["message"]
        elif ev["event"] == "done":
            out["lead"] = ev["data"]["lead"]
    out["reply"] = "\n\n".join(replies)
    out["actions"] = actions
    return out
