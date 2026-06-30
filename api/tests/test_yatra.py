"""Tests for the Yatra registration/operational agent.

Covers: entity extraction merging, registration-node advancement (incl.
skipping already-filled nodes), and a full mocked registration flow end
to end through the LangGraph graph.
"""

import json
from unittest.mock import AsyncMock

import pytest

from agents import yatra
from agents.yatra import YatraNode


class FakeAIResponse:
    def __init__(self, content: str):
        self.content = content


class FakeLLM:
    """Stands in for the ChatAnthropic client. langchain models are pydantic
    objects that reject ad-hoc attribute assignment, so swapping the whole
    `yatra.llm` module binding (rather than patching `.ainvoke` on the real
    instance) is the only way to mock it.
    """

    def __init__(self, content: str = ""):
        self.content = content
        self.ainvoke = AsyncMock(return_value=FakeAIResponse(content))


@pytest.fixture(autouse=True)
def _patch_backends(monkeypatch, fake_supabase):
    monkeypatch.setattr(yatra, "get_admin_supabase", lambda: fake_supabase)
    monkeypatch.setattr(yatra, "queue_ntb_verification", AsyncMock(return_value="job-id"))
    monkeypatch.setattr(yatra, "generate_guide_embedding", AsyncMock(return_value=None))
    monkeypatch.setattr(yatra, "llm", FakeLLM())
    return fake_supabase


def _mock_extraction(monkeypatch, payload: dict):
    monkeypatch.setattr(yatra, "llm", FakeLLM(json.dumps(payload)))


# --- Entity extraction ----------------------------------------------------


async def test_extract_fields_merges_non_destructively(monkeypatch):
    _mock_extraction(monkeypatch, {"name": "Pemba Sherpa", "location": None})
    current = {"location": "Pokhara"}

    merged = await yatra.extract_fields("My name is Pemba Sherpa", current)

    assert merged["name"] == "Pemba Sherpa"
    assert merged["location"] == "Pokhara"  # null in extraction doesn't erase existing value


async def test_extract_fields_dedupes_list_fields(monkeypatch):
    _mock_extraction(monkeypatch, {"languages": ["English", "Nepali"]})
    current = {"languages": ["Nepali", "Hindi"]}

    merged = await yatra.extract_fields("I also speak English", current)

    assert merged["languages"] == ["Nepali", "Hindi", "English"]


async def test_extract_fields_handles_invalid_json(monkeypatch):
    monkeypatch.setattr(yatra.llm, "ainvoke", AsyncMock(return_value=FakeAIResponse("not json")))
    current = {"name": "Pemba Sherpa"}

    merged = await yatra.extract_fields("garbled response", current)

    assert merged == current


# --- Node advancement -------------------------------------------------------


def test_next_unfilled_node_starts_at_name():
    assert yatra.next_unfilled_node({}) == YatraNode.NAME


def test_next_unfilled_node_skips_filled_fields():
    fields = {"name": "Pemba", "location": "Pokhara", "experience_years": 8}
    assert yatra.next_unfilled_node(fields) == YatraNode.SPECIALIZATIONS


def test_certifications_node_requires_both_subfields():
    fields = {"taan_member": True}
    assert not yatra.node_is_complete(YatraNode.CERTIFICATIONS, fields)

    fields["first_aid_certified"] = False
    assert yatra.node_is_complete(YatraNode.CERTIFICATIONS, fields)


def test_registration_progress_counts_completed_nodes():
    fields = {"name": "Pemba", "location": "Pokhara"}
    done, total = yatra.registration_progress(fields)
    assert done == 2
    assert total == len(yatra.REGISTRATION_NODES)


# --- Full mocked registration flow -----------------------------------------


async def test_full_registration_flow(monkeypatch, fake_supabase):
    guide_id = "guide-1"
    session_id = "session-1"
    fake_supabase.tables["guides"] = [{"id": guide_id, "is_available": True}]

    answers_to_fields = [
        ("My name is Pemba Sherpa", {"name": "Pemba Sherpa"}),
        ("I'm based in Pokhara", {"location": "Pokhara"}),
        ("8 years", {"experience_years": 8}),
        ("EBC and Annapurna Circuit", {"specializations": ["EBC", "Annapurna Circuit"]}),
        ("No NTB license yet", {"has_ntb_license": False}),
        ("Yes TAAN member, first aid certified", {"taan_member": True, "first_aid_certified": True}),
        ("English and Nepali", {"languages": ["English", "Nepali"]}),
        ("$45 per day", {"daily_rate_usd": 45}),
        ("+977-9800000000", {"phone": "+977-9800000000"}),
        ("https://example.com/photo.jpg", {"photo_url": "https://example.com/photo.jpg"}),
        ("Available March 1 to May 31", {"availability_start": "2026-03-01", "availability_end": "2026-05-31"}),
    ]

    await yatra.greet_guide(guide_id, session_id)

    result = None
    for message, extracted in answers_to_fields:
        _mock_extraction(monkeypatch, extracted)
        result = await yatra.chat_with_guide(guide_id, session_id, message)
        assert result["registration_complete"] is False

    assert result["current_node"] == YatraNode.CONFIRM.value

    result = await yatra.chat_with_guide(guide_id, session_id, "yes that's correct")

    assert result["registration_complete"] is True
    assert "Profile saved" in result["agent_actions"]

    saved_guide = fake_supabase.tables["guides"][0]
    assert saved_guide["name"] == "Pemba Sherpa"
    assert saved_guide["daily_rate_usd"] == 45


async def test_ntb_license_queues_verification_once(monkeypatch, fake_supabase):
    guide_id = "guide-2"
    session_id = "session-2"
    fake_supabase.tables["guides"] = [{"id": guide_id, "is_available": True}]

    _mock_extraction(monkeypatch, {"name": "Sonam Lama"})
    await yatra.chat_with_guide(guide_id, session_id, "I'm Sonam Lama")

    _mock_extraction(monkeypatch, {"location": "Kathmandu"})
    await yatra.chat_with_guide(guide_id, session_id, "Kathmandu")

    _mock_extraction(monkeypatch, {"experience_years": 5})
    await yatra.chat_with_guide(guide_id, session_id, "5 years")

    _mock_extraction(monkeypatch, {"specializations": ["EBC"]})
    await yatra.chat_with_guide(guide_id, session_id, "EBC")

    _mock_extraction(monkeypatch, {"ntb_license_number": "NTB-123456"})
    result = await yatra.chat_with_guide(guide_id, session_id, "My license is NTB-123456")

    assert "NTB license sent to verification queue" in result["agent_actions"]
    yatra.queue_ntb_verification.assert_awaited_once_with(guide_id, "NTB-123456")


# --- Operational phase -----------------------------------------------------


async def test_operational_availability_toggle(fake_supabase):
    guide_id = "guide-3"
    session_id = "session-3"
    fake_supabase.tables["guides"] = [{"id": guide_id, "is_available": True}]
    fake_supabase.tables["yatra_sessions"] = [
        {
            "session_id": session_id,
            "guide_id": guide_id,
            "current_node": YatraNode.OPERATIONAL.value,
            "registration_fields": {},
            "registration_complete": True,
            "message_history": [],
            "pending_verification": False,
        }
    ]

    result = await yatra.chat_with_guide(guide_id, session_id, "toggle my availability")

    assert "unavailable" in result["message"]
    assert fake_supabase.tables["guides"][0]["is_available"] is False
