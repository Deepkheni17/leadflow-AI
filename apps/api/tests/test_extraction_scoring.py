from leadflow.services.extraction import extract_all, extract_budget, extract_timeline
from leadflow.services.scoring import score_lead


def test_budget_parsing():
    assert extract_budget("Budget around $25k.") == 25_000
    assert extract_budget("We can spend 15,000 USD") == 15_000
    assert extract_budget("We have 250 employees. Budget is 40k USD.") == 40_000
    assert extract_budget("We're 40 people") is None
    assert extract_budget("No budget set yet") is None


def test_timeline_parsing():
    assert extract_timeline("want it live within 3 weeks") == ("Within 3 weeks", 21)
    assert extract_timeline("ASAP please")[1] == 7
    assert extract_timeline("maybe next year")[1] == 365


def test_extract_all_combined():
    fields = extract_all("I'm the COO so it's my call. We're about 40 people, live within 3 weeks.")
    assert fields["authority"] == "decision_maker"
    assert fields["company_size"] == 40
    assert fields["timeline_days"] == 21
    assert "budget_usd" not in fields


def test_scoring_hot_and_cold():
    hot = score_lead(
        requirement="AI agent to qualify leads and book demos in our CRM",
        budget_usd=25_000,
        timeline_days=21,
        authority="decision_maker",
        company_size=40,
    )
    assert hot.score == 97 and hot.grade == "hot"
    cold = score_lead(
        requirement="just curious",
        budget_usd=300,
        timeline_days=365,
        authority=None,
        company_size=1,
    )
    assert cold.score < 40 and cold.grade == "cold"


def test_authority_titles():
    from leadflow.services.extraction import extract_authority

    assert extract_authority("I'm the managing partner.") == "decision_maker"
    assert extract_authority("I'm the CMO but the CEO signs off.") == "influencer"
    assert extract_authority("My CEO decides but I'll present the recommendation.") == "influencer"
    assert extract_authority("I'm head of sales and it's my call.") == "decision_maker"
