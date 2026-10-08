import pytest

from tripgraph.domain.models import TripBrief
from tripgraph.domain.rules import missing_fields, nights, split_nights

COMPLETE = TripBrief(
    cities=["Lisbon", "Porto"],
    start="2026-10-10",
    end="2026-10-15",
    budget=900,
    interests=["food", "museums"],
)


def brief(**changes) -> TripBrief:
    return COMPLETE.model_copy(update=changes)


def test_complete_brief_has_no_problems():
    assert missing_fields(COMPLETE) == []


@pytest.mark.parametrize(
    "changes, expected",
    [
        ({"cities": []}, ["cities"]),
        ({"start": None}, ["start"]),
        ({"end": None}, ["end"]),
        ({"budget": None}, ["budget"]),
        ({"budget": 0}, ["budget"]),
        ({"start": None, "end": None}, ["start", "end"]),
    ],
)
def test_each_missing_field_is_reported(changes, expected):
    assert missing_fields(brief(**changes)) == expected


def test_a_date_that_is_not_iso_counts_as_missing():
    assert missing_fields(brief(start="next Friday")) == ["start"]
    assert missing_fields(brief(end="2026-13-01")) == ["end"]


def test_end_before_start():
    assert missing_fields(brief(end="2026-10-09")) == ["dates_order"]
    assert missing_fields(brief(end="2026-10-10")) == ["dates_order"]


def test_fewer_nights_than_cities():
    three_cities = brief(cities=["Lisbon", "Porto", "Madrid"], end="2026-10-12")
    assert missing_fields(three_cities) == ["too_few_nights"]


def test_nights():
    assert nights(COMPLETE) == 5


def test_five_nights_two_cities():
    assert split_nights(COMPLETE) == [
        ("Lisbon", "2026-10-10", "2026-10-13"),
        ("Porto", "2026-10-13", "2026-10-15"),
    ]


@pytest.mark.parametrize(
    "cities, end, expected_nights",
    [
        (["Lisbon", "Porto", "Madrid"], "2026-10-16", [2, 2, 2]),
        (["Lisbon", "Porto", "Madrid"], "2026-10-17", [3, 2, 2]),
        (["Lisbon"], "2026-10-14", [4]),
    ],
)
def test_leftover_nights_go_to_the_first_cities(cities, end, expected_nights):
    stays = split_nights(brief(cities=cities, end=end))
    assert [nights(brief(start=check_in, end=check_out)) for _, check_in, check_out in stays] == expected_nights


def test_stays_join_up_from_start_to_end():
    trip = brief(cities=["Lisbon", "Porto", "Madrid"], end="2026-10-17")
    stays = split_nights(trip)
    assert stays[0][1] == trip.start
    assert stays[-1][2] == trip.end
    for (_, _, check_out), (_, check_in, _) in zip(stays, stays[1:]):
        assert check_out == check_in
