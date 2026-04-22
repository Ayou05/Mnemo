import json
from datetime import datetime, date, timedelta
import io
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, and_, cast, Date, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.response import ApiResponse
from app.core.security import decode_access_token, oauth2_scheme
from app.models.models import Task, TaskCategory, DailyCheckin, TaskPlanTemplate, TaskPlanEntry
from app.schemas.schemas import (
    TaskCreate, TaskUpdate, TaskOut,
    TaskCategoryCreate, TaskCategoryUpdate, TaskCategoryOut,
    DailyCheckinCreate, DailyCheckinOut,
)



router = APIRouter()


async def get_current_user_id(token: str = Depends(oauth2_scheme)) -> str:
    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="无效的认证")
    return user_id


@router.post("/categories", status_code=201)
async def create_category(
    body: TaskCategoryCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    cat = TaskCategory(user_id=user_id, **body.model_dump())
    db.add(cat)
    await db.flush()
    await db.refresh(cat)
    return ApiResponse.success(data=TaskCategoryOut.model_validate(cat).model_dump())


@router.get("/categories")
async def list_categories(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TaskCategory).where(TaskCategory.user_id == user_id)
            .order_by(TaskCategory.sort_order, TaskCategory.created_at)
    )
    cats = result.scalars().all()
    return ApiResponse.success(data=[TaskCategoryOut.model_validate(c).model_dump() for c in cats])


@router.put("/categories/{cat_id}")
async def update_category(
    cat_id: str,
    body: TaskCategoryUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TaskCategory).where(and_(TaskCategory.id == cat_id, TaskCategory.user_id == user_id))
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(cat, k, v)
    await db.flush()
    await db.refresh(cat)
    return ApiResponse.success(data=TaskCategoryOut.model_validate(cat).model_dump())


@router.delete("/categories/{cat_id}")
async def delete_category(
    cat_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TaskCategory).where(and_(TaskCategory.id == cat_id, TaskCategory.user_id == user_id))
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")
    # Reset tasks in this category to "其他"
    tasks = (await db.execute(
        select(Task).where(and_(Task.user_id == user_id, Task.category == cat.name))
    )).scalars().all()
    for t in tasks:
        t.category = "其他"
    await db.delete(cat)
    return ApiResponse.success(message="已删除")


# ═══════════════════════════════════════
# Tasks CRUD
# ═══════════════════════════════════════

