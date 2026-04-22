import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.response import ApiResponse
from app.core.security import decode_access_token, oauth2_scheme
from app.api.import_cards import parse_plain_text_cards
from app.models.models import User

router = APIRouter()
settings = get_settings()


async def get_current_user_id(token: str = Depends(oauth2_scheme)) -> str:
    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="无效的认证")
    return user_id


# ── Request Bodies ──

class CleanTextRequest(BaseModel):
    text: str = Field(..., min_length=1)


class GenerateNotesRequest(BaseModel):
    text: str = Field(..., min_length=1)
    course_name: str = ""


class GenerateCardsRequest(BaseModel):
    text: str = Field(..., min_length=1)
    source_lang: str = "en"
    target_lang: str = "zh"


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    context: str = ""
    history: list[dict] = []


# ═══════════════════════════════════════
# AI Endpoints
# ═══════════════════════════════════════

@router.post("/transcribe")
async def transcribe_audio(
    token: str = Depends(oauth2_scheme),
):
    """Placeholder for Fun-ASR transcription endpoint."""
    return ApiResponse.success(message="ASR endpoint - to be implemented with Fun-ASR SDK")


@router.post("/clean-text")
async def clean_transcript(
    body: CleanTextRequest,
    token: str = Depends(oauth2_scheme),
):
    """Clean up ASR transcript using Deepseek LLM."""
    if not settings.DEEPSEEK_API_KEY:
        return ApiResponse.success(data={"cleaned_text": body.text, "note": "AI API key not configured"})
    import httpx

    async with httpx.AsyncClient(timeout=60) as client:
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
                        "content": "你是一个专业的文本清洗助手。请清理以下语音转写文本：去除口水词（嗯、啊、就是、然后、那个、这个、对吧、就是说），修正标点符号，合理分段。只输出清洗后的文本，不要解释。",
                    },
                    {"role": "user", "content": body.text},
                ],
                "temperature": 0.1,
            },
        )
        result = resp.json()
        cleaned = result["choices"][0]["message"]["content"]
        return ApiResponse.success(data={"cleaned_text": cleaned})


@router.post("/generate-notes")
async def generate_notes(
    body: GenerateNotesRequest,
    token: str = Depends(oauth2_scheme),
):
    """Generate structured notes from transcript using Deepseek LLM."""
    if not settings.DEEPSEEK_API_KEY:
        return ApiResponse.success(data={"summary": "AI API key not configured", "structured_notes": "", "cleaned_text": body.text})
    import httpx

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
                        "content": f"你是一个专业的课程笔记生成助手。课程名称：{body.course_name}。请根据转写文本生成结构化笔记，包含：1. 核心要点（3-5个）2. 关键术语 3. 知识点详解 4. 总结。使用 Markdown 格式。",
                    },
                    {"role": "user", "content": body.text},
                ],
                "temperature": 0.3,
            },
        )
        result = resp.json()
        notes = result["choices"][0]["message"]["content"]
        return ApiResponse.success(data={"structured_notes": notes, "summary": notes[:200]})


@router.post("/generate-cards")
async def generate_cards(
    body: GenerateCardsRequest,
    token: str = Depends(oauth2_scheme),
):
    """Generate memory cards from text using AI."""
    if not settings.DEEPSEEK_API_KEY:
        return ApiResponse.success(data={
            "cards": parse_plain_text_cards(body.text),
            "fallback": "local",
        })

    import httpx

    prompt = f"""将以下文本拆分为中英对照的记忆卡片对。源语言：{body.source_lang}，目标语言：{body.target_lang}。

要求：
1. 每张卡片包含 source_text（{body.source_lang}）和 target_text（{body.target_lang}）
2. 按语义单元拆分，不要拆分过碎
3. 翻译要准确自然
4. 以 JSON 数组格式输出，每个元素包含 source_text 和 target_text

文本：
{body.text}

请直接输出 JSON 数组，不要其他内容。"""

    try:
        async with httpx.AsyncClient(timeout=90) as client:
            resp = await client.post(
                "https://api.deepseek.com/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
                },
                json={
                    "model": "deepseek-chat",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.3,
                },
            )
            resp.raise_for_status()
            result = resp.json()
            content = result["choices"][0]["message"]["content"]

            try:
                start = content.index("[")
                end = content.rindex("]") + 1
                cards = json.loads(content[start:end])
            except (ValueError, json.JSONDecodeError):
                cards = parse_plain_text_cards(body.text)

            return ApiResponse.success(data={"cards": cards})
    except Exception:
        return ApiResponse.success(data={
            "cards": parse_plain_text_cards(body.text),
            "fallback": "local",
        })


