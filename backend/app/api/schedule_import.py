"""Schedule import routes — JSON, CSV, ICS, OCR.

Extracted from schedule.py for maintainability.
"""

import csv
import io
import json
import re
from datetime import datetime, date, time as dt_time, timedelta

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.response import ApiResponse
from app.core.security import decode_access_token, oauth2_scheme
from app.models.models import Schedule, ScheduleEntry

_settings = get_settings()

from app.core.security import decode_access_token, oauth2_scheme
from fastapi import HTTPException


async def get_current_user_id(token: str = Depends(oauth2_scheme)) -> str:
    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="无效的认证")
    return user_id


def _parse_time(time_str: str) -> str:
    time_str = time_str.strip()
    if not time_str or time_str == "00:00":
        return "19:00"
    m = re.match(r"(\d{1,2})[:：](\d{2})", time_str)
    if m:
        return f"{int(m.group(1)):02d}:{m.group(2)}"
    return "19:00"


def _fix_time(start_time: str, end_time: str) -> tuple[str, str]:
    if start_time >= end_time:
        return "19:00", "20:40"
    return start_time, end_time


def _day_from_date(d: date) -> int:
    return d.isoweekday() % 7 or 7


def _parse_day(day_str: str) -> int:
    day_map = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 7, "天": 7}
    day_str = day_str.strip()
    if day_str in day_map:
        return day_map[day_str]
    try:
        return int(day_str)
    except ValueError:
        return 1


async def _get_schedule_entries(db, schedule_id: str) -> list:
    from app.models.models import ScheduleEntry
    result = await db.execute(
        select(ScheduleEntry).where(ScheduleEntry.schedule_id == schedule_id).order_by(ScheduleEntry.day_of_week, ScheduleEntry.start_time)
    )
    return list(result.scalars().all())


def _schedule_to_dict(schedule, entries: list | None = None) -> dict:
    from app.models.models import ScheduleEntry
    if entries is None:
        entries = []
    return {
        "id": schedule.id,
        "name": schedule.name,
        "is_active": schedule.is_active,
        "source_type": schedule.source_type,
        "created_at": str(schedule.created_at),
        "entries": [
            {
                "id": e.id,
                "course_name": e.course_name,
                "teacher": e.teacher,
                "location": e.location,
                "day_of_week": e.day_of_week,
                "start_time": e.start_time,
                "end_time": e.end_time,
                "color": e.color,
                "event_date": str(e.event_date) if e.event_date else None,
            }
            for e in entries
        ],
    }

import_router = APIRouter()


@import_router.post("/import/json")
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
        st = _parse_time(e.get("start_time", "08:00"))
        et = _parse_time(e.get("end_time", "09:40"))
        st, et = _fix_time(st, et)
        ev_date_str = e.get("event_date", "") or ""
        ev_date = None
        if ev_date_str:
            try:
                ev_date = datetime.strptime(ev_date_str, "%Y-%m-%d").date()
            except ValueError:
                pass
        # If event_date is set, derive day_of_week from it (more reliable than OCR)
        if ev_date:
            day = _day_from_date(ev_date)
        else:
            day = _parse_day(e.get("day_of_week", 1))
        entry = ScheduleEntry(
            schedule_id=schedule.id,
            course_name=e.get("course_name", e.get("name", "")),
            teacher=e.get("teacher"),
            location=e.get("location", e.get("room", "")),
            day_of_week=day,
            start_time=st,
            end_time=et,
            weeks=json.dumps(e.get("weeks")) if e.get("weeks") else None,
            color=e.get("color"),
            event_date=ev_date,
        )
        db.add(entry)

    await db.flush()
    entries = await _get_schedule_entries(db, schedule.id)
    return ApiResponse.success(data=_schedule_to_dict(schedule, entries))


@import_router.post("/import/csv")
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


