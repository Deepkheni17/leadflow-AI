"""Exercise the LLM branch of the graph with a scripted fake chat model (no network)."""

import pytest
from langchain_core.messages import AIMessage, SystemMessage

from leadflow.agent import graph
from leadflow.agent.runner import create_conversation, run_turn_collect
from leadflow.config import Settings

pytestmark = pytest.mark.asyncio(loop_scope="session")


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