@router.post("/chat")
async def ai_chat(
    body: ChatRequest,
    token: str = Depends(oauth2_scheme),
):
    """AI tutor chat endpoint with conversation history."""
    if not settings.DEEPSEEK_API_KEY:
        return ApiResponse.success(data={"reply": "AI API key not configured. Please set DEEPSEEK_API_KEY in your .env file."})
    import httpx

    system_prompt = "你是一个专业的学习助手，擅长解释复杂概念。请根据提供的课程内容回答问题，给出清晰、准确的解答。如果涉及数学公式，请用 LaTeX 格式。"
    if body.context:
        system_prompt += f"\n\n课程内容参考：\n{body.context}"

    messages = [{"role": "system", "content": system_prompt}]
    for msg in body.history[-10:]:
        messages.append(msg)
    messages.append({"role": "user", "content": body.message})

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.deepseek.com/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
            },
            json={
                "model": "deepseek-chat",
                "messages": messages,
                "temperature": 0.5,
            },
        )
        result = resp.json()
        reply = result["choices"][0]["message"]["content"]
        return ApiResponse.success(data={"reply": reply})
# ═══════════════════════════════════════════════════════════
# Daily Learning Plan Endpoints
# ═══════════════════════════════════════════════════════════

import json
import random
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import LearningPlanTemplate, DailyPlan

DAYS_CN = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

# ── Activity Types ──
ACTIVITY_TYPES = {
    "grammar_review": {
        "label": "语法复习",
        "icon": "📝",
        "description": "复习本周语法知识点，做相关练习题",
        "route": "/practice",
    },
    "translation": {
        "label": "英汉互译",
        "icon": "🔄",
        "description": "英译汉和汉译英翻译练习",
        "route": "/practice",
    },
    "reading": {
        "label": "外刊精读",
        "icon": "📖",
        "description": "阅读英文文章，完成阅读理解题",
        "route": "/practice",
    },
    "encyclopedia": {
        "label": "百科知识",
        "icon": "💡",
        "description": "汉语写作与百科知识练习（每周2次）",
        "route": "/practice",
    },
    "writing": {
        "label": "写作练习",
        "icon": "✍️",
        "description": "中英文写作练习",
        "route": "/practice",
    },
    "review": {
        "label": "周日复盘",
        "icon": "🔍",
        "description": "回顾本周学习内容，总结错题",
        "route": "/dashboard",
    },
}

# Default weekly schedule (MTI study plan)
DEFAULT_WEEKLY_SCHEDULE = {
    "monday": ["grammar_review", "translation"],
    "tuesday": ["grammar_review", "reading"],
    "wednesday": ["translation", "grammar_review"],
    "thursday": ["reading", "grammar_review"],
    "friday": ["translation", "grammar_review"],
    "saturday": ["encyclopedia", "writing"],
    "sunday": ["review"],
}


class TemplateUpdateRequest(BaseModel):
    weekly_schedule: dict[str, list[str]] | None = None
    manual_activities: list[str] | None = None


def get_day_key():
    return DAYS_CN[datetime.now(timezone.utc).weekday()]


async def generate_ai_tasks_for_day(activities: list[str], user_id: str) -> list[dict]:
    """Generate detailed tasks using AI from activity types."""
    if not activities or not settings.DEEPSEEK_API_KEY:
        return [
            {
                "id": f"{user_id[:8]}_{act}_{datetime.now().strftime('%Y%m%d%H%M%S')}",
                "type": act,
                "label": ACTIVITY_TYPES.get(act, {}).get("label", act),
                "icon": ACTIVITY_TYPES.get(act, {}).get("icon", "📌"),
                "description": ACTIVITY_TYPES.get(act, {}).get("description", ""),
                "ai_generated": True,
                "completed": False,
                "route": ACTIVITY_TYPES.get(act, {}).get("route", "/practice"),
            }
            for act in activities
        ]

    import httpx

    activity_labels = [ACTIVITY_TYPES.get(a, {}).get("label", a) for a in activities]
    prompt = f"""用户今天的MTI备考学习任务：{', '.join(activity_labels)}。

请为每个活动生成具体的任务描述，例如：
- 语法复习：「复习定语从句用法，完成5道专项练习」
- 英汉互译：「完成1篇英译汉（科技类）+ 1篇汉译英（散文类）」
- 外刊精读：「精读1篇《经济学人》文章，标记生词和复杂句」

请以JSON数组格式输出，每个任务包含：label（任务名称，20字内）、description（具体描述，50字内）。只输出JSON，不要其他内容。"""

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.deepseek.com/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
                },
                json={
                    "model": "deepseek-chat",
                    "messages": [
                        {"role": "system", "content": "你是一个MTI备考学习规划助手，简洁高效，直接输出JSON数组。"},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.3,
                },
            )
            result = resp.json()
            content = result["choices"][0]["message"]["content"]
            start = content.index("[")
            end = content.rindex("]") + 1
            ai_tasks = json.loads(content[start:end])

            tasks = []
            for i, act in enumerate(activities):
                act_info = ACTIVITY_TYPES.get(act, {})
                ai_desc = ai_tasks[i] if i < len(ai_tasks) else {}
                tasks.append({
                    "id": f"{user_id[:8]}_{act}_{datetime.now().strftime('%Y%m%d%H%M%S')}_{i}",
                    "type": act,
                    "label": ai_desc.get("label", act_info.get("label", act)),
                    "icon": act_info.get("icon", "📌"),
                    "description": ai_desc.get("description", act_info.get("description", "")),
                    "ai_generated": True,
                    "completed": False,
                    "route": act_info.get("route", "/practice"),
                })
            return tasks
    except Exception:
        # Fallback: basic tasks without AI detail
        return [
            {
                "id": f"{user_id[:8]}_{act}_{datetime.now().strftime('%Y%m%d%H%M%S')}",
                "type": act,
                "label": ACTIVITY_TYPES.get(act, {}).get("label", act),
                "icon": ACTIVITY_TYPES.get(act, {}).get("icon", "📌"),
                "description": ACTIVITY_TYPES.get(act, {}).get("description", ""),
                "ai_generated": False,
                "completed": False,
                "route": ACTIVITY_TYPES.get(act, {}).get("route", "/practice"),
            }
            for act in activities
        ]


