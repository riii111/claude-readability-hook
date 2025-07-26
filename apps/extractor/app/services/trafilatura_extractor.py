import os

import trafilatura

from app.models import ExtractResult


class TrafilaturaExtractor:
    def __init__(self):
        self.config = trafilatura.settings.use_config()
        self.config.set("DEFAULT", "EXTRACTION_TIMEOUT", "30")
        self._availability_cached = None
        self.include_tables = os.getenv("INCLUDE_TABLES", "true").lower() == "true"

    def extract_content(self, html: str, url: str) -> ExtractResult:
        try:
            metadata = trafilatura.extract_metadata(html, default_url=url)
            extracted = trafilatura.extract(
                html,
                url=url,
                config=self.config,
                include_comments=False,
                include_tables=self.include_tables,
                include_formatting=False,
                favor_precision=True,
                favor_recall=False,
            )

            if not extracted:
                return ExtractResult(
                    success=False,
                    error_message="Trafilatura failed to extract content",
                )

            title = metadata.title if metadata and metadata.title else None

            return ExtractResult(title=title, text=extracted.strip(), success=True)

        except Exception as e:
            return ExtractResult(
                success=False,
                error_message=f"Trafilatura extraction error: {e!s}",
            )

    def is_available(self) -> bool:
        if self._availability_cached is None:
            try:
                trafilatura.extract("<html><body>test</body></html>")
                self._availability_cached = True
            except Exception:
                self._availability_cached = False
        return self._availability_cached
