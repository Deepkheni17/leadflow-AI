"""FastAPI application entrypoint.

Serves the JSON/SSE API under /api and, when it has been built, the React dashboard at /.
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from leadflow.api.routes import router
from leadflow.config import get_settings
from leadflow.db import init_db

settings = get_settings()

logging.basicConfig(level=settings.log_level.upper(), format="%(message)s")
structlog.configure(
    wrapper_class=structlog.make_filtering_bound_logger(
        logging.getLevelName(settings.log_level.upper())
    ),
)
log = structlog.get_logger("leadflow")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    await init_db()
    if settings.seed_demo_data:
        from leadflow.seed import seed_if_empty

        await seed_if_empty()
    log.info(
        "leadflow.ready",
        agent_brain="claude" if settings.llm_enabled else "built-in",
        model=settings.anthropic_model if settings.llm_enabled else None,
        dashboard=settings.web_dist.exists(),
    )
    yield


app = FastAPI(
    title="LeadFlow AI",
    description="Agentic lead qualification & appointment booking API",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)

if (settings.web_dist / "index.html").exists():
    dist = settings.web_dist.resolve()
    if (dist / "assets").exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str) -> FileResponse:
        if path.startswith("api/"):
            raise HTTPException(404)
        candidate = (dist / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(dist):
            return FileResponse(candidate)
        return FileResponse(dist / "index.html")


def run() -> None:
    uvicorn.run(
        "leadflow.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.reload,
        log_level=settings.log_level,
    )


if __name__ == "__main__":
    run()
