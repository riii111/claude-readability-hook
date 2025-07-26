from anyio import to_thread
from fastapi import APIRouter, Depends, HTTPException, status

from app.models import ExtractRequest, ExtractResponse, HealthResponse
from app.services.score_calculator import ScoreCalculator
from app.services.trafilatura_extractor import TrafilaturaExtractor

router = APIRouter()
extractor = TrafilaturaExtractor()
score_calculator = ScoreCalculator()


def get_extractor() -> TrafilaturaExtractor:
    return extractor


def get_score_calculator() -> ScoreCalculator:
    return score_calculator


@router.post("/extract", response_model=ExtractResponse)
async def extract_content(
    request: ExtractRequest,
    extractor: TrafilaturaExtractor = Depends(get_extractor),
    score_calculator: ScoreCalculator = Depends(get_score_calculator),
) -> ExtractResponse:
    # Trafilatura は同期実装のため、イベントループをブロックしないようスレッドにオフロード
    result = await to_thread.run_sync(extractor.extract_content, request.html, str(request.url))

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Content extraction failed: {result.error_message}",
        )

    title = result.title or ""
    text = result.text or ""
    score = score_calculator.calculate_score(result.title, text)

    return ExtractResponse(title=title, text=text, score=score, success=True)


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    trafilatura_available = extractor.is_available()
    status = "healthy" if trafilatura_available else "unhealthy"

    return HealthResponse(status=status, trafilatura_available=trafilatura_available)
