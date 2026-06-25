"""FastAPI アプリ本体。設計書 §8 / §9。"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import __version__
from .bootstrap import init_db
from .config import get_settings
from .routers import (
    assets,
    audits,
    auth,
    dashboard,
    labels,
    loans,
    maintenance,
    masters,
    reports,
    settings as settings_router,
    users,
)

settings = get_settings()

API_PREFIX = "/api/v1"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Karidasu API",
    version=__version__,
    description="備品・資産 貸出/管理システム — QRをかざすだけの貸出/返却・棚卸",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# エラー形式を設計書 §9.1 の { "error": { code, message } } に統一。
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    detail = exc.detail
    if isinstance(detail, dict) and "code" in detail:
        body = {"error": detail}
    else:
        body = {"error": {"code": "HTTP_ERROR", "message": str(detail)}}
    return JSONResponse(status_code=exc.status_code, content=body, headers=getattr(exc, "headers", None))


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "VALIDATION_ERROR", "message": "入力値が不正です", "details": exc.errors()}},
    )


# ヘルスチェック（設計書 §12）。
@app.get("/healthz", tags=["health"])
def healthz():
    return {"status": "ok"}


@app.get("/readyz", tags=["health"])
def readyz():
    from sqlalchemy import text

    from .db import engine

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ready"}
    except Exception:
        return JSONResponse(status_code=503, content={"status": "not-ready"})


# ルーター登録。
for r in (auth, users, assets, loans, masters, maintenance, audits, labels, reports, dashboard, settings_router):
    app.include_router(r.router, prefix=API_PREFIX)
