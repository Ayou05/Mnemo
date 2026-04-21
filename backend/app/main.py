import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.exceptions import RequestValidationError

from app.core.config import get_settings
from app.core.database import engine, Base
from app.core.response import ApiResponse
from app.core.exceptions import (
    global_exception_handler,
    http_exception_handler,
    validation_exception_handler,
)
from app.api import api_router

settings = get_settings()

# Configure logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables
    if settings.AUTO_CREATE_TABLES:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    else:
        logger.info("AUTO_CREATE_TABLES disabled; expect Alembic migrations.")
    logger.info(f"{settings.APP_NAME} v{settings.APP_VERSION} started")
    yield
    # Shutdown
    await engine.dispose()
    logger.info("Application shutdown")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Global exception handlers
app.add_exception_handler(Exception, global_exception_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(api_router, prefix=settings.API_PREFIX)


@app.get("/")
async def root():
    return ApiResponse.success(data={
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
    })


@app.get("/health")
async def health():
    return ApiResponse.success(data={"status": "ok"})
