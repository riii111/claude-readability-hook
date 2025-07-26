import math


class ScoreCalculator:
    TEXT_LENGTH_WEIGHT = 0.8
    WORD_COUNT_WEIGHT = 0.2
    TITLE_BONUS = 5

    @classmethod
    def calculate_score(cls, title: str | None, text: str) -> float:
        if not text:
            return 0.0

        length = len(text)
        words = text.split()
        word_count = len(words)

        # logarithmic scaling to avoid unbounded growth
        text_length_score = math.log10(length + 1) * cls.TEXT_LENGTH_WEIGHT
        word_count_score = math.log10(word_count + 1) * cls.WORD_COUNT_WEIGHT
        title_bonus = cls.TITLE_BONUS if title else 0

        return text_length_score + word_count_score + title_bonus
