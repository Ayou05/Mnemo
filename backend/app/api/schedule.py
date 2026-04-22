import json
import csv
import io
import re
import base64
from datetime import datetime, date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.response import ApiResponse
from app.core.security import decode_access_token, oauth2_scheme
from app.core.config import get_settings
from app.models.models import Schedule, ScheduleEntry
from app.schemas.schemas import (
    ScheduleCreate, ScheduleEntryCreate, ScheduleEntryOut,
    ScheduleOut,
)

router = APIRouter()
settings = get_settings()


async def get_current_user_id(token: str = Depends(oauth2_scheme)) -> str:
    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="无效的认证")
    return user_id


def _schedule_to_dict(schedule: Schedule, entries: list[ScheduleEntry] | None = None) -> dict:
    """Convert schedule + entries to dict without triggering lazy load."""
    if entries is None:
        entries = []
    return {
        "id": schedule.id,
        "name": schedule.name,
        "version": schedule.version,
        "is_active": schedule.is_active,
        "entries": [
            {
                "id": e.id,
                "course_name": e.course_name,
                "teacher": e.teacher,
                "location": e.location,
                "day_of_week": e.day_of_week,
                "start_time": e.start_time,
                "end_time": e.end_time,
                "weeks": e.weeks,
                "color": e.color,
                "event_date": e.event_date.isoformat() if e.event_date else None,
            }
            for e in entries
        ],
        "created_at": schedule.created_at.isoformat() if schedule.created_at else None,
    }


async def _get_schedule_entries(db: AsyncSession, schedule_id: str) -> list[ScheduleEntry]:
    result = await db.execute(
        select(ScheduleEntry).where(ScheduleEntry.schedule_id == schedule_id)
    )
    return list(result.scalars().all())


@router.post("/", status_code=201)
async def create_schedule(
    body: ScheduleCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    # Deactivate old schedules
    old = (await db.execute(
        select(Schedule).where(and_(Schedule.user_id == user_id, Schedule.is_active == True))
    )).scalars().all()
    for s in old:
        s.is_active = False

    schedule = Schedule(
        user_id=user_id,
        name=body.name,
        is_active=True,
    )
    db.add(schedule)
    await db.flush()
    await db.refresh(schedule)

    for entry_data in body.entries:
        entry = ScheduleEntry(
            schedule_id=schedule.id,
            course_name=entry_data.course_name,
            teacher=entry_data.teacher,
            location=entry_data.location,
            day_of_week=entry_data.day_of_week,
            start_time=entry_data.start_time,
            end_time=entry_data.end_time,
            weeks=json.dumps(entry_data.weeks) if entry_data.weeks else None,
            color=entry_data.color,
        )
        db.add(entry)

    await db.flush()
    entries = await _get_schedule_entries(db, schedule.id)
    return ApiResponse.success(data=_schedule_to_dict(schedule, entries))


@router.get("/")
async def list_schedules(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Schedule).where(Schedule.user_id == user_id).order_by(Schedule.created_at.desc())
    )
    schedules = result.scalars().all()

    data = []
    for s in schedules:
        entries = await _get_schedule_entries(db, s.id)
        data.append(_schedule_to_dict(s, entries))

    return ApiResponse.success(data=data)


@router.get("/active")
async def get_active_schedule(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Schedule).where(and_(Schedule.user_id == user_id, Schedule.is_active == True))
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        return ApiResponse.success(data=None)

    entries = await _get_schedule_entries(db, schedule.id)
    return ApiResponse.success(data=_schedule_to_dict(schedule, entries))


@router.get("/conflicts")
async def check_conflicts(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Schedule).where(and_(Schedule.user_id == user_id, Schedule.is_active == True))
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        return ApiResponse.success(data={"conflicts": [], "total_entries": 0})

    entries = await _get_schedule_entries(db, schedule.id)

    conflicts = []
    for i, e1 in enumerate(entries):
        for e2 in entries[i + 1:]:
            if e1.day_of_week != e2.day_of_week:
                continue
            # event_date entries only conflict if on the same date
            if e1.event_date and e2.event_date and e1.event_date != e2.event_date:
                continue
            # An event_date entry and a recurring entry can conflict
            # (the event_date entry appears on that week's day_of_week)
            if e1.start_time < e2.end_time and e2.start_time < e1.end_time:
                date_info = ""
                if e1.event_date or e2.event_date:
                    date_info = f" ({e1.event_date or e2.event_date})"
                conflicts.append({
                    "course_1": e1.course_name,
                    "course_2": e2.course_name,
                    "day_of_week": e1.day_of_week,
                    "time_range": f"{e1.start_time}-{e1.end_time} vs {e2.start_time}-{e2.end_time}{date_info}",
                })

    return ApiResponse.success(data={"conflicts": conflicts, "total_entries": len(entries)})


