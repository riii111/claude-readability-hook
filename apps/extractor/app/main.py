from fastapi import FastAPI

app = FastAPI(title="Claude Readability Extractor", version="1.0.0")


@app.get("/health")
async def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
