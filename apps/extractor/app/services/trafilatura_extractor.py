import trafilatura

from app.models import ExtractResult


class TrafilaturaExtractor:
    def __init__(self):
        self.config = trafilatura.settings.use_config()
        self.config.set("DEFAULT", "EXTRACTION_TIMEOUT", "30")

    def extract_content(self, html: str, url: str) -> ExtractResult:
        try:
            extracted = trafilatura.extract(
                html,
                url=url,
                config=self.config,
                include_comments=False,
                include_tables=True,
                include_formatting=False,
                favor_precision=True,
                favor_recall=False,
            )

            if not extracted:
                return ExtractResult(
                    success=False, error_message="Trafilatura failed to extract content"
                )

            title = self._extract_title(html, url)

            return ExtractResult(title=title, text=extracted.strip(), success=True)

        except Exception as e:
            return ExtractResult(
                success=False, error_message=f"Trafilatura extraction error: {e!s}"
            )

    def _extract_title(self, html: str, url: str) -> str | None:
        try:
            metadata = trafilatura.extract_metadata(html, default_url=url)
            return metadata.title if metadata and metadata.title else None
        except Exception:
            return None

    def is_available(self) -> bool:
        try:
            trafilatura.extract("<html><body>test</body></html>")
            return True
        except Exception:
            return False
