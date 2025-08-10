import pytest

from app.services.trafilatura_extractor import TrafilaturaExtractor

HTML_SIMPLE = """
<!doctype html>
<html>
  <head><title>Example Title</title></head>
  <body>
    <article>
      <h1>Example Title</h1>
      <p>Hello world. This is a sample content.</p>
    </article>
  </body>
</html>
""".strip()


@pytest.fixture(autouse=True)
def _ensure_tables_on(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("INCLUDE_TABLES", "true")


def test_is_available_cached(monkeypatch: pytest.MonkeyPatch):
    import trafilatura

    calls = {"count": 0}

    def fake_extract(_html, *_args, **_kwargs):
        calls["count"] += 1
        return "ok"

    monkeypatch.setattr(trafilatura, "extract", fake_extract)

    extractor = TrafilaturaExtractor()
    assert extractor.is_available() is True
    assert extractor.is_available() is True
    assert calls["count"] == 1  # cached after first


def test_extract_content_success(monkeypatch: pytest.MonkeyPatch):
    import trafilatura

    def fake_extract_metadata(_html, default_url=None):  # noqa: ARG001
        class Meta:
            title = "Example Title"

        return Meta()

    def fake_extract(_html, *_args, **kwargs):
        # include_tables flag should be propagated from env
        assert kwargs.get("include_tables") is True
        return "  Hello world. This is a sample content.  "

    monkeypatch.setattr(trafilatura, "extract_metadata", fake_extract_metadata)
    monkeypatch.setattr(trafilatura, "extract", fake_extract)

    extractor = TrafilaturaExtractor()
    res = extractor.extract_content(HTML_SIMPLE, "https://example.com")

    assert res.success is True
    assert res.title == "Example Title"
    assert res.text and res.text.endswith("content.")
    # ensure strip is applied
    assert res.text == res.text.strip()


def test_extract_content_empty_returns_error(monkeypatch: pytest.MonkeyPatch):
    import trafilatura

    monkeypatch.setattr(trafilatura, "extract_metadata", lambda *_a, **_k: None)
    monkeypatch.setattr(trafilatura, "extract", lambda *_a, **_k: None)

    extractor = TrafilaturaExtractor()
    res = extractor.extract_content("<html></html>", "https://example.com")

    assert res.success is False
    assert "failed" in (res.error_message or "").lower()


def test_extract_content_exception_path(monkeypatch: pytest.MonkeyPatch):
    import trafilatura

    def boom(*_a, **_k):
        raise RuntimeError("boom")

    monkeypatch.setattr(trafilatura, "extract", boom)

    extractor = TrafilaturaExtractor()
    res = extractor.extract_content("<html></html>", "https://example.com")

    assert res.success is False
    assert "error" in (res.error_message or "").lower()
