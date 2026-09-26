"""Demo data: realistic leads pushed through the real agent, then back-dated.

Every seeded record is produced by the actual LangGraph agent and tools (using the built-in
policy so seeding is free and deterministic), so the dashboard reflects genuine agent runs.
"""

import random
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog
from sqlalchemy import func, select

from leadflow.agent.policy import format_form
from leadflow.agent.runner import create_conversation, run_turn_collect
from leadflow.db import SessionLocal
from leadflow.models import AgentAction, Conversation, Email, Lead, Message

log = structlog.get_logger(__name__)

PERSONAS: list[dict[str, Any]] = [
    {
        "days": 13,
        "name": "Priya Shah",
        "email": "priya@northwind.io",
        "company": "Northwind Logistics",
        "message": "Hi, we want an AI agent that qualifies inbound leads and books demos into our CRM (HubSpot). Budget around $25k.",
        "replies": [
            "I'm the COO so it's my call. We're about 40 people and want it live within 3 weeks.",
            "2",
        ],
    },
    {
        "days": 12,
        "name": "Marcus Chen",
        "email": "marcus@heliodental.com",
        "company": "Helio Dental Group",
        "message": "We run 12 dental clinics and miss lots of appointment requests after hours. We need an AI assistant that books appointments automatically.",
        "replies": [
            "Budget is about $18k and I'm the operations director, I sign off.",
            "We have about 120 staff. Ideally within a month.",
            "1",
        ],
    },
    {
        "days": 11,
        "name": "Sofia Alvarez",
        "email": "sofia@brightpathrealty.com",
        "company": "Brightpath Realty",
        "message": "Looking for a chatbot to qualify property buyers on our website and push them into our CRM.",
        "replies": [
            "$8,000 budget, need it within 6 weeks",
            "I'm the owner. 15 agents.",
            "the second one works",
        ],
    },
    {
        "days": 10,
        "name": "Tom Lee",
        "email": "tom.lee@fastmail.com",
        "company": None,
        "message": "Just exploring chatbots, maybe next year.",
        "replies": ["It's just me, budget maybe $500", "yes"],
    },
    {
        "days": 9,
        "name": "Aisha Karim",
        "email": "aisha@lumenhealth.co",
        "company": "Lumen Health",
        "message": "We want to automate patient intake follow-ups with an AI agent. Budget ~$30k.",
        "replies": [],
    },
    {
        "days": 9,
        "name": "Daniel Weber",
        "email": "d.weber@kraftwerk-tools.de",
        "company": "Kraftwerk Tools GmbH",
        "message": "We need an AI sales assistant to follow up on trade-show leads in German and English.",
        "replies": [
            "We have 250 employees. Budget is 40k USD.",
            "My CEO decides but I'll present the recommendation. Timeline this quarter.",
        ],
    },
    {
        "days": 8,
        "name": "Hannah Okafor",
        "email": "hannah@bloomandco.shop",
        "company": "Bloom & Co Florists",
        "message": "Could AI help answer customer questions on our site?",
        "replies": [
            "It's me and two part-timers, 3 people. Budget maybe $1,500.",
            "No rush, later this year. And yes, I'm the owner.",
        ],
    },
    {
        "days": 7,
        "name": "Kenji Watanabe",
        "email": "kenji@sakuratravel.jp",
        "company": "Sakura Travel",
        "message": "We want to automate booking consultations and lead follow-up for our travel agency.",
        "replies": ["Budget $12k, want it in 2 months", "I'm the founder, team of 25", "3"],
    },
    {
        "days": 6,
        "name": "Olivia Bennett",
        "email": "olivia.b@crestline.io",
        "company": "Crestline SaaS",
        "message": "Hi, I'm researching AI SDR tools for my manager.",
        "replies": ["No budget set yet. We're 60 people. Probably next quarter."],
    },
    {
        "days": 5,
        "name": "Rahul Mehta",
        "email": "rahul@finedgeadvisors.com",
        "company": "FinEdge Advisors",
        "message": "We need an AI assistant to qualify inbound leads for our wealth advisory firm and schedule calls.",
        "replies": [
            "We're 35 people, I'm the managing partner so I decide. Budget $50k, ASAP.",
            "1",
        ],
    },
    {
        "days": 4,
        "name": "Emma Larsson",
        "email": "emma@nordicfitness.se",
        "company": "Nordic Fitness",
        "message": "We want a chatbot that handles class booking questions and sales follow-ups.",
        "replies": [
            "Budget around 10k, 3 months.",
            "I'm the CMO but the CEO signs off. 80 staff.",
            "Do you have anything next week in the afternoon?",
        ],
    },
    {
        "days": 3,
        "name": "Lucas Moreau",
        "email": "lucas@atelier-moreau.fr",
        "company": "Atelier Moreau",
        "message": "We need a CRM integration for our design studio.",
        "replies": [],
    },
    {
        "days": 2,
        "name": "Grace Kim",
        "email": "grace@summitlegal.com",
        "company": "Summit Legal",
        "message": "We're looking to automate client intake and appointment scheduling at our law firm.",
        "replies": ["Budget is $22k. 45 people. Within a month. I'm the managing partner.", "4"],
    },
    {
        "days": 1,
        "name": "Ben Carter",
        "email": "ben@carterplumbing.com",
        "company": "Carter Plumbing",
        "message": "Can your AI answer calls for my plumbing business?",
        "replies": ["Just me, $300 budget, sometime next year", "yes"],
    },
    {
        "days": 1,
        "name": "Nina Petrova",
        "email": "nina@orbitanalytics.io",
        "company": "Orbit Analytics",
        "message": "We're looking for an AI agent to do lead qualification + booking for our SaaS demos. ~$15k budget.",
        "replies": [
            "Within 3 weeks. We're 30 people, I'm head of sales and it's my call.",
            "the first one",
        ],
    },
    {
        "days": 0,
        "name": "Omar Haddad",
        "email": "omar@desertrosehotels.ae",
        "company": "Desert Rose Hotels",
        "message": "We want an AI concierge to handle booking inquiries and upsell guests.",
        "replies": ["We have 300 staff across 4 hotels. Budget 60k."],
    },
]

