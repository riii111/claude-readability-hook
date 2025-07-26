from fastapi import APIRouter, HTTPException
from app.models import ExtractRequest, ExtractResponse, HealthResponse
from app.services.trafilatura_extractor import TrafilaturaExtractor
from app.services.score_calculator import ScoreCalculator

router = APIRouter()
extractor = TrafilaturaExtractor()
score_calculator = ScoreCalculator()


@router.post("/extract", response_model=ExtractResponse)
async def extract_content(request: ExtractRequest) -> ExtractResponse:
    if not request.html.strip():
        raise HTTPException(status_code=400, detail="HTML content cannot be empty")
    
    if not request.url.strip():
        raise HTTPException(status_code=400, detail="URL cannot be empty")

    result = extractor.extract_content(request.html, request.url)
    
    if not result.success:
        raise HTTPException(
            status_code=422, 
            detail=f"Content extraction failed: {result.error_message}"
        )

    title = result.title or ""
    text = result.text or ""
    score = score_calculator.calculate_score(result.title, text)

    return ExtractResponse(
        title=title,
        text=text,
        score=score,
        success=True
    )


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    trafilatura_available = extractor.is_available()
    status = "healthy" if trafilatura_available else "unhealthy"
    
    return HealthResponse(
        status=status,
        trafilatura_available=trafilatura_available
    )