def _parse_ics(text: str) -> list[dict]:
    """Parse iCal (.ics) file into schedule entries.
    Handles Wakeup and standard iCal formats with RRULE for recurring events.
    """
    entries = []
    seen = set()  # deduplicate by (course_name, day_of_week, start_time, end_time)

    # Split into VEVENT blocks
    events = re.findall(r'BEGIN:VEVENT(.*?)END:VEVENT', text, re.DOTALL)

    for event in events:
        def get_field(name: str) -> str:
            """Extract field value, handling folded lines."""
            # Unfold continuation lines (lines starting with space/tab)
            unfolded = re.sub(r'\r?\n[ \t]', '', event)
            pattern = rf'^{name}[^:]*:(.*)$'
            m = re.search(pattern, unfolded, re.MULTILINE | re.IGNORECASE)
            if m:
                return m.group(1).strip()
            return ""

        summary = get_field("SUMMARY")
        location = get_field("LOCATION")
        description = get_field("DESCRIPTION")
        dtstart = get_field("DTSTART")
        dtend = get_field("DTEND")
        rrule = get_field("RRULE")

        if not summary or not dtstart:
            continue

        # Parse start/end datetime
        def parse_dt(dt_str: str) -> datetime | None:
            dt_str = dt_str.strip().rstrip('Z')
            # Try various formats
            for fmt in ("%Y%m%dT%H%M%S", "%Y%m%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
                try:
                    return datetime.strptime(dt_str, fmt)
                except ValueError:
                    continue
            return None

        start_dt = parse_dt(dtstart)
        end_dt = parse_dt(dtend) if dtend else None

        if not start_dt:
            continue

        # Determine days of week from RRULE or single event
        days = []
        if rrule:
            # Parse BYDAY from RRULE (e.g., BYDAY=MO,TU,WE)
            byday_match = re.search(r'BYDAY=([A-Z,]+)', rrule, re.IGNORECASE)
            if byday_match:
                day_map = {"MO": 1, "TU": 2, "WE": 3, "TH": 4, "FR": 5, "SA": 6, "SU": 7}
                for d in byday_match.group(1).split(","):
                    d = d.strip()[:2].upper()
                    if d in day_map:
                        days.append(day_map[d])
            else:
                # Fallback: use the start date's weekday
                days.append(start_dt.isoweekday())
        else:
            days.append(start_dt.isoweekday())

        # Time strings
        start_time = start_dt.strftime("%H:%M") if start_dt.hour else "08:00"
        end_time = end_dt.strftime("%H:%M") if end_dt and end_dt.hour else (
            f"{min(start_dt.hour + 2, 23):02d}:{start_dt.strftime('%M')}"
        )

        # Try to extract teacher from DESCRIPTION or SUMMARY
        teacher = ""
        if description:
            # Common patterns: "教师:xxx", "老师:xxx", "Teacher:xxx"
            m = re.search(r'(?:教师|老师|Teacher|老师)\s*[:：]\s*(.+?)(?:\n|$)', description, re.IGNORECASE)
            if m:
                teacher = m.group(1).strip()
        if not teacher:
            # Sometimes teacher is in parentheses in summary
            m = re.search(r'[（(]\s*([^)）]+?)\s*[)）]', summary)
            if m:
                candidate = m.group(1).strip()
                # Heuristic: if it looks like a name (2-4 chars, no digits), treat as teacher
                if re.match(r'^[\u4e00-\u9fff]{2,4}$', candidate):
                    teacher = candidate

        # Parse weeks from RRULE if available
        weeks = None
        if rrule:
            # Try to extract COUNT or range
            count_match = re.search(r'COUNT=(\d+)', rrule)
            until_match = re.search(r'UNTIL=(\d{8}T?\d{0,6}?)', rrule)
            if count_match or until_match:
                # Calculate week numbers from start date
                start_date = start_dt.date() if hasattr(start_dt, 'date') else start_dt
                weeks = []
                if until_match:
                    until_str = until_match.group(1)
                    try:
                        until_date = datetime.strptime(until_str[:8], "%Y%m%d").date()
                    except ValueError:
                        until_date = start_date
                elif count_match:
                    # Estimate: count * 7 days from start
                    from datetime import timedelta
                    until_date = start_date + timedelta(days=int(count_match.group(1)) * 7)
                else:
                    until_date = start_date

                # Generate week numbers (assuming semester starts on a Monday)
                semester_start = start_date - timedelta(days=start_date.weekday())
                current = semester_start
                week_num = 1
                while current <= until_date and week_num <= 30:
                    if current.weekday() + 1 in days:
                        weeks.append(week_num)
                    if current.weekday() == 6:  # Sunday
                        week_num += 1
                    current += timedelta(days=1)
                weeks = sorted(set(weeks))

        for day in days:
            key = (summary, day, start_time, end_time)
            if key in seen:
                continue
            seen.add(key)
            entries.append({
                "course_name": summary,
                "teacher": teacher or None,
                "location": location or None,
                "day_of_week": day,
                "start_time": start_time,
                "end_time": end_time,
                "weeks": weeks,
            })

    return entries


@import_router.post("/import/ics")
async def import_ics(
    file: UploadFile = File(...),
    name: str = Form("iCal导入课表"),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Import schedule from iCal (.ics) file (Wakeup, Apple Calendar, etc.)."""
    if not file.filename or not (file.filename.lower().endswith(".ics") or file.filename.lower().endswith(".ical")):
        raise HTTPException(status_code=400, detail="仅支持 .ics / .ical 文件")

    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("gbk", errors="replace")

    entries_data = _parse_ics(text)

    if not entries_data:
        raise HTTPException(status_code=400, detail="未在 iCal 文件中识别到课程事件")

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
            weeks=json.dumps(e["weeks"]) if e.get("weeks") else None,
        )
        db.add(entry)

    await db.flush()
    entries = await _get_schedule_entries(db, schedule.id)
    return ApiResponse.success(data=_schedule_to_dict(schedule, entries))


@import_router.post("/import/ocr")
async def import_ocr(
    body: dict,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Import schedule from image via AI OCR (base64 image).
    Supports two formats:
    1. Weekly timetable (standard grid with Mon-Sun columns, time rows)
    2. Monthly calendar (day-grid layout like Wakeup/month view)
    For monthly calendars, AI extracts recurring patterns and deduplicates
    to produce a weekly schedule.
    """
    image_data = body.get("image", "")
    if not image_data:
        return ApiResponse.error(message="请提供图片数据")

    import httpx
    import logging
    logger = logging.getLogger(__name__)

    ocr_api_key = _settings.DASHSCOPE_API_KEY
    if not ocr_api_key:
        return ApiResponse.error(message="视觉识别 API key 未配置，请在 .env 中设置 DASHSCOPE_API_KEY")

    from datetime import date as _today
    _now = _today.today()
    system_prompt = (
        f"你是一个课表识别助手。当前日期是{_now.strftime('%Y年%m月%d日')}，请仔细分析图片中的课表格式，然后提取课程信息。注意：event_date的年份必须是{_now.year}年！\n\n"
        "## 第一步：判断课表类型\n"
        "- **周课表**：横轴是星期一到星期日，纵轴是时间段（如第1-2节、第3-4节或具体时间）\n"
        "- **月历课表**：按日期排列的日历网格（如4月1日、4月2日...），每天一个格子，课程写在对应日期格子里\n\n"
        "## 第二步：提取课程\n"
        "对于**周课表**：直接提取每门课程，event_date 留空字符串。\n"
        "对于**月历课表**：每门课程按其具体日期提取，event_date 填写该课程的日期（YYYY-MM-DD格式）。\n"
        "月历课表中不同日期的不同课程都要独立列出，不要合并。\n\n"
        "## 时间格式要求（非常重要！）\n"
        "start_time 和 end_time 必须是严格的 HH:MM 24小时制格式。\n"
        "- 如果图片写的是晚上7点或19:00，start_time 填 19:00\n"
        "- 如果图片写的是晚上7点到8点40，start_time 填 19:00，end_time 填 20:40\n"
        "- 如果图片写的是上午8点，start_time 填 08:00\n"
        "- 如果图片写的是第1-2节，start_time 填 08:00，end_time 填 09:40\n"
        "- 如果图片写的是第3-4节，start_time 填 10:00，end_time 填 11:40\n"
        "- 如果图片写的是第5-6节，start_time 填 14:00，end_time 填 15:40\n"
        "- 如果图片写的是第7-8节，start_time 填 16:00，end_time 填 17:40\n"
        "- 如果图片写的是第9-10节，start_time 填 19:00，end_time 填 20:40\n"
        "- 如果无法确定具体时间，默认填 start_time 19:00，end_time 20:40\n"
        "**绝对不允许**填 00:00，这是无效时间！\n\n"
        "## 输出格式\n"
        "返回JSON数组，每个元素包含：\n"
        "- course_name: 课程名称\n"
        "- teacher: 教师姓名（无法识别则留空字符串）\n"
        "- location: 上课地点（无法识别则留空字符串）\n"
        "- day_of_week: 星期几（1=周一, 2=周二, ..., 7=周日）\n"
        "- start_time: 开始时间（HH:MM格式）\n"
        "- end_time: 结束时间（HH:MM格式）\n"
        "- event_date: 具体日期（YYYY-MM-DD格式）。周课表留空字符串，月历课表填写课程所在日期\n\n"
        "只返回JSON数组，不要返回任何其他文字、解释或markdown标记。\n"
        "如果图片不是课表或无法识别，返回空数组 []。"
    )

    try:
        async with httpx.AsyncClient(timeout=120) as http_client:
            resp = await http_client.post(
                "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {ocr_api_key}",
                },
                json={
                    "model": "qwen-vl-max",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {
                            "role": "user",
                            "content": [
                                {"type": "image_url", "image_url": {"url": image_data}},
                                {"type": "text", "text": "请识别这张课表图片中的所有课程信息，注意如果是月历格式请合并每周重复的课程。"},
                            ],
                        },
                    ],
                    "temperature": 0.1,
                },
            )
            result = resp.json()
            logger.info(f"DashScope OCR response status={resp.status_code}, keys={list(result.keys())}")

        if "error" in result:
            error_msg = result["error"].get("message", str(result["error"]))
            logger.error(f"DashScope OCR error: {error_msg}")
            return ApiResponse.error(message=f"AI 识别失败: {error_msg}")

        content = result["choices"][0]["message"]["content"]
    except KeyError as e:
        logger.error(f"DashScope OCR unexpected response: {str(result)[:500]}, missing key: {e}")
        return ApiResponse.error(message="AI 返回格式异常，请稍后重试")
    except httpx.TimeoutException:
        return ApiResponse.error(message="AI 识别超时，请稍后重试")
    except Exception as e:
        logger.error(f"DashScope OCR exception: {e}")
        return ApiResponse.error(message=f"识别失败: {str(e)}")

    # Parse JSON from response
    try:
        start = content.index("[")
        end = content.rindex("]") + 1
        entries_data = json.loads(content[start:end])
    except (ValueError, json.JSONDecodeError):
        return ApiResponse.error(message="AI 未能识别课表，请尝试更清晰的图片")

    if not entries_data:
        return ApiResponse.error(message="未识别到课程信息")

    # Deduplicate: same course_name + day_of_week + time → keep one
    seen = set()
    deduped = []
    for e in entries_data:
        name = e.get("course_name", "").strip()
        if not name:
            continue
        day = _parse_day(str(e.get("day_of_week", 1)))
        st = _parse_time(str(e.get("start_time", "08:00")))
        et = _parse_time(str(e.get("end_time", "09:40")))
        st, et = _fix_time(st, et)
        ev_date = e.get("event_date", "") or ""
        # Dedup: include event_date in key so different-date events are kept
        key = (name, day, st, et, ev_date)
        if key not in seen:
            seen.add(key)
            deduped.append(e)

    if not deduped:
        return ApiResponse.error(message="去重后无有效课程")

    # Merge into existing active schedule, or create new one
    existing = (await db.execute(
        select(Schedule).where(and_(Schedule.user_id == user_id, Schedule.is_active == True))
    )).scalars().first()

    if existing:
        schedule = existing
        # Pick a color for this batch that differs from existing entries
        existing_entries = await _get_schedule_entries(db, schedule.id)
        used_colors = {e.color for e in existing_entries if e.color}
        import random
        palette = ["#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6",
                    "#EC4899", "#06B6D4", "#F97316", "#6366F1", "#14B8A6"]
        available = [c for c in palette if c not in used_colors]
        batch_color = random.choice(available) if available else random.choice(palette)
    else:
        schedule = Schedule(user_id=user_id, name=body.get("name", "OCR导入课表"), is_active=True)
        db.add(schedule)
        await db.flush()
        batch_color = "#3B82F6"

    for e in deduped:
        ev_date_str = e.get("event_date", "") or ""
        ev_date = None
        if ev_date_str:
            try:
                ev_date = datetime.strptime(ev_date_str, "%Y-%m-%d").date()
            except ValueError:
                pass
        st = _parse_time(str(e.get("start_time", "08:00")))
        et = _parse_time(str(e.get("end_time", "09:40")))
        st, et = _fix_time(st, et)
        # If event_date is set, derive day_of_week from it (more reliable than OCR)
        if ev_date:
            day = _day_from_date(ev_date)
        else:
            day = _parse_day(str(e.get("day_of_week", 1)))
            # Default to non-weekly: derive event_date from current week
            today = datetime.now().date()
            days_ahead = (day - today.weekday() - 1) % 7
            if days_ahead == 0:
                days_ahead = 7
            ev_date = today + timedelta(days=days_ahead)
        entry = ScheduleEntry(
            schedule_id=schedule.id,
            course_name=e.get("course_name", ""),
            teacher=e.get("teacher"),
            location=e.get("location"),
            day_of_week=day,
            start_time=st,
            end_time=et,
            color=e.get("color") or batch_color,
            event_date=ev_date,
        )
        db.add(entry)

    await db.flush()
    entries = await _get_schedule_entries(db, schedule.id)
    return ApiResponse.success(data=_schedule_to_dict(schedule, entries))



