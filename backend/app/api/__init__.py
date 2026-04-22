from fastapi import APIRouter

api_router = APIRouter()


def _register_routes():
    from app.api.auth import router as auth_router
    from app.api.tasks import router as tasks_router
    from app.api.memory import router as memory_router
    from app.api.courses import router as courses_router
    from app.api.schedule import router as schedule_router
    from app.api.ai import router as ai_router
    from app.api.import_cards import router as import_cards_router
    from app.api.system import router as system_router
    from app.api.plan_template import plan_router
    from app.api.schedule_import import import_router
    from app.api.practice import router as practice_router

    api_router.include_router(auth_router, prefix="/auth", tags=["认证"])
    api_router.include_router(tasks_router, prefix="/tasks", tags=["任务管理"])
    api_router.include_router(plan_router, prefix="/tasks", tags=["计划模板"])
    api_router.include_router(import_cards_router, prefix="/memory", tags=["卡片导入"])
    api_router.include_router(memory_router, prefix="/memory", tags=["记忆训练"])
    api_router.include_router(practice_router, prefix="/practice", tags=["练习助手"])
    api_router.include_router(courses_router, prefix="/courses", tags=["听课助手"])
    api_router.include_router(schedule_router, prefix="/schedule", tags=["课表管理"])
    api_router.include_router(import_router, prefix="/schedule", tags=["课表导入"])
    api_router.include_router(ai_router, prefix="/ai", tags=["AI 服务"])
    api_router.include_router(system_router, prefix="/system", tags=["系统能力"])


_register_routes()
