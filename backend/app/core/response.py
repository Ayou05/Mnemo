from typing import Any, Optional
from datetime import datetime

from pydantic import BaseModel


class ApiResponse(BaseModel):
    """统一 API 响应格式"""
    code: int = 0
    message: str = "ok"
    data: Any = None

    @staticmethod
    def success(data: Any = None, message: str = "ok") -> dict:
        return {"code": 0, "message": message, "data": data}

    @staticmethod
    def error(code: int = -1, message: str = "error", data: Any = None) -> dict:
        return {"code": code, "message": message, "data": data}


class PaginatedData(BaseModel):
    """分页数据"""
    items: list = []
    total: int = 0
    page: int = 1
    page_size: int = 20
    total_pages: int = 1
