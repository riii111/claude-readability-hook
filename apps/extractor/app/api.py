import time

import anyio
from anyio import to_thread
from fastapi import APIRouter, Depends, HTTPException, status

from app.models import ExtractRequest, ExtractResponse, HealthResponse
from app.services.metrics import MetricsCollector
from app.services.score_calculator import ScoreCalculator
from app.services.trafilatura_extractor import TrafilaturaExtractor

router = APIRouter()
extractor = TrafilaturaExtractor()
score_calculator = ScoreCalculator()
extraction_semaphore = anyio.Semaphore(8)


def get_extractor() -> TrafilaturaExtractor:
    return extractor


def get_score_calculator() -> ScoreCalculator:
    return score_calculator


@router.post(
    "/extract",
    response_model=ExtractResponse,
    summary="Extract content from HTML",
    description="Extract clean text content from HTML using Trafilatura with quality scoring",
)
async def extract_content(
    request: ExtractRequest,
    extractor: TrafilaturaExtractor = Depends(get_extractor),
    score_calculator: ScoreCalculator = Depends(get_score_calculator),
) -> ExtractResponse:
    async with extraction_semaphore:
        start_time = time.time()
        result = await to_thread.run_sync(extractor.extract_content, request.html, str(request.url))
        duration_ms = (time.time() - start_time) * 1000

        if not result.success:
            MetricsCollector.track_extraction_attempt(success=False, duration_ms=duration_ms)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Content extraction failed: {result.error_message}",
            )

        title = result.title or ""
        text = result.text or ""
        score = score_calculator.calculate_score(result.title, text)

        MetricsCollector.track_extraction_attempt(success=True, duration_ms=duration_ms)
        MetricsCollector.track_extraction_score(score)

        return ExtractResponse(title=title, text=text, score=score, success=True)


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Service health check",
    description="Check if extraction service and Trafilatura library are available",
)
async def health_check() -> HealthResponse:
    trafilatura_available = extractor.is_available()
    service_status = "healthy" if trafilatura_available else "unhealthy"

    return HealthResponse(status=service_status, trafilatura_available=trafilatura_available)
