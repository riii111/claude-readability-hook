import pytest

from app.services.score_calculator import ScoreCalculator


@pytest.mark.parametrize("length1,length2", [(0, 1), (199, 200), (999, 1000)])
def test_score_monotonic_in_text_length_boundary_pairs(length1, length2):
    s1 = ScoreCalculator.calculate_score(None, "x" * length1)
    s2 = ScoreCalculator.calculate_score(None, "x" * length2)
    assert s2 >= s1

@pytest.mark.parametrize(
    "title,text,expected_min,expected_max",
    [
        (None, "", 0.0, 0.0),
        (None, "a", 0.0, 1.0),
        ("T", "a", 5.0, 6.0),
        # longer text increases log-scaled components
        (None, "x" * 100, 1.0, 5.0),
        ("Title", "word " * 100, 5.0, 10.0),
    ],
)
def test_calculate_score_ranges(title, text, expected_min, expected_max):
    score = ScoreCalculator.calculate_score(title, text)
    assert expected_min <= score <= expected_max


def test_calculate_score_monotonic_with_length():
    text_short = "x" * 10
    text_long = "x" * 1000
    s1 = ScoreCalculator.calculate_score(None, text_short)
    s2 = ScoreCalculator.calculate_score(None, text_long)
    assert s2 > s1


def test_title_bonus_applied():
    text = "hello world"
    no_title = ScoreCalculator.calculate_score(None, text)
    with_title = ScoreCalculator.calculate_score("Title", text)
    assert pytest.approx(with_title - no_title, rel=0.01) == ScoreCalculator.TITLE_BONUS
