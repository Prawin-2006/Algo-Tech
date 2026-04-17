import logging

from fastapi import FastAPI

from .db import init_db
from .routers.permissions import router as permission_router


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)

# Ensure DB schema exists for both runtime and test contexts.
init_db()

app = FastAPI(title="Guardian Permission API", version="1.0.0")
app.include_router(permission_router)


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