@router.post("/", status_code=201)
async def create_task(
    body: TaskCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    task = Task(
        user_id=user_id,
        title=body.title,
        description=body.description,
        priority=body.priority,
        status=body.status,
        category=body.category,
        due_date=body.due_date,
        estimated_time=body.estimated_time,
        tags=json.dumps(body.tags) if body.tags else None,
        subtasks=json.dumps([s.model_dump() for s in body.subtasks]) if body.subtasks else None,
        is_pinned=body.is_pinned,
    )
    db.add(task)
    await db.flush()
    await db.refresh(task)
    return ApiResponse.success(data=TaskOut.model_validate(task).model_dump())


@router.get("/")
async def list_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    status: str | None = Query(None, pattern="^(pending|in_progress|completed)$"),
    category: str | None = None,
    priority: str | None = Query(None, pattern="^(high|medium|low)$"),
    search: str | None = None,
    sort_by: str = Query("created_at", pattern="^(created_at|due_date|priority|updated_at)$"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    query = select(Task).where(Task.user_id == user_id)
    count_query = select(func.count()).select_from(Task).where(Task.user_id == user_id)

    if status:
        query = query.where(Task.status == status)
        count_query = count_query.where(Task.status == status)
    if category:
        query = query.where(Task.category == category)
        count_query = count_query.where(Task.category == category)
    if priority:
        query = query.where(Task.priority == priority)
        count_query = count_query.where(Task.priority == priority)
    if search:
        search_filter = Task.title.ilike(f"%{search}%")
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    # Pinned first, then sort
    if sort_by == "priority":
        col = case(
            (Task.priority == "high", 1),
            (Task.priority == "medium", 2),
            else_=3,
        )
    else:
        col = getattr(Task, sort_by)

    order_col = col.asc() if sort_order == "asc" else col.desc()
    query = query.order_by(Task.is_pinned.desc(), order_col.nullslast())

    total = (await db.execute(count_query)).scalar()
    tasks = (await db.execute(
        query.offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()

    return ApiResponse.success(data={
        "items": [TaskOut.model_validate(t).model_dump() for t in tasks],
        "total": total,
        "page": page,
        "page_size": page_size,
    })


@router.get("/today")
async def get_today_tasks(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    result = await db.execute(
        select(Task).where(
            and_(
                Task.user_id == user_id,
                Task.status != "completed",
            )
        ).order_by(
            Task.is_pinned.desc(),
            case(
                (Task.priority == "high", 1),
                (Task.priority == "medium", 2),
                else_=3,
            ),
            Task.due_date.asc().nullslast(),
        )
    )
    tasks = result.scalars().all()
    # Separate overdue
    today_tasks = []
    overdue_tasks = []
    for t in tasks:
        if t.due_date and t.due_date.date() < today:
            overdue_tasks.append(TaskOut.model_validate(t).model_dump())
        else:
            today_tasks.append(TaskOut.model_validate(t).model_dump())

    return ApiResponse.success(data={"today": today_tasks, "overdue": overdue_tasks})


@router.get("/stats")
async def get_task_stats(
    days: int = Query(30, ge=1, le=365),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.utcnow()
    today = date.today()
    week_start = today - timedelta(days=today.weekday())

    # Overall stats
    total = (await db.execute(
        select(func.count()).select_from(Task).where(Task.user_id == user_id)
    )).scalar()

    completed = (await db.execute(
        select(func.count()).select_from(Task).where(
            and_(Task.user_id == user_id, Task.status == "completed")
        )
    )).scalar()

    pending = (await db.execute(
        select(func.count()).select_from(Task).where(
            and_(Task.user_id == user_id, Task.status == "pending")
        )
    )).scalar()

    in_progress = (await db.execute(
        select(func.count()).select_from(Task).where(
            and_(Task.user_id == user_id, Task.status == "in_progress")
        )
    )).scalar()

    # Category distribution
    cat_result = await db.execute(
        select(Task.category, func.count().label("cnt"))
        .where(Task.user_id == user_id)
        .group_by(Task.category)
        .order_by(func.count().desc())
    )
    categories = [{"name": row[0], "count": row[1]} for row in cat_result.all()]
    category_distribution = {row["name"]: row["count"] for row in categories}

    # Overdue count
    overdue = (await db.execute(
        select(func.count()).select_from(Task).where(
            and_(
                Task.user_id == user_id,
                Task.status != "completed",
                Task.due_date.isnot(None),
                Task.due_date < now,
            )
        )
    )).scalar()

    # Completed counts for today / this week
    today_start = datetime.combine(today, datetime.min.time())
    today_end = datetime.combine(today, datetime.max.time())
    week_start_dt = datetime.combine(week_start, datetime.min.time())
    week_end_dt = datetime.combine(today, datetime.max.time())

    today_completed = (await db.execute(
        select(func.count()).select_from(Task).where(
            and_(
                Task.user_id == user_id,
                Task.status == "completed",
                Task.completed_at.isnot(None),
                Task.completed_at >= today_start,
                Task.completed_at <= today_end,
            )
        )
    )).scalar()

    week_completed = (await db.execute(
        select(func.count()).select_from(Task).where(
            and_(
                Task.user_id == user_id,
                Task.status == "completed",
                Task.completed_at.isnot(None),
                Task.completed_at >= week_start_dt,
                Task.completed_at <= week_end_dt,
            )
        )
    )).scalar()

    # Daily completion for last N days
    since = date.today() - timedelta(days=days)
    daily_result = await db.execute(
        select(
            cast(Task.completed_at, Date).label("day"),
            func.count().label("cnt"),
        ).where(
            and_(
                Task.user_id == user_id,
                Task.status == "completed",
                Task.completed_at.isnot(None),
                Task.completed_at >= datetime.combine(since, datetime.min.time()),
            )
        ).group_by(cast(Task.completed_at, Date))
        .order_by(cast(Task.completed_at, Date))
    )
    daily = {str(row[0]): row[1] for row in daily_result.all()}
    daily_completion = [{"date": k, "count": v} for k, v in daily.items()]

    # Streak calculation
    checkin_result = await db.execute(
        select(DailyCheckin.checkin_date)
        .where(
            and_(
                DailyCheckin.user_id == user_id,
                DailyCheckin.tasks_completed > 0,
            )
        )
        .order_by(DailyCheckin.checkin_date.desc())
        .limit(365)
    )
    dates = sorted([row[0] for row in checkin_result.all()], reverse=True)
    streak = 0
    if dates:
        check_date = date.today()
        for d_str in dates:
            d = date.fromisoformat(d_str)
            if d == check_date:
                streak += 1
                check_date -= timedelta(days=1)
            elif d < check_date:
                break

    return ApiResponse.success(data={
        "total": total,
        "completed": completed,
        "pending": pending,
        "in_progress": in_progress,
        "overdue": overdue,
        "completion_rate": round(completed / total * 100, 1) if total > 0 else 0,
        "categories": categories,
        "category_distribution": category_distribution,
        "daily_completion": daily_completion,
        "today_completed": today_completed,
        "week_completed": week_completed,
        "streak": streak,
    })


# ═══════════════════════════════════════
# Daily Checkin
# ═══════════════════════════════════════

@router.post("/checkin", status_code=201)
async def create_or_update_checkin(
    body: DailyCheckinCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DailyCheckin).where(
            and_(DailyCheckin.user_id == user_id, DailyCheckin.checkin_date == body.checkin_date)
        )
    )
    checkin = result.scalar_one_or_none()
    if checkin:
        checkin.tasks_completed = body.tasks_completed
        checkin.cards_reviewed = body.cards_reviewed
        checkin.study_minutes = body.study_minutes
        checkin.notes_count = body.notes_count
    else:
        checkin = DailyCheckin(user_id=user_id, **body.model_dump())
        db.add(checkin)
    await db.flush()
    await db.refresh(checkin)
    return ApiResponse.success(data=DailyCheckinOut.model_validate(checkin).model_dump())


@router.get("/checkin")
async def get_checkins(
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DailyCheckin).where(
            and_(
                DailyCheckin.user_id == user_id,
                DailyCheckin.checkin_date.startswith(month),
            )
        ).order_by(DailyCheckin.checkin_date)
    )
    checkins = result.scalars().all()
    return ApiResponse.success(data=[DailyCheckinOut.model_validate(c).model_dump() for c in checkins])


@router.get("/{task_id}")
async def get_task(
    task_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Task).where(and_(Task.id == task_id, Task.user_id == user_id)))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    return ApiResponse.success(data=TaskOut.model_validate(task).model_dump())


@router.put("/{task_id}")
async def update_task(
    task_id: str,
    body: TaskUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Task).where(and_(Task.id == task_id, Task.user_id == user_id)))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    update_data = body.model_dump(exclude_unset=True)
    if "tags" in update_data and update_data["tags"] is not None:
        update_data["tags"] = json.dumps(update_data["tags"])
    if "subtasks" in update_data and update_data["subtasks"] is not None:
        update_data["subtasks"] = json.dumps([s if isinstance(s, dict) else s.model_dump() for s in update_data["subtasks"]])

    if update_data.get("status") == "completed" and task.status != "completed":
        update_data["completed_at"] = datetime.utcnow()

    for key, value in update_data.items():
        setattr(task, key, value)

    await db.flush()
    await db.refresh(task)
    return ApiResponse.success(data=TaskOut.model_validate(task).model_dump())


@router.delete("/{task_id}")
async def delete_task(
    task_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Task).where(and_(Task.id == task_id, Task.user_id == user_id)))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    await db.delete(task)
    return ApiResponse.success(message="已删除")
