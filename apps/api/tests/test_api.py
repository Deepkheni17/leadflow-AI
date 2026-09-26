import httpx
import pytest

from leadflow.main import app

pytestmark = pytest.mark.asyncio(loop_scope="session")


@pytest.fixture
def client():
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


async def test_health(client):
    r = await client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["agent_brain"] == "built-in"


async def test_inbound_then_dashboard(client):
    r = await client.post(
        "/api/inbound",
        json={
            "name": "Grace Kim",
            "email": "grace+api@summitlegal.com",
            "company": "Summit Legal",
            "message": "We're looking to automate client intake and appointment scheduling. Budget $22k.",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    cid = body["conversation_id"]
    assert body["lead"]["company"] == "Summit Legal"

    r = await client.post(
        f"/api/conversations/{cid}/messages",
        json={"content": "45 people, within a month, I'm the managing partner."},
    )
    assert r.status_code == 200
    assert any(a["tool"] == "check_calendar" for a in r.json()["actions"])

    detail = (await client.get(f"/api/conversations/{cid}")).json()
    assert detail["lead"]["email"] == "grace+api@summitlegal.com"
    assert len(detail["messages"]) == 4
    assert len(detail["actions"]) >= 4

    dash = (await client.get("/api/dashboard")).json()
    assert dash["kpis"]["leads"] >= 1
    assert len(dash["series"]) == 14
    assert (await client.get("/api/leads?sort=score")).status_code == 200
    assert (await client.get("/api/actions")).status_code == 200


async def test_stream_endpoint_emits_events(client):
    async with client.stream(
        "POST",
        "/api/inbound/stream",
        json={
            "name": "Nina Petrova",
            "email": "nina+sse@orbit.io",
            "message": "We need an AI agent for lead qualification. ~$15k budget.",
        },
    ) as r:
        assert r.status_code == 200
        text = "".join([chunk async for chunk in r.aiter_text()])
    for event in ("conversation", "action_start", "action_end", "message", "done"):
        assert f"event: {event}" in text


async def test_validation_error(client):
    r = await client.post(
        "/api/inbound", json={"name": "x", "email": "not-an-email", "message": "hi there"}
    )
    assert r.status_code == 422
