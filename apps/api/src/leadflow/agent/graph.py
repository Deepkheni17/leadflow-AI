"""LangGraph state machine: agent <-> tools loop with an audited tool executor.

    START -> agent --(tool calls?)--> tools -> agent -> ... -> END

The `agent` node is Claude (via langchain-anthropic) when an API key is configured, otherwise
the deterministic BuiltinPolicy. Both emit standard AIMessages with tool calls, so the rest of
the graph is identical.
"""

import json
import time
from functools import lru_cache
from typing import Annotated, Any, TypedDict

import structlog
from langchain_core.messages import AIMessage, AnyMessage, SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages

from leadflow.agent.context import RunContext
from leadflow.agent.policy import BuiltinPolicy
from leadflow.agent.prompts import build_system_prompt
from leadflow.agent.tools import build_tools, lead_brief
from leadflow.models import AgentAction

log = structlog.get_logger(__name__)


class AgentState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]


def _ctx(config: RunnableConfig) -> RunContext:
    return config["configurable"]["ctx"]


def _text(message: AIMessage) -> str:
    if isinstance(message.content, str):
        return message.content
    return "".join(
        block.get("text", "")
        for block in message.content
        if isinstance(block, dict) and block.get("type") == "text"
    )


@lru_cache(maxsize=4)
def _llm(api_key: str, base_url: str, model: str, max_tokens: int):
    from langchain_anthropic import ChatAnthropic

    return ChatAnthropic(
        model=model,
        max_tokens=max_tokens,
        anthropic_api_key=api_key,
        anthropic_api_url=base_url,
        max_retries=2,
        default_request_timeout=120,
    )


async def agent_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    ctx = _ctx(config)
    response: AIMessage | None = None

    if ctx.use_llm and ctx.settings.anthropic_api_key:
        lead = await ctx.lead()
        context = {
            "conversation_id": ctx.conversation.id,
            "lead": lead_brief(lead, ctx.settings.qualified_score) if lead else None,
            "agent_memory": ctx.conversation.state or {},
            "qualified_score_threshold": ctx.settings.qualified_score,
        }
        s = ctx.settings
        llm = _llm(s.anthropic_api_key, s.anthropic_base_url, s.anthropic_model, s.llm_max_tokens)
        model = llm.bind_tools(build_tools(ctx))
        try:
            response = await model.ainvoke(
                [SystemMessage(build_system_prompt(s, context)), *state["messages"]]
            )
        except Exception as exc:  # network/auth/rate-limit: keep the lead moving
            log.warning("agent.llm_failed_falling_back", error=str(exc)[:300])
            await ctx.emit("notice", {"message": "LLM unavailable — using built-in policy."})

    if response is None:
        response = await BuiltinPolicy().decide(ctx, state["messages"])

    if text := _text(response).strip():
        await ctx.emit("message", {"role": "assistant", "content": text})
    return {"messages": [response]}


async def tools_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    ctx = _ctx(config)
    tools = {t.name: t for t in build_tools(ctx)}
    last = state["messages"][-1]
    assert isinstance(last, AIMessage)
    results: list[ToolMessage] = []

    for call in last.tool_calls:
        name, args, call_id = call["name"], call.get("args", {}), call["id"]
        await ctx.emit("action_start", {"id": call_id, "tool": name, "input": args})
        started = time.perf_counter()
        status = "success"
        tool = tools.get(name)
        try:
            if tool is None:
                raise ValueError(f"Unknown tool '{name}'")
            output = await tool.ainvoke(args)
            if isinstance(output, dict) and output.get("error"):
                status = "error"
        except Exception as exc:  # validation or runtime error -> report back to the agent
            await ctx.session.rollback()
            await ctx.session.refresh(ctx.conversation)
            output, status = {"error": f"{type(exc).__name__}: {exc}"}, "error"
        duration = int((time.perf_counter() - started) * 1000)

        lead = await ctx.lead()
        ctx.session.add(
            AgentAction(
                conversation_id=ctx.conversation.id,
                lead_id=lead.id if lead else None,
                tool=name,
                input=json.loads(json.dumps(args, default=str)),
                output=json.loads(json.dumps(output, default=str)),
                status=status,
                duration_ms=duration,
            )
        )
        await ctx.session.commit()

        await ctx.emit(
            "action_end",
            {
                "id": call_id,
                "tool": name,
                "input": args,
                "output": output,
                "status": status,
                "duration_ms": duration,
            },
        )
        if lead:
            await ctx.emit("lead", lead_brief(lead, ctx.settings.qualified_score))
        results.append(
            ToolMessage(
                content=json.dumps(output, default=str),
                tool_call_id=call_id,
                name=name,
                status="error" if status == "error" else "success",
            )
        )
    return {"messages": results}


def route_after_agent(state: AgentState) -> str:
    last = state["messages"][-1]
    return "tools" if isinstance(last, AIMessage) and last.tool_calls else END


def build_graph():
    graph = StateGraph(AgentState)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", tools_node)
    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", route_after_agent, {"tools": "tools", END: END})
    graph.add_edge("tools", "agent")
    return graph.compile()


lead_agent = build_graph()