SIMULATION_POOL: list[dict[str, Any]] = [
    {
        "company": "Harbor Insurance",
        "message": "We want an AI agent that qualifies quote requests and books calls with our brokers. Budget ~$20k.",
        "replies": ["I'm the VP of sales and it's my call. 70 people. Within a month.", "1"],
    },
    {
        "company": "Pixel Forge Games",
        "message": "Looking for a support chatbot that can also capture sales leads.",
        "replies": ["Budget $9k, this quarter", "We're 22 people and I decide."],
    },
    {
        "company": "GreenLeaf Cafe",
        "message": "Could a chatbot take catering inquiries?",
        "replies": ["It's just me, maybe $800, no rush", "yes"],
    },
    {
        "company": "Apex Recruiting",
        "message": "We need an AI assistant to screen candidates and schedule interviews automatically. Budget 35k.",
        "replies": ["We're 55 people, I'm the founder. ASAP.", "2"],
    },
]
_FIRST = [
    "Ava",
    "Leo",
    "Maya",
    "Noah",
    "Zara",
    "Ethan",
    "Isla",
    "Arjun",
    "Chloe",
    "Mateo",
    "Lina",
    "Oscar",
]
_LAST = ["Nguyen", "Patel", "Rossi", "Silva", "Novak", "Haas", "Ibrahim", "Costa", "Park", "Walsh"]


async def _run_persona(p: dict[str, Any]) -> dict[str, Any]:
    cid = await create_conversation()
    result = await run_turn_collect(
        cid,
        format_form(
            name=p["name"], email=p["email"], company=p.get("company"), message=p["message"]
        ),
        use_llm=False,
    )
    for reply in p.get("replies", []):
        result = await run_turn_collect(cid, reply, use_llm=False)
    return result


async def _backdate(conversation_id: str, days: int, rng: random.Random) -> None:
    """Shift a conversation's records back in time, preserving their relative spacing."""
    async with SessionLocal() as s:
        conv = await s.get(Conversation, conversation_id)
        if conv is None:
            return
        target = datetime.now(UTC) - timedelta(
            days=days, hours=rng.randint(1, 9), minutes=rng.randint(0, 59)
        )
        delta = target - conv.created_at
        conv.created_at += delta
        conv.updated_at += delta
        for model in (Message, AgentAction):
            for row in (
                await s.execute(select(model).where(model.conversation_id == conversation_id))
            ).scalars():
                row.created_at += delta
        if conv.lead_id:
            lead = await s.get(Lead, conv.lead_id)
            if lead:
                lead.created_at += delta
                lead.updated_at = conv.updated_at + timedelta(minutes=3)
            for e in (
                await s.execute(select(Email).where(Email.lead_id == conv.lead_id))
            ).scalars():
                e.created_at += delta
        await s.commit()


async def seed_if_empty() -> bool:
    async with SessionLocal() as s:
        if (await s.execute(select(func.count(Lead.id)))).scalar_one() > 0:
            return False
    rng = random.Random(7)
    log.info("seed.start", personas=len(PERSONAS))
    for p in PERSONAS:
        result = await _run_persona(p)
        await _backdate(result["conversation_id"], p["days"], rng)
    log.info("seed.done")
    return True


async def simulate_one() -> dict[str, Any]:
    rng = random.Random()
    template = rng.choice(SIMULATION_POOL)
    first, last = rng.choice(_FIRST), rng.choice(_LAST)
    domain = template["company"].lower().replace(" ", "") + ".com"
    persona = {
        **template,
        "name": f"{first} {last}",
        "email": f"{first.lower()}.{last.lower()}.{uuid.uuid4().hex[:4]}@{domain}",
    }
    return await _run_persona(persona)