@router.get("/daily-plan")
async def get_daily_plan(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get today's learning plan, generating one if it doesn't exist."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Check if today's plan exists
    result = await db.execute(
        select(DailyPlan).where(
            and_(DailyPlan.user_id == user_id, DailyPlan.plan_date == today)
        )
    )
    plan = result.scalar_one_or_none()

    if plan:
        return ApiResponse.success(data={
            "id": plan.id,
            "plan_date": plan.plan_date,
            "tasks": json.loads(plan.tasks),
            "ai_note": plan.ai_note,
        })

    # Generate new plan from template
    tpl_result = await db.execute(
        select(LearningPlanTemplate).where(LearningPlanTemplate.user_id == user_id)
    )
    template = tpl_result.scalar_one_or_none()

    if template:
        schedule = json.loads(template.weekly_schedule or "{}")
        manual_acts = json.loads(template.manual_activities or "[]")
    else:
        schedule = DEFAULT_WEEKLY_SCHEDULE
        manual_acts = []

    day_key = get_day_key()
    activities = schedule.get(day_key, [])

    # Remove manual activities (user does these externally)
    ai_activities = [a for a in activities if a not in manual_acts]

    # Generate tasks
    tasks = await generate_ai_tasks_for_day(ai_activities, user_id)

    # Build AI note
    if len(activities) > len(ai_activities):
        manual_labels = [ACTIVITY_TYPES.get(a, {}).get("label", a) for a in manual_acts]
        ai_note = f"今日还需完成（自行在外部App完成）：{', '.join(manual_labels)}"
    else:
        ai_note = None

    # Save plan
    plan = DailyPlan(
        id=f"dp_{user_id[:8]}_{today.replace('-', '')}",
        user_id=user_id,
        plan_date=today,
        tasks=json.dumps(tasks, ensure_ascii=False),
        ai_note=ai_note,
    )
    db.add(plan)
    await db.commit()
    await db.refresh(plan)

    return ApiResponse.success(data={
        "id": plan.id,
        "plan_date": plan.plan_date,
        "tasks": tasks,
        "ai_note": ai_note,
    })


class TaskToggleRequest(BaseModel):
    completed: bool


@router.patch("/daily-plan/tasks/{task_id}")
async def toggle_task(
    task_id: str,
    body: TaskToggleRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Toggle a task's completion status."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    result = await db.execute(
        select(DailyPlan).where(
            and_(DailyPlan.user_id == user_id, DailyPlan.plan_date == today)
        )
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="今日计划不存在")

    tasks = json.loads(plan.tasks)
    found = False
    for t in tasks:
        if t["id"] == task_id:
            t["completed"] = body.completed
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail="任务不存在")

    plan.tasks = json.dumps(tasks, ensure_ascii=False)
    await db.commit()

    return ApiResponse.success(data={"task_id": task_id, "completed": body.completed})


@router.get("/learning-plan/template")
async def get_template(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get user's weekly learning plan template."""
    result = await db.execute(
        select(LearningPlanTemplate).where(LearningPlanTemplate.user_id == user_id)
    )
    template = result.scalar_one_or_none()

    if template:
        return ApiResponse.success(data={
            "weekly_schedule": json.loads(template.weekly_schedule),
            "manual_activities": json.loads(template.manual_activities),
        })

    return ApiResponse.success(data={
        "weekly_schedule": DEFAULT_WEEKLY_SCHEDULE,
        "manual_activities": [],
    })


@router.put("/learning-plan/template")
async def update_template(
    body: TemplateUpdateRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Update user's weekly learning plan template."""
    result = await db.execute(
        select(LearningPlanTemplate).where(LearningPlanTemplate.user_id == user_id)
    )
    template = result.scalar_one_or_none()

    if template:
        if body.weekly_schedule is not None:
            template.weekly_schedule = json.dumps(body.weekly_schedule, ensure_ascii=False)
        if body.manual_activities is not None:
            template.manual_activities = json.dumps(body.manual_activities, ensure_ascii=False)
    else:
        template = LearningPlanTemplate(
            id=f"lpt_{user_id[:8]}",
            user_id=user_id,
            weekly_schedule=json.dumps(body.weekly_schedule or DEFAULT_WEEKLY_SCHEDULE, ensure_ascii=False),
            manual_activities=json.dumps(body.manual_activities or [], ensure_ascii=False),
        )
        db.add(template)

    await db.commit()

    return ApiResponse.success(message="模板已更新")
