from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram, generate_latest

registry = CollectorRegistry()

extraction_attempts_total = Counter(
    "extractor_extraction_attempts_total",
    "Total number of content extraction attempts",
    ["success"],
    registry=registry,
)

extraction_duration_seconds = Histogram(
    "extractor_extraction_duration_seconds",
    "Content extraction duration in seconds",
    buckets=[0.1, 0.5, 1, 2, 5, 10, 30],
    registry=registry,
)

extraction_score = Histogram(
    "extractor_extraction_score",
    "Distribution of extraction scores",
    buckets=[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 500, 1000],
    registry=registry,
)


fallback_requests_total = Counter(
    "extractor_fallback_requests_total",
    "Total number of fallback requests to readability service",
    registry=registry,
)

readability_fallback_duration_seconds = Histogram(
    "extractor_readability_fallback_duration_seconds",
    "Readability fallback request duration in seconds",
    buckets=[0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    registry=registry,
)


class MetricsCollector:
    @classmethod
    def track_extraction_attempt(cls, success: bool, duration_ms: float) -> None:
        extraction_attempts_total.labels(success=str(success).lower()).inc()
        extraction_duration_seconds.observe(duration_ms / 1000)

    @classmethod
    def track_extraction_score(cls, score: float) -> None:
        extraction_score.observe(score)

    @classmethod
    def track_fallback_request(cls, duration_ms: float) -> None:
        fallback_requests_total.inc()
        readability_fallback_duration_seconds.observe(duration_ms / 1000)


def get_metrics() -> bytes:
    return generate_latest(registry)
