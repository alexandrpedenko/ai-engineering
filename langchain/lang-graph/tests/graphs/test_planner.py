from tripgraph.domain.models import TripBrief
from tripgraph.domain.rules import PROBLEMS
from tripgraph.graphs.planner import build_planner, plan
from tripgraph.nodes import route_after_validate

COMPLETE = TripBrief(
    cities=["Lisbon", "Porto"],
    start="2026-10-10",
    end="2026-10-15",
    budget=900,
    interests=["food", "museums"],
)
NO_DATES = COMPLETE.model_copy(update={"start": None, "end": None})


def test_route_goes_to_confirm_only_when_nothing_is_missing():
    assert route_after_validate({"missing": []}) == "confirm_brief"
    assert route_after_validate({"missing": ["budget"]}) == "ask_for_clarification"


def test_complete_brief_gets_the_night_split():
    result = plan(build_planner(), COMPLETE.model_dump_json())

    assert result.state["missing"] == []
    assert result.reply.splitlines() == [
        "Lisbon: 10–13 Oct (3 nights)",
        "Porto: 13–15 Oct (2 nights)",
        "Budget: €900 for 5 nights, 1 traveller.",
    ]


def test_brief_without_dates_asks_for_both_dates():
    result = plan(build_planner(), NO_DATES.model_dump_json())

    assert result.state["missing"] == ["start", "end"]
    assert result.reply.splitlines() == [PROBLEMS["start"], PROBLEMS["end"]]


def test_text_that_is_not_json_asks_for_everything():
    result = plan(build_planner(), "Lisbon and Porto next week")

    asked = result.reply.splitlines()
    for problem in ["cities", "start", "end", "budget"]:
        assert PROBLEMS[problem] in asked


def test_stay_across_a_month_end_names_both_months():
    brief = COMPLETE.model_copy(update={"start": "2026-10-30", "end": "2026-11-04"})

    result = plan(build_planner(), brief.model_dump_json())

    assert result.reply.splitlines()[:2] == [
        "Lisbon: 30 Oct–2 Nov (3 nights)",
        "Porto: 2–4 Nov (2 nights)",
    ]


def test_each_turn_gets_its_own_thread_unless_one_is_given():
    graph = build_planner()

    first = plan(graph, "{}")
    second = plan(graph, "{}")
    named = plan(graph, "{}", thread_id="trip-1")

    assert first.thread_id != second.thread_id
    assert named.thread_id == "trip-1"
    assert first.interrupt is None
