from fastapi import FastAPI
from fastapi.responses import ORJSONResponse, Response

from app.api import router
from app.services.metrics import get_metrics

app = FastAPI(
    title="Claude Readability Extractor",
    version="1.0.0",
    description="Content extraction service using Trafilatura",
    default_response_class=ORJSONResponse,
)

app.include_router(router)


@app.get("/metrics", response_class=Response)
async def metrics():
    return Response(content=get_metrics(), media_type="text/plain")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
