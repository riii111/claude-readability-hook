import pytest


@pytest.mark.asyncio
async def test_health(async_client):
    r = await async_client.get("/health")
    assert r.status_code == 200
    data = r.json()
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
    r = await async_client.post("/extract", json=payload)
    assert r.status_code == 200
    data = r.json()
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
    r = await async_client.post("/extract", json=payload)
    assert r.status_code == 422
    body = r.json()
    assert body["detail"].startswith("Content extraction failed:")


@pytest.mark.asyncio
async def test_extract_validation_422(async_client):
    # empty html rejected by model
    payload = {"html": "", "url": "https://example.com"}
    r = await async_client.post("/extract", json=payload)
    assert r.status_code == 422
    problem = r.json()
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
    r = await async_client.post("/extract", json=payload)
    assert r.status_code == 422
    detail = r.json()["detail"]
    assert detail[0]["loc"][-1] == "html"


@pytest.mark.asyncio
async def test_health_unhealthy(monkeypatch, async_client):
    # Force extractor availability to False
    import app.api as api

    monkeypatch.setattr(api.extractor, "is_available", lambda: False)

    r = await async_client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "unhealthy"
    assert data["trafilatura_available"] is False
