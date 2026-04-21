import json
import csv
import io
import base64
from datetime import datetime
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
            if e1.day_of_week == e2.day_of_week:
                if e1.start_time < e2.end_time and e2.start_time < e1.end_time:
                    conflicts.append({
                        "course_1": e1.course_name,
                        "course_2": e2.course_name,
                        "day_of_week": e1.day_of_week,
                        "time_range": f"{e1.start_time}-{e1.end_time} vs {e2.start_time}-{e2.end_time}",
                    })

    return ApiResponse.success(data={"conflicts": conflicts, "total_entries": len(entries)})


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
    # Handle "8:00" -> "08:00"
    if ":" in time_str:
        parts = time_str.split(":")
        return f"{int(parts[0]):02d}:{int(parts[1][:2]):02d}"
    return time_str


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


@router.post("/import/json")
async def import_json(
    body: dict,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Import schedule from JSON (supports Wakeup and generic formats)."""
    entries_data = []

    # Wakeup format: {"data": [{"courseName": ..., "room": ..., "teacher": ..., "startWeek": ..., "endWeek": ..., "classDay": ..., "classBegin": ..., "classEnd": ...}]}
    if "data" in body and isinstance(body["data"], list):
        for item in body["data"]:
            # Wakeup class periods: 1-2 = 08:00-09:40, 3-4 = 10:00-11:40, etc.
            period_map = {
                1: "08:00", 2: "08:50", 3: "10:00", 4: "10:50",
                5: "14:00", 6: "14:50", 7: "16:00", 8: "16:50",
                9: "19:00", 10: "19:50", 11: "20:40", 12: "21:30",
            }
            begin = item.get("classBegin", 1)
            end = item.get("classEnd", 2)
            start_time = period_map.get(begin, "08:00")
            end_time = period_map.get(end, "09:40")
            if end > begin:
                # Use the end of the last period
                end_period_map = {
                    1: "08:45", 2: "09:40", 3: "10:45", 4: "11:40",
                    5: "14:45", 6: "15:40", 7: "16:45", 8: "17:40",
                    9: "19:45", 10: "20:40", 11: "21:30", 12: "22:20",
                }
                end_time = end_period_map.get(end, "09:40")

            weeks = list(range(item.get("startWeek", 1), item.get("endWeek", 16) + 1))

            entries_data.append({
                "course_name": item.get("courseName", item.get("name", "")),
                "teacher": item.get("teacher", ""),
                "location": item.get("room", ""),
                "day_of_week": item.get("classDay", 1),
                "start_time": start_time,
                "end_time": end_time,
                "weeks": weeks,
                "color": item.get("color"),
            })

    # Generic format: {"name": "...", "entries": [...]}
    elif "entries" in body and isinstance(body["entries"], list):
        entries_data = body["entries"]

    # Simple list format: [{"course_name": ..., "day_of_week": ..., ...}]
    elif isinstance(body, list):
        entries_data = body

    if not entries_data:
        return ApiResponse.error(message="无法解析课表数据")

    # Deactivate old
    old = (await db.execute(
        select(Schedule).where(and_(Schedule.user_id == user_id, Schedule.is_active == True))
    )).scalars().all()
    for s in old:
        s.is_active = False

    schedule = Schedule(user_id=user_id, name=body.get("name", "导入课表"), is_active=True)
    db.add(schedule)
    await db.flush()

    for e in entries_data:
        entry = ScheduleEntry(
            schedule_id=schedule.id,
            course_name=e.get("course_name", e.get("name", "")),
            teacher=e.get("teacher"),
            location=e.get("location", e.get("room", "")),
            day_of_week=_parse_day(e.get("day_of_week", 1)),
            start_time=_parse_time(e.get("start_time", "08:00")),
            end_time=_parse_time(e.get("end_time", "09:40")),
            weeks=json.dumps(e.get("weeks")) if e.get("weeks") else None,
            color=e.get("color"),
        )
        db.add(entry)

    await db.flush()
    entries = await _get_schedule_entries(db, schedule.id)
    return ApiResponse.success(data=_schedule_to_dict(schedule, entries))


@router.post("/import/csv")
async def import_csv(
    file: UploadFile = File(...),
    name: str = Form("导入课表"),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Import schedule from CSV file.
    Expected columns: course_name, teacher, location, day_of_week, start_time, end_time, color
    """
    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("gbk")

    reader = csv.DictReader(io.StringIO(text))
    entries_data = []
    for row in reader:
        entries_data.append({
            "course_name": row.get("course_name", row.get("课程名称", row.get("name", ""))),
            "teacher": row.get("teacher", row.get("教师", "")),
            "location": row.get("location", row.get("地点", row.get("room", ""))),
            "day_of_week": _parse_day(row.get("day_of_week", row.get("星期", "1"))),
            "start_time": _parse_time(row.get("start_time", row.get("开始时间", "08:00"))),
            "end_time": _parse_time(row.get("end_time", row.get("结束时间", "09:40"))),
            "color": row.get("color", ""),
        })

    if not entries_data:
        return ApiResponse.error(message="CSV 文件为空或格式不正确")

    # Deactivate old
    old = (await db.execute(
        select(Schedule).where(and_(Schedule.user_id == user_id, Schedule.is_active == True))
    )).scalars().all()
    for s in old:
        s.is_active = False

    schedule = Schedule(user_id=user_id, name=name, is_active=True)
    db.add(schedule)
    await db.flush()

    for e in entries_data:
        if not e["course_name"]:
            continue
        entry = ScheduleEntry(
            schedule_id=schedule.id,
            course_name=e["course_name"],
            teacher=e.get("teacher"),
            location=e.get("location"),
            day_of_week=e["day_of_week"],
            start_time=e["start_time"],
            end_time=e["end_time"],
            color=e.get("color"),
        )
        db.add(entry)

    await db.flush()
    entries = await _get_schedule_entries(db, schedule.id)
    return ApiResponse.success(data=_schedule_to_dict(schedule, entries))


@router.post("/import/ocr")
async def import_ocr(
    body: dict,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Import schedule from image via AI OCR (base64 image)."""
    if not settings.DEEPSEEK_API_KEY:
        return ApiResponse.error(message="AI API key not configured")

    image_data = body.get("image", "")
    if not image_data:
        return ApiResponse.error(message="请提供图片数据")

    import httpx

    # Use Deepseek VL for OCR
    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            "https://api.deepseek.com/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
            },
            json={
                "model": "deepseek-chat",
                "messages": [
                    {
                        "role": "system",
                        "content": "你是一个课表识别助手。请从图片中识别课表信息，返回JSON数组格式。每个课程包含：course_name(课程名), teacher(教师), location(地点), day_of_week(星期几1-7), start_time(HH:MM), end_time(HH:MM)。只返回JSON数组，不要其他文字。",
                    },
                    {
                        "role": "user",
                        "content": image_data,
                    },
                ],
                "temperature": 0.1,
            },
        )
        result = resp.json()
        content = result["choices"][0]["message"]["content"]

    # Parse JSON from response
    try:
        start = content.index("[")
        end = content.rindex("]") + 1
        entries_data = json.loads(content[start:end])
    except (ValueError, json.JSONDecodeError):
        return ApiResponse.error(message="AI 未能识别课表，请尝试更清晰的图片")

    if not entries_data:
        return ApiResponse.error(message="未识别到课程信息")

    # Deactivate old
    old = (await db.execute(
        select(Schedule).where(and_(Schedule.user_id == user_id, Schedule.is_active == True))
    )).scalars().all()
    for s in old:
        s.is_active = False

    schedule = Schedule(user_id=user_id, name=body.get("name", "OCR导入课表"), is_active=True)
    db.add(schedule)
    await db.flush()

    for e in entries_data:
        entry = ScheduleEntry(
            schedule_id=schedule.id,
            course_name=e.get("course_name", ""),
            teacher=e.get("teacher"),
            location=e.get("location"),
            day_of_week=_parse_day(e.get("day_of_week", 1)),
            start_time=_parse_time(e.get("start_time", "08:00")),
            end_time=_parse_time(e.get("end_time", "09:40")),
            color=e.get("color"),
        )
        db.add(entry)

    await db.flush()
    entries = await _get_schedule_entries(db, schedule.id)
    return ApiResponse.success(data=_schedule_to_dict(schedule, entries))


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
