from typing import Optional


class ScoreCalculator:
    TEXT_LENGTH_WEIGHT = 0.8
    WORD_COUNT_WEIGHT = 0.2
    TITLE_BONUS = 5

    @classmethod
    def calculate_score(cls, title: Optional[str], text: str) -> float:
        if not text:
            return 0.0

        text_length_score = len(text) * cls.TEXT_LENGTH_WEIGHT
        word_count_score = len(text.split()) * cls.WORD_COUNT_WEIGHT
        title_bonus = cls.TITLE_BONUS if title else 0

        return text_length_score + word_count_score + title_bonus