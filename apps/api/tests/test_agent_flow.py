import pytest

from leadflow.agent.policy import format_form
from leadflow.agent.runner import create_conversation, run_turn_collect

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_qualified_lead_gets_booked():
    cid = await create_conversation()
    r = await run_turn_collect(
        cid,
        format_form(
            name="Priya Shah",
            email="priya+test@northwind.io",
            company="Northwind",
            message="We want an AI agent that qualifies inbound leads and books demos. Budget around $25k.",
        ),
    )
    assert [a["tool"] for a in r["actions"]] == ["search_customer", "create_lead", "update_lead"]
    assert r["lead"]["budget_usd"] == 25_000
    assert "?" in r["reply"]

    r = await run_turn_collect(
        cid, "I'm the COO so it's my call. We're 40 people, live within 3 weeks."
    )
    assert [a["tool"] for a in r["actions"]] == ["update_lead", "check_calendar"]
    assert r["lead"]["qualified"] is True
    assert "1." in r["reply"]

    r = await run_turn_collect(cid, "2")
    assert [a["tool"] for a in r["actions"]] == ["book_meeting", "send_email", "update_lead"]
    assert r["lead"]["status"] == "booked"
    assert "booked" in r["reply"]


async def test_poor_fit_goes_to_nurture():
    cid = await create_conversation()
    await run_turn_collect(
        cid,
        format_form(
            name="Tom Lee",
            email="tom+test@example.com",
            message="Just exploring chatbots, maybe next year.",
        ),
    )
    await run_turn_collect(cid, "It's just me, budget maybe $500")
    r = await run_turn_collect(cid, "yes")
    tools = [a["tool"] for a in r["actions"]]
    assert "send_email" in tools
    assert r["lead"]["status"] == "nurture"


async def test_existing_customer_is_not_duplicated():
    form = format_form(
        name="Repeat Person", email="repeat@example.com", message="We need an AI chatbot for sales."
    )
    first = await run_turn_collect(await create_conversation(), form)
    second = await run_turn_collect(await create_conversation(), form)
    assert first["lead"]["lead_id"] == second["lead"]["lead_id"]
    search = second["actions"][0]
    assert search["tool"] == "search_customer" and search["output"]["found"] is True
