import logging
import traceback
from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.response import ApiResponse

logger = logging.getLogger(__name__)


async def global_exception_handler(request: Request, exc: Exception):
    """全局异常处理器"""
    logger.error(f"Unhandled exception: {exc}\n{traceback.format_exc()}")

    return JSONResponse(
        status_code=500,
        content=ApiResponse.error(code=500, message="服务器内部错误，请稍后重试"),
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """HTTP 异常处理器"""
    return JSONResponse(
        status_code=exc.status_code,
        content=ApiResponse.error(code=exc.status_code, message=str(exc.detail)),
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """请求参数验证异常处理器"""
    errors = exc.errors()
    # 提取第一个错误信息
    first_error = errors[0] if errors else {}
    loc = " -> ".join(str(l) for l in first_error.get("loc", []) if l != "body")
    msg = first_error.get("msg", "参数验证失败")

    if loc:
        message = f"{loc}: {msg}"
    else:
        message = msg

    return JSONResponse(
        status_code=422,
        content=ApiResponse.error(code=422, message=message, data=errors),
    )
