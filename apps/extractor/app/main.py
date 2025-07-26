from fastapi import FastAPI
from fastapi.responses import ORJSONResponse

from app.api import router

app = FastAPI(
    title="Claude Readability Extractor",
    version="1.0.0",
    description="Content extraction service using Trafilatura",
    default_response_class=ORJSONResponse,
)

app.include_router(router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
