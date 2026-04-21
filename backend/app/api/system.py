from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, or_, select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.response import ApiResponse
from app.core.security import decode_access_token, oauth2_scheme
from app.models.models import (
    Task,
    MemoryCard,
    CourseNote,
    Schedule,
    ScheduleEntry,
    TaskPlanTemplate,
    TaskPlanEntry,
)

router = APIRouter()


async def get_current_user_id(token: str = Depends(oauth2_scheme)) -> str:
    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="无效的认证")
    return user_id


@router.get("/search/global")
async def global_search(
    q: str = Query(..., min_length=1),
    limit: int = Query(8, ge=1, le=30),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    keyword = f"%{q.strip()}%"
    tasks = (
        await db.execute(
            select(Task)
            .where(
                and_(
                    Task.user_id == user_id,
                    or_(Task.title.ilike(keyword), Task.description.ilike(keyword)),
                )
            )
            .order_by(Task.updated_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    cards = (
        await db.execute(
            select(MemoryCard)
            .where(
                and_(
                    MemoryCard.user_id == user_id,
                    or_(MemoryCard.source_text.ilike(keyword), MemoryCard.target_text.ilike(keyword)),
                )
            )
            .order_by(MemoryCard.updated_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    notes = (
        await db.execute(
            select(CourseNote)
            .where(
                and_(
                    CourseNote.user_id == user_id,
                    or_(
                        CourseNote.title.ilike(keyword),
                        CourseNote.summary.ilike(keyword),
                        CourseNote.cleaned_text.ilike(keyword),
                    ),
                )
            )
            .order_by(CourseNote.updated_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    schedule_rows = (
        await db.execute(
            select(ScheduleEntry, Schedule)
            .join(Schedule, ScheduleEntry.schedule_id == Schedule.id)
            .where(
                and_(
                    Schedule.user_id == user_id,
                    or_(
                        ScheduleEntry.course_name.ilike(keyword),
                        ScheduleEntry.teacher.ilike(keyword),
                        ScheduleEntry.location.ilike(keyword),
                    ),
                )
            )
            .limit(limit)
        )
    ).all()
    return ApiResponse.success(
        data={
            "tasks": [{"id": t.id, "title": t.title, "type": "task"} for t in tasks],
            "memory_cards": [{"id": c.id, "title": c.source_text, "subtitle": c.target_text, "type": "memory"} for c in cards],
            "course_notes": [{"id": n.id, "title": n.title, "type": "note"} for n in notes],
            "schedule_entries": [
                {
                    "id": e.id,
                    "title": e.course_name,
                    "subtitle": f"周{e.day_of_week} {e.start_time}-{e.end_time}",
                    "type": "schedule",
                }
                for e, _ in schedule_rows
            ],
        }
    )


@router.get("/data/export/all")
async def export_all_data(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    tasks = (await db.execute(select(Task).where(Task.user_id == user_id))).scalars().all()
    cards = (await db.execute(select(MemoryCard).where(MemoryCard.user_id == user_id))).scalars().all()
    notes = (await db.execute(select(CourseNote).where(CourseNote.user_id == user_id))).scalars().all()
    schedules = (await db.execute(select(Schedule).where(Schedule.user_id == user_id))).scalars().all()
    schedule_entries = (
        await db.execute(
            select(ScheduleEntry, Schedule)
            .join(Schedule, ScheduleEntry.schedule_id == Schedule.id)
            .where(Schedule.user_id == user_id)
        )
    ).all()
    templates = (await db.execute(select(TaskPlanTemplate).where(TaskPlanTemplate.user_id == user_id))).scalars().all()
    template_entries = (
        await db.execute(
            select(TaskPlanEntry, TaskPlanTemplate)
            .join(TaskPlanTemplate, TaskPlanEntry.template_id == TaskPlanTemplate.id)
            .where(TaskPlanTemplate.user_id == user_id)
        )
    ).all()

    payload = {
        "exported_at": datetime.utcnow().isoformat(),
        "version": "v1",
        "tasks": [{"id": t.id, "title": t.title, "status": t.status, "due_date": t.due_date.isoformat() if t.due_date else None} for t in tasks],
        "memory_cards": [{"id": c.id, "source_text": c.source_text, "target_text": c.target_text, "domain": c.domain} for c in cards],
        "course_notes": [{"id": n.id, "title": n.title, "course_name": n.course_name} for n in notes],
        "schedules": [{"id": s.id, "name": s.name, "is_active": s.is_active} for s in schedules],
        "schedule_entries": [
            {"id": e.id, "schedule_id": e.schedule_id, "course_name": e.course_name, "day_of_week": e.day_of_week, "start_time": e.start_time, "end_time": e.end_time}
            for e, _ in schedule_entries
        ],
        "task_plan_templates": [{"id": t.id, "name": t.name, "month": t.month} for t in templates],
        "task_plan_entries": [
            {"id": e.id, "template_id": e.template_id, "day": e.day, "planned_text": e.planned_text, "actual_text": e.actual_text, "manual_text": e.manual_text}
            for e, _ in template_entries
        ],
    }
    return ApiResponse.success(data=payload)


@router.post("/data/import/all")
async def import_all_data(
    payload: dict,
    apply: bool = Query(False, description="false=仅预检 true=执行导入"),
    template_mode: str = Query("append", description="append|replace_by_month"),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    backup_version = str(payload.get("version") or "").strip() or "unknown"
    version_compatible = backup_version == "v1"
    tasks = payload.get("tasks") or []
    cards = payload.get("memory_cards") or []
    notes = payload.get("course_notes") or []
    schedules = payload.get("schedules") or []
    schedule_entries = payload.get("schedule_entries") or []
    templates = payload.get("task_plan_templates") or []
    template_entries = payload.get("task_plan_entries") or []

    if not isinstance(tasks, list) or not isinstance(cards, list) or not isinstance(notes, list):
        return ApiResponse.error(message="备份文件结构不正确")

    incoming_task_titles = {
        str(item.get("title") or "").strip()
        for item in tasks
        if str(item.get("title") or "").strip()
    }
    incoming_template_months = {
        str(item.get("month") or "").strip()
        for item in templates
        if str(item.get("month") or "").strip()
    }
    existing_task_titles = set(
        (
            await db.execute(
                select(Task.title).where(
                    and_(Task.user_id == user_id, Task.title.in_(list(incoming_task_titles)))
                )
            )
        ).scalars().all()
    ) if incoming_task_titles else set()
    existing_template_months = set(
        (
            await db.execute(
                select(TaskPlanTemplate.month).where(
                    and_(TaskPlanTemplate.user_id == user_id, TaskPlanTemplate.month.in_(list(incoming_template_months)))
                )
            )
        ).scalars().all()
    ) if incoming_template_months else set()

    preview = {
        "apply": apply,
        "backup_version": backup_version,
        "version_compatible": version_compatible,
        "template_mode": template_mode,
        "detected": {
            "tasks": len(tasks),
            "memory_cards": len(cards),
            "course_notes": len(notes),
            "schedules": len(schedules),
            "schedule_entries": len(schedule_entries),
            "task_plan_templates": len(templates),
            "task_plan_entries": len(template_entries),
        },
        "imported": {
            "tasks": 0,
            "memory_cards": 0,
            "course_notes": 0,
            "schedules": 0,
            "schedule_entries": 0,
            "task_plan_templates": 0,
            "task_plan_entries": 0,
        },
        "conflicts": {
            "task_title_duplicates": sorted(existing_task_titles),
            "template_month_duplicates": sorted(existing_template_months),
            "risk_level": (
                "high"
                if (existing_task_titles or (template_mode == "append" and existing_template_months))
                else "low"
            ),
        },
    }
    if template_mode not in {"append", "replace_by_month"}:
        return ApiResponse.error(message="template_mode 仅支持 append 或 replace_by_month")
    if not apply:
        return ApiResponse.success(data=preview)
    if not version_compatible:
        return ApiResponse.error(message=f"备份版本不兼容：{backup_version}，当前仅支持 v1")

    schedule_id_map: dict[str, str] = {}
    template_id_map: dict[str, str] = {}
    replaced_months: set[str] = set()

    for item in tasks:
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        task = Task(
            user_id=user_id,
            title=title,
            status=item.get("status") or "pending",
            due_date=datetime.fromisoformat(item["due_date"]) if item.get("due_date") else None,
        )
        db.add(task)
        preview["imported"]["tasks"] += 1

    for item in cards:
        source_text = str(item.get("source_text") or "").strip()
        target_text = str(item.get("target_text") or "").strip()
        if not source_text or not target_text:
            continue
        card = MemoryCard(
            user_id=user_id,
            source_text=source_text,
            target_text=target_text,
            domain=item.get("domain") or "通用",
        )
        db.add(card)
        preview["imported"]["memory_cards"] += 1

    for item in notes:
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        note = CourseNote(
            user_id=user_id,
            title=title,
            course_name=item.get("course_name"),
        )
        db.add(note)
        preview["imported"]["course_notes"] += 1

    for item in schedules:
        schedule = Schedule(
            user_id=user_id,
            name=item.get("name") or "导入课表",
            is_active=bool(item.get("is_active", False)),
        )
        db.add(schedule)
        await db.flush()
        old_id = str(item.get("id") or "")
        if old_id:
            schedule_id_map[old_id] = schedule.id
        preview["imported"]["schedules"] += 1

    for item in schedule_entries:
        old_schedule_id = str(item.get("schedule_id") or "")
        new_schedule_id = schedule_id_map.get(old_schedule_id)
        if not new_schedule_id:
            continue
        entry = ScheduleEntry(
            schedule_id=new_schedule_id,
            course_name=item.get("course_name") or "",
            day_of_week=int(item.get("day_of_week") or 1),
            start_time=item.get("start_time") or "08:00",
            end_time=item.get("end_time") or "09:40",
        )
        db.add(entry)
        preview["imported"]["schedule_entries"] += 1

    for item in templates:
        month = str(item.get("month") or "").strip()
        if not month:
            continue
        if template_mode == "replace_by_month" and month not in replaced_months:
            existing_template_ids = (
                await db.execute(
                    select(TaskPlanTemplate.id).where(
                        and_(TaskPlanTemplate.user_id == user_id, TaskPlanTemplate.month == month)
                    )
                )
            ).scalars().all()
            if existing_template_ids:
                await db.execute(
                    delete(TaskPlanEntry).where(TaskPlanEntry.template_id.in_(list(existing_template_ids)))
                )
                await db.execute(
                    delete(TaskPlanTemplate).where(TaskPlanTemplate.id.in_(list(existing_template_ids)))
                )
            replaced_months.add(month)
        template = TaskPlanTemplate(
            user_id=user_id,
            name=item.get("name") or f"{month} 模板",
            month=month,
        )
        db.add(template)
        await db.flush()
        old_id = str(item.get("id") or "")
        if old_id:
            template_id_map[old_id] = template.id
        preview["imported"]["task_plan_templates"] += 1

    for item in template_entries:
        old_template_id = str(item.get("template_id") or "")
        new_template_id = template_id_map.get(old_template_id)
        if not new_template_id:
            continue
        entry = TaskPlanEntry(
            template_id=new_template_id,
            day=int(item.get("day") or 1),
            planned_text=item.get("planned_text") or "",
            actual_text=item.get("actual_text"),
            manual_text=item.get("manual_text"),
        )
        db.add(entry)
        preview["imported"]["task_plan_entries"] += 1

    await db.flush()
    return ApiResponse.success(data=preview)
