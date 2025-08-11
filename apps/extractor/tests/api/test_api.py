import re

import pytest


@pytest.mark.asyncio
async def test_health(async_client):
    res = await async_client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert set(data.keys()) == {"status", "trafilatura_available"}


@pytest.mark.asyncio
async def test_extract_success(monkeypatch, async_client):
    # Patch extractor to return deterministic values
    from app.services.trafilatura_extractor import TrafilaturaExtractor

    def fake_extract_content(_self, _html, _url):
        from app.models import ExtractResult

        return ExtractResult(title="T", text="hello world " * 50, success=True)

    monkeypatch.setattr(TrafilaturaExtractor, "extract_content", fake_extract_content)

    payload = {"html": "<html><body>ok</body></html>", "url": "https://example.com/x"}
    res = await async_client.post("/extract", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert set(data.keys()) == {"title", "text", "score", "success"}
    assert data["title"] == "T"
    assert data["success"] is True
    assert data["score"] > 0


@pytest.mark.asyncio
async def test_extract_failure_bubbles_422(monkeypatch, async_client):
    from app.services.trafilatura_extractor import TrafilaturaExtractor

    def fake_extract_content(_self, _html, _url):
        from app.models import ExtractResult

        return ExtractResult(success=False, error_message="nope")

    monkeypatch.setattr(TrafilaturaExtractor, "extract_content", fake_extract_content)

    payload = {"html": "<html></html>", "url": "https://example.com"}
    res = await async_client.post("/extract", json=payload)
    assert res.status_code == 422
    body = res.json()
    assert body["detail"].startswith("Content extraction failed:")


@pytest.mark.asyncio
async def test_extract_validation_422(async_client):
    # empty html rejected by model
    payload = {"html": "", "url": "https://example.com"}
    res = await async_client.post("/extract", json=payload)
    assert res.status_code == 422
    problem = res.json()
    assert problem["detail"][0]["loc"][-1] == "html"


@pytest.mark.asyncio
async def test_metrics_exposed(async_client):
    # touch endpoints to generate some metrics
    await async_client.get("/health")
    res = await async_client.get("/metrics")
    assert res.status_code == 200
    assert "extractor_extraction_attempts_total" in res.text
    assert "extractor_extraction_duration_seconds" in res.text
    assert "extractor_extraction_score" in res.text


@pytest.mark.asyncio
async def test_extract_whitespace_only_html_rejected(async_client):
    payload = {"html": "   \n  \t  ", "url": "https://example.com"}
    res = await async_client.post("/extract", json=payload)
    assert res.status_code == 422
    detail = res.json()["detail"]
    assert detail[0]["loc"][-1] == "html"


@pytest.mark.asyncio
async def test_health_unhealthy(monkeypatch, async_client):
    # Force extractor availability to False
    import app.api as api

    monkeypatch.setattr(api.extractor, "is_available", lambda: False)

    res = await async_client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "unhealthy"
    assert data["trafilatura_available"] is False


# helper to parse counter values from prometheus text format
def _counter(body: str, name: str, label: str) -> int:
    # Build regex without f-string to avoid brace escaping issues
    pattern = (
        r'^' + re.escape(name) + r'\{success="' + re.escape(label) + r'"\}\s+([0-9]+(?:\.[0-9]+)?)\s*$'
    )
    m = re.search(pattern, body, re.M)
    return int(float(m.group(1))) if m else 0


@pytest.mark.asyncio
async def test_metrics_increment_on_success(monkeypatch, async_client):
    from app.models import ExtractResult
    from app.services.trafilatura_extractor import TrafilaturaExtractor

    monkeypatch.setattr(
        TrafilaturaExtractor,
        "extract_content",
        lambda *_: ExtractResult(title="T", text="x" * 500, success=True),
    )

    before = await async_client.get("/metrics")
    b_true = _counter(before.text, "extractor_extraction_attempts_total", "true")

    await async_client.post("/extract", json={"html": "<h>x</h>", "url": "https://e.com"})

    after = await async_client.get("/metrics")
    a_true = _counter(after.text, "extractor_extraction_attempts_total", "true")
    assert a_true == b_true + 1


@pytest.mark.asyncio
async def test_extract_rejects_invalid_url(async_client):
    res = await async_client.post("/extract", json={"html": "<b>x</b>", "url": "not-a-url"})
    assert res.status_code == 422
    assert res.json()["detail"][0]["loc"][-1] == "url"
