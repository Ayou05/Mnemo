from fastapi import APIRouter
from app.api import auth, tasks, memory, courses, schedule, ai, import_cards, system

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["认证"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["任务管理"])
api_router.include_router(import_cards.router, prefix="/memory", tags=["卡片导入"])
api_router.include_router(memory.router, prefix="/memory", tags=["记忆训练"])
api_router.include_router(courses.router, prefix="/courses", tags=["听课助手"])
api_router.include_router(schedule.router, prefix="/schedule", tags=["课表管理"])
api_router.include_router(ai.router, prefix="/ai", tags=["AI 服务"])
api_router.include_router(system.router, prefix="/system", tags=["系统能力"])
