"""Exercise the LLM branch of the graph with a scripted fake chat model (no network)."""

import pytest
from langchain_core.messages import AIMessage, SystemMessage

from leadflow.agent import graph
from leadflow.agent.runner import create_conversation, run_turn_collect
from leadflow.config import Settings

aio = pytest.mark.asyncio(loop_scope="session")


class ScriptedModel:
    """Stands in for ChatAnthropic.bind_tools(...): replays a fixed list of AIMessages."""

    def __init__(self, script):
        self.script = list(script)
        self.calls = []

    def bind_tools(self, tools):
        self.tool_names = [t.name for t in tools]
        return self

    async def ainvoke(self, messages):
        self.calls.append(messages)
        return self.script.pop(0)


def _tc(name, args, i):
    return {"name": name, "args": args, "id": f"toolu_{i}", "type": "tool_call"}


@aio
async def test_llm_drives_tools(monkeypatch):
    model = ScriptedModel(
        [
            AIMessage(
                content="", tool_calls=[_tc("search_customer", {"query": "llm@example.com"}, 1)]
            ),
            AIMessage(
                content="",
                tool_calls=[
                    _tc(
                        "create_lead",
                        {
                            "name": "Lee Lim",
                            "email": "llm@example.com",
                            "requirement": "AI chatbot for sales",
                        },
                        2,
                    )
                ],
            ),
            AIMessage(content="Thanks Lee! What's your budget?"),
        ]
    )
    monkeypatch.setattr(graph, "_llm", lambda *a, **k: model)
    settings = Settings(anthropic_api_key="test-key")

    cid = await create_conversation()
    r = await run_turn_collect(
        cid, "Hi, I'm Lee (llm@example.com)", settings=settings, use_llm=True
    )

    assert [a["tool"] for a in r["actions"]] == ["search_customer", "create_lead"]
    assert r["reply"] == "Thanks Lee! What's your budget?"
    assert r["lead"]["email"] == "llm@example.com"
    assert set(model.tool_names) == {
        "search_customer",
        "create_lead",
        "update_lead",
        "check_calendar",
        "book_meeting",
        "send_email",
    }
    first_prompt = model.calls[0]
    assert isinstance(first_prompt[0], SystemMessage) and "<context>" in first_prompt[0].content
    # Tool results are fed back to the model on the next step.
    assert first_prompt[-1].content.startswith("Hi, I'm Lee")
    assert model.calls[1][-1].type == "tool"


@aio
async def test_llm_failure_falls_back_to_builtin(monkeypatch):
    class Broken:
        def bind_tools(self, tools):
            return self

        async def ainvoke(self, messages):
            raise RuntimeError("network down")

    monkeypatch.setattr(graph, "_llm", lambda *a, **k: Broken())
    cid = await create_conversation()
    r = await run_turn_collect(
        cid, "Hello there", settings=Settings(anthropic_api_key="k"), use_llm=True
    )
    assert r["error"] is None
    assert "work email" in r["reply"]


def test_provider_selection():
    assert Settings(anthropic_api_key="a", gemini_api_key="g").llm_brain == "claude"
    assert Settings(anthropic_api_key="", gemini_api_key="g").llm_brain == "gemini"
    assert (
        Settings(anthropic_api_key="a", gemini_api_key="g", llm_provider="gemini").llm_brain
        == "gemini"
    )
    assert Settings(anthropic_api_key="a", llm_provider="none").llm_brain is None
    assert Settings(gemini_api_key="g").llm_model == Settings().gemini_model


@aio
async def test_gemini_is_wired_into_the_graph(monkeypatch):
    seen = {}
    model = ScriptedModel([AIMessage(content="Hi from Gemini! What's your work email?")])

    def fake_llm(brain, api_key, *rest):
        seen.update(brain=brain, key=api_key)
        return model

    monkeypatch.setattr(graph, "_llm", fake_llm)
    settings = Settings(anthropic_api_key="", gemini_api_key="gem-key")
    cid = await create_conversation()
    r = await run_turn_collect(cid, "Hello", settings=settings, use_llm=True)
    assert seen == {"brain": "gemini", "key": "gem-key"}
    assert r["reply"] == "Hi from Gemini! What's your work email?"


def test_gemini_model_accepts_our_tool_schemas():
    """Binding converts every tool schema to Gemini's format (no network call)."""
    from unittest.mock import MagicMock

    from langchain_google_genai import ChatGoogleGenerativeAI

    from leadflow.agent.context import RunContext

    graph._llm.cache_clear()
    llm = graph._llm("gemini", "fake-key", "gemini-3.5-flash", 1024, "")
    assert isinstance(llm, ChatGoogleGenerativeAI)
    ctx = RunContext(session=MagicMock(), settings=Settings(), conversation=MagicMock())
    try:
        bound = llm.bind_tools(graph.build_tools(ctx))
        assert bound.kwargs["tools"]
    finally:
        graph._llm.cache_clear()


@aio
async def test_rate_limit_pauses_llm(monkeypatch):
    calls = {"n": 0}

    class RateLimited:
        def bind_tools(self, tools):
            return self

        async def ainvoke(self, messages):
            calls["n"] += 1
            raise RuntimeError("429 RESOURCE_EXHAUSTED. Please retry in 20.5s.")

    monkeypatch.setattr(graph, "_llm", lambda *a, **k: RateLimited())
    monkeypatch.setattr(graph, "_cooldown_until", 0.0)
    settings = Settings(anthropic_api_key="", gemini_api_key="k")

    cid = await create_conversation()
    r = await run_turn_collect(
        cid, "Hi, I'm Ana (ana@example.com)", settings=settings, use_llm=True
    )
    assert calls["n"] == 2  # main model + fallback model, then built-in for the rest
    assert r["error"] is None and r["lead"]["email"] == "ana@example.com"
    assert graph._cooldown_until > 0

    await run_turn_collect(cid, "We're 12 people", settings=settings, use_llm=True)
    assert calls["n"] == 2  # still cooling down: no new LLM call


@aio
async def test_gemini_fallback_model_used_when_main_overloaded(monkeypatch):
    used = []

    class Model:
        def __init__(self, name):
            self.name = name

        def bind_tools(self, tools):
            return self

        async def ainvoke(self, messages):
            used.append(self.name)
            if self.name == "main-model":
                raise RuntimeError("503 UNAVAILABLE: high demand")
            return AIMessage(content=f"answered by {self.name}")

    monkeypatch.setattr(graph, "_llm", lambda brain, key, model, *rest: Model(model))
    monkeypatch.setattr(graph, "_cooldown_until", 0.0)
    settings = Settings(
        anthropic_api_key="", gemini_api_key="k",
        gemini_model="main-model", gemini_fallback_model="backup-model",
    )  # fmt: skip
    r = await run_turn_collect(
        await create_conversation(), "Hello", settings=settings, use_llm=True
    )
    assert used == ["main-model", "backup-model"]
    assert r["reply"] == "answered by backup-model"
    assert graph._cooldown_until == 0.0  # fallback succeeded, no pause


def test_rate_limit_delay_parsing():
    assert graph._rate_limit_delay(RuntimeError("429 ... retry in 20.5s")) == 20.5
    assert graph._rate_limit_delay(RuntimeError("RESOURCE_EXHAUSTED")) == 30.0
    assert graph._rate_limit_delay(RuntimeError("401 bad key")) is None


def test_overload_backs_off_briefly():
    err = RuntimeError("503 UNAVAILABLE. This model is currently experiencing high demand.")
    assert graph._rate_limit_delay(err) == 15.0
