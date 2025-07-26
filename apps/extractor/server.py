#!/usr/bin/env python3
import sys

sys.path.insert(0, "/app/deps")
import uvicorn

from app.main import app

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