@router.get("/conflicts/advise")
async def advise_conflicts(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Use LLM to recommend which class to attend when conflicts exist."""
    import httpx
    import logging
    logger = logging.getLogger(__name__)

    result = await db.execute(
        select(Schedule).where(and_(Schedule.user_id == user_id, Schedule.is_active == True))
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        return ApiResponse.success(data={"advise": [], "conflicts": []})

    entries = await _get_schedule_entries(db, schedule.id)

    # Find conflicts
    conflicts = []
    for i, e1 in enumerate(entries):
        for e2 in entries[i + 1:]:
            if e1.day_of_week != e2.day_of_week:
                continue
            if e1.event_date and e2.event_date and e1.event_date != e2.event_date:
                continue
            if e1.start_time < e2.end_time and e2.start_time < e1.end_time:
                date_info = ""
                if e1.event_date or e2.event_date:
                    date_info = f" ({e1.event_date or e2.event_date})"
                conflicts.append({
                    "course_1": {"name": e1.course_name, "time": f"{e1.start_time}-{e1.end_time}", "teacher": e1.teacher or "", "location": e1.location or ""},
                    "course_2": {"name": e2.course_name, "time": f"{e2.start_time}-{e2.end_time}", "teacher": e2.teacher or "", "location": e2.location or ""},
                    "date_info": date_info,
                })

    if not conflicts:
        return ApiResponse.success(data={"advise": [], "conflicts": []})

    # Build prompt for LLM
    conflict_desc = "\n".join([
        f"冲突{i+1}{c['date_info']}：\n  A: {c['course_1']['name']}（{c['course_1']['time']}，教师：{c['course_1']['teacher']}，地点：{c['course_1']['location']}）\n  B: {c['course_2']['name']}（{c['course_2']['time']}，教师：{c['course_2']['teacher']}，地点：{c['course_2']['location']}）"
        for i, c in enumerate(conflicts)
    ])

    advise_prompt = (
        f"你是一个学习顾问。用户有以下课程时间冲突，请根据课程内容的重要程度、实用性给出建议。\n\n"
        f"{conflict_desc}\n\n"
        f"对每个冲突，返回JSON数组，每个元素包含：\n"
        f"- conflict: 冲突编号（从1开始）\n"
        f"- recommend: 建议去上的课程名（A或B的课程名）\n"
        f"- reason: 一句话理由（20字以内）\n"
        f"- skip: 建议跳过的课程名\n"
        f"只返回JSON数组，不要其他文字。"
    )

    try:
        ocr_api_key = settings.DASHSCOPE_API_KEY
        async with httpx.AsyncClient(timeout=30) as http_client:
            resp = await http_client.post(
                "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {ocr_api_key}",
                },
                json={
                    "model": "qwen-turbo",
                    "messages": [{"role": "user", "content": advise_prompt}],
                    "temperature": 0.3,
                },
            )
            result = resp.json()
            content = result["choices"][0]["message"]["content"]
            start = content.index("[")
            end = content.rindex("]") + 1
            advise = json.loads(content[start:end])
    except Exception as e:
        logger.error(f"Conflict advise error: {e}")
        advise = []

    return ApiResponse.success(data={"advise": advise, "conflicts": conflicts})


@router.delete("/{schedule_id}")
async def delete_schedule(
    schedule_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Schedule).where(and_(Schedule.id == schedule_id, Schedule.user_id == user_id))
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="课表不存在")
    await db.delete(schedule)
    return ApiResponse.success(message="已删除")


# ═══════════════════════════════════════
# Schedule Import
# ═══════════════════════════════════════

def _parse_time(time_str: str) -> str:
    """Normalize time string to HH:MM format."""
    time_str = time_str.strip()
    # Handle Chinese time expressions
    cn_map = {
        "晚上7点": "19:00", "晚上7点半": "19:30",
        "晚上8点": "20:00", "晚上8点半": "20:30",
        "晚上9点": "21:00", "晚上9点半": "21:30",
        "晚上10点": "22:00",
        "上午7点": "07:00", "上午8点": "08:00", "上午9点": "09:00",
        "上午10点": "10:00", "上午11点": "11:00", "上午12点": "12:00",
        "下午1点": "13:00", "下午2点": "14:00", "下午3点": "15:00",
        "下午4点": "16:00", "下午5点": "17:00", "下午6点": "18:00",
    }
    if time_str in cn_map:
        return cn_map[time_str]
    # Handle "8:00" -> "08:00"
    if ":" in time_str:
        parts = time_str.split(":")
        return f"{int(parts[0]):02d}:{int(parts[1][:2]):02d}"
    return time_str


def _fix_time(start_time: str, end_time: str) -> tuple[str, str]:
    """Fix invalid times (00:00) to sensible defaults."""
    if start_time in ("00:00", "00:01", ""):
        start_time = "19:00"
    if end_time in ("00:00", "00:01", "") or end_time <= start_time:
        # Default 1h40m class
        sh, sm = int(start_time[:2]), int(start_time[3:])
        from datetime import timedelta
        end_dt = datetime(2026, 1, 1, sh, sm) + timedelta(minutes=100)
        end_time = end_dt.strftime("%H:%M")
    return start_time, end_time


def _day_from_date(d: date) -> int:
    """Get day_of_week (1=Mon..7=Sun) from a date object."""
    wd = d.isoweekday()  # Mon=1..Sun=7
    return wd


def _parse_day(day_str: str) -> int:
    """Parse day string to 1-7 (Mon=1)."""
    day_str = str(day_str).strip()
    day_map = {
        "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
        "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 7,
        "mon": 1, "tue": 2, "wed": 3, "thu": 4, "fri": 5, "sat": 6, "sun": 7,
        "monday": 1, "tuesday": 2, "wednesday": 3, "thursday": 4, "friday": 5, "saturday": 6, "sunday": 7,
        "周一": 1, "周二": 2, "周三": 3, "周四": 4, "周五": 5, "周六": 6, "周日": 7,
    }
    return day_map.get(day_str.lower(), 1)



# Import routes extracted to schedule_import.py
@router.get("/export/json")
async def export_json(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Export active schedule as JSON."""
    result = await db.execute(
        select(Schedule).where(and_(Schedule.user_id == user_id, Schedule.is_active == True))
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        return ApiResponse.error(message="暂无课表")

    entries = await _get_schedule_entries(db, schedule.id)
    data = _schedule_to_dict(schedule, entries)
    return ApiResponse.success(data=data)
