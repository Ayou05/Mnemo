import json
import logging
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.response import ApiResponse
from app.core.security import decode_access_token, oauth2_scheme
from app.api.import_cards import parse_plain_text_cards
from app.models.models import (
    User, Task, DailyCheckin, CardEncounter,
    MemoryCard, PracticeQuestion, PracticeAnswer,
)

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)


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


# ═══════════════════════════════════════
# Learning Summary Endpoints (LLM-powered)
# ═══════════════════════════════════════

@router.post("/daily-summary")
async def daily_summary(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a natural language summary of today's learning activity.
    Uses DeepSeek LLM to create a personalized daily learning report.
    """
    user_id = await get_current_user_id(token)
    today = date.today()
    today_str = today.isoformat()

    try:
        # 1. Memory card encounters today
        card_result = await db.execute(
            select(
                func.count(CardEncounter.id).label("total"),
                func.sum(func.cast(CardEncounter.result == "remembered", int)).label("remembered"),
                func.sum(func.cast(CardEncounter.result == "fuzzy", int)).label("fuzzy"),
                func.sum(func.cast(CardEncounter.result == "forgot", int)).label("forgot"),
                func.avg(CardEncounter.confidence_after).label("avg_confidence"),
            ).where(
                and_(
                    CardEncounter.user_id == user_id,
                    func.date(CardEncounter.created_at) == today,
                )
            )
        )
        card_stats = card_result.one()

        # 2. Practice answers today
        practice_result = await db.execute(
            select(
                func.count(PracticeAnswer.id).label("total"),
                func.sum(func.cast(PracticeAnswer.is_correct == True, int)).label("correct"),
            ).where(
                and_(
                    PracticeAnswer.user_id == user_id,
                    func.date(PracticeAnswer.created_at) == today,
                )
            )
        )
        practice_stats = practice_result.one()

        # 3. Tasks completed today
        task_result = await db.execute(
            select(func.count(Task.id)).where(
                and_(
                    Task.user_id == user_id,
                    func.date(Task.completed_at) == today,
                )
            )
        )
        tasks_completed = task_result.scalar() or 0

        # 4. Weak topics from wrong answers today
        wrong_result = await db.execute(
            select(
                PracticeQuestion.topic,
                func.count(PracticeAnswer.id).label("wrong_count"),
            ).join(
                PracticeAnswer, PracticeAnswer.question_id == PracticeQuestion.id
            ).where(
                and_(
                    PracticeAnswer.user_id == user_id,
                    PracticeAnswer.is_correct == False,
                    func.date(PracticeAnswer.created_at) == today,
                    PracticeQuestion.topic != None,
                )
            ).group_by(PracticeQuestion.topic).order_by(
                func.count(PracticeAnswer.id).desc()
            ).limit(5)
        )
        weak_topics = [row.topic for row in wrong_result.all()]

        # 5. Checkin data
        checkin_result = await db.execute(
            select(DailyCheckin).where(
                and_(
                    DailyCheckin.user_id == user_id,
                    DailyCheckin.checkin_date == today_str,
                )
            )
        )
        checkin = checkin_result.scalar_one_or_none()

        total_cards = card_stats.total or 0
        total_practice = practice_stats.total or 0
        practice_correct = practice_stats.correct or 0

        # No activity today
        if total_cards == 0 and total_practice == 0 and tasks_completed == 0:
            return ApiResponse.success(data={
                "date": today_str,
                "summary": f"今天（{today_str}）还没有学习记录哦。抽空复习一下记忆卡片，或者做几道练习题，AI 会为你生成详细的学习报告。",
                "highlights": [],
                "suggestions": ["开始今天的记忆卡片复习", "做一套练习题检验学习效果"],
                "has_activity": False,
            })

        # Build data summary for LLM
        remembered = card_stats.remembered or 0
        fuzzy = card_stats.fuzzy or 0
        forgot = card_stats.forgot or 0
        card_rate = round(remembered / total_cards * 100) if total_cards > 0 else 0
        practice_rate = round(practice_correct / total_practice * 100) if total_practice > 0 else 0
        study_minutes = checkin.study_minutes if checkin else 0
        cards_reviewed = checkin.cards_reviewed if checkin else total_cards

        # Call DeepSeek for natural language summary
        if not settings.DEEPSEEK_API_KEY:
            return ApiResponse.success(data={
                "date": today_str,
                "summary": _build_fallback_summary(
                    today_str, total_cards, card_rate, total_practice,
                    practice_rate, tasks_completed, weak_topics
                ),
                "highlights": [],
                "suggestions": weak_topics[:3] if weak_topics else [],
                "has_activity": True,
            })

        prompt = _build_daily_summary_prompt(
            today_str, cards_reviewed, remembered, fuzzy, forgot,
            total_practice, practice_correct, tasks_completed,
            weak_topics, study_minutes
        )

        import httpx
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.deepseek.com/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
                },
                json={
                    "model": "deepseek-chat",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.4,
                    "max_tokens": 400,
                },
            )
            result = resp.json()
            summary = result["choices"][0]["message"]["content"].strip()

        return ApiResponse.success(data={
            "date": today_str,
            "summary": summary,
            "highlights": _extract_highlights(
                total_cards, card_rate, total_practice, practice_rate,
                tasks_completed, remembered, weak_topics
            ),
            "suggestions": weak_topics[:3] if weak_topics else ["继续复习，保持节奏"],
            "has_activity": True,
        })

    except Exception as e:
        logger.error(f"daily-summary failed: {e}")
        return ApiResponse.success(data={
            "date": today.isoformat(),
            "summary": "今天的学习总结暂时无法生成，请稍后再试。",
            "highlights": [],
            "suggestions": [],
            "has_activity": False,
        })


@router.post("/weekly-report")
async def weekly_report(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a weekly learning report with AI insights.
    Shows progress, weak areas, and personalized suggestions for next week.
    """
    user_id = await get_current_user_id(token)
    today = date.today()
    week_ago = today - timedelta(days=6)
    week_ago_str = week_ago.isoformat()
    today_str = today.isoformat()

    try:
        # Memory encounters this week
        card_result = await db.execute(
            select(
                func.count(CardEncounter.id).label("total"),
                func.sum(func.cast(CardEncounter.result == "remembered", int)).label("remembered"),
                func.sum(func.cast(CardEncounter.result == "fuzzy", int)).label("fuzzy"),
                func.sum(func.cast(CardEncounter.result == "forgot", int)).label("forgot"),
                func.avg(CardEncounter.confidence_after).label("avg_confidence"),
            ).where(
                and_(
                    CardEncounter.user_id == user_id,
                    func.date(CardEncounter.created_at) >= week_ago,
                    func.date(CardEncounter.created_at) <= today,
                )
            )
        )
        card_stats = card_result.one()

        # Practice answers this week
        practice_result = await db.execute(
            select(
                func.count(PracticeAnswer.id).label("total"),
                func.sum(func.cast(PracticeAnswer.is_correct == True, int)).label("correct"),
            ).where(
                and_(
                    PracticeAnswer.user_id == user_id,
                    func.date(PracticeAnswer.created_at) >= week_ago,
                    func.date(PracticeAnswer.created_at) <= today,
                )
            )
        )
        practice_stats = practice_result.one()

        # Tasks completed this week
        task_result = await db.execute(
            select(func.count(Task.id)).where(
                and_(
                    Task.user_id == user_id,
                    func.date(Task.completed_at) >= week_ago,
                    func.date(Task.completed_at) <= today,
                )
            )
        )
        tasks_completed = task_result.scalar() or 0

        # Weak topics this week
        wrong_result = await db.execute(
            select(
                PracticeQuestion.topic,
                func.count(PracticeAnswer.id).label("wrong_count"),
            ).join(
                PracticeAnswer, PracticeAnswer.question_id == PracticeQuestion.id
            ).where(
                and_(
                    PracticeAnswer.user_id == user_id,
                    PracticeAnswer.is_correct == False,
                    func.date(PracticeAnswer.created_at) >= week_ago,
                    func.date(PracticeAnswer.created_at) <= today,
                    PracticeQuestion.topic != None,
                )
            ).group_by(PracticeQuestion.topic).order_by(
                func.count(PracticeAnswer.id).desc()
            ).limit(5)
        )
        weak_topics = [row.topic for row in wrong_result.all()]

        # Daily checkins this week
        checkin_result = await db.execute(
            select(DailyCheckin).where(
                and_(
                    DailyCheckin.user_id == user_id,
                    DailyCheckin.checkin_date >= week_ago_str,
                    DailyCheckin.checkin_date <= today_str,
                )
            ).order_by(DailyCheckin.checkin_date)
        )
        checkins = checkin_result.scalars().all()

        # Study streak
        study_days = len([c for c in checkins if (c.cards_reviewed or 0) > 0 or (c.study_minutes or 0) > 0])
        total_minutes = sum(c.study_minutes or 0 for c in checkins)
        total_cards = sum(c.cards_reviewed or 0 for c in checkins)
        days_with_practice = len([c for c in checkins if c.notes_count and c.notes_count > 0])

        total_card_reviews = card_stats.total or 0
        total_practice = practice_stats.total or 0
        practice_correct = practice_stats.correct or 0
        remembered = card_stats.remembered or 0
        fuzzy = card_stats.fuzzy or 0

        card_rate = round(remembered / total_card_reviews * 100) if total_card_reviews > 0 else 0
        practice_rate = round(practice_correct / total_practice * 100) if total_practice > 0 else 0

        if total_card_reviews == 0 and total_practice == 0:
            return ApiResponse.success(data={
                "start_date": week_ago_str,
                "end_date": today_str,
                "report": f"本周（{week_ago_str} 至 {today_str}）还没有学习记录哦。从今天开始，每天坚持一点点，AI 会记录你的进步轨迹！",
                "progress": {"memory_mastery": "N/A", "practice_accuracy": "N/A", "tasks_completed": f"{tasks_completed}"},
                "weak_topics": [],
                "next_week_suggestions": ["开始记忆卡片复习", "每天完成一些练习题"],
                "has_activity": False,
            })

        if not settings.DEEPSEEK_API_KEY:
            return ApiResponse.success(data={
                "start_date": week_ago_str,
                "end_date": today_str,
                "report": _build_fallback_weekly(week_ago_str, today_str, total_card_reviews,
                    card_rate, total_practice, practice_rate, tasks_completed,
                    study_days, weak_topics),
                "progress": {
                    "memory_mastery": f"{card_rate}%",
                    "practice_accuracy": f"{practice_rate}%" if total_practice > 0 else "N/A",
                    "tasks_completed": str(tasks_completed),
                },
                "weak_topics": weak_topics,
                "next_week_suggestions": _suggest_next_week(weak_topics),
                "has_activity": True,
            })

        prompt = _build_weekly_report_prompt(
            week_ago_str, today_str,
            total_card_reviews, remembered, fuzzy,
            total_practice, practice_correct,
            tasks_completed, study_days, total_minutes,
            weak_topics, checkins
        )

        import httpx
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.deepseek.com/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
                },
                json={
                    "model": "deepseek-chat",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.4,
                    "max_tokens": 500,
                },
            )
            result = resp.json()
            report = result["choices"][0]["message"]["content"].strip()

        return ApiResponse.success(data={
            "start_date": week_ago_str,
            "end_date": today_str,
            "report": report,
            "progress": {
                "memory_mastery": f"{card_rate}%",
                "practice_accuracy": f"{practice_rate}%" if total_practice > 0 else "N/A",
                "tasks_completed": str(tasks_completed),
            },
            "weak_topics": weak_topics,
            "next_week_suggestions": _suggest_next_week(weak_topics),
            "has_activity": True,
        })

    except Exception as e:
        logger.error(f"weekly-report failed: {e}")
        return ApiResponse.success(data={
            "start_date": week_ago_str,
            "end_date": today_str,
            "report": "本周学习报告暂时无法生成，请稍后再试。",
            "progress": {},
            "weak_topics": [],
            "next_week_suggestions": [],
            "has_activity": False,
        })


# ── Prompt Builders ──

def _build_daily_summary_prompt(
    date_str: str,
    cards_reviewed: int, remembered: int, fuzzy: int, forgot: int,
    practice_total: int, practice_correct: int,
    tasks_completed: int,
    weak_topics: list[str],
    study_minutes: int,
) -> str:
    topics_str = "、".join(weak_topics) if weak_topics else "暂无"
    return f"""你是用户的私人学习教练，请根据以下今日学习数据，生成一段自然、温暖、有洞察力的学习日报。

日期：{date_str}
记忆卡片：复习 {cards_reviewed} 张（记住 {remembered}，模糊 {fuzzy}，忘记 {forgot}）
练习题目：完成 {practice_total} 道，正确 {practice_correct} 道
完成任务：{tasks_completed} 个
学习时长：{study_minutes} 分钟
薄弱知识点：{topics_str}

要求：
1. 自然语言，像私教在跟你说话，不要干巴巴的数据罗列
2. 提及具体数字，但用叙述的方式
3. 提到薄弱知识点时，给出简短的复习建议
4. 语气鼓励、积极，但不过度夸张
5. 150-250字，直接输出报告正文
6. 用第二人称"你"来称呼用户"""


def _build_weekly_report_prompt(
    start_str: str, end_str: str,
    cards_total: int, remembered: int, fuzzy: int,
    practice_total: int, practice_correct: int,
    tasks_completed: int, study_days: int, total_minutes: int,
    weak_topics: list[str],
    checkins: list,
) -> str:
    topics_str = "、".join(weak_topics) if weak_topics else "暂无明显薄弱点"
    return f"""你是用户的私人学习教练，请根据本周学习数据，生成一份有深度、有洞察的周报。

时间范围：{start_str} 至 {end_str}
记忆卡片：共复习 {cards_total} 张（记住 {remembered} 张，模糊 {fuzzy} 张）
练习题目：共 {practice_total} 道，正确 {practice_correct} 道
完成任务：{tasks_completed} 个
学习天数：{study_days} 天，总学习时长 {total_minutes} 分钟
薄弱知识点：{topics_str}

要求：
1. 像一个了解你学习情况的私教在跟你对话
2. 适当引用具体数字，但用自然叙述，不要表格或列表
3. 分析本周表现：哪里进步了，哪里还需要加强
4. 给出下周具体的、可操作的学习建议（2-3条）
5. 提到薄弱知识点时，给出重点复习方向
6. 语气：专业、温暖、鼓励
7. 250-350字，直接输出报告正文
8. 用第二人称"你"来称呼用户"""


# ── Fallback (no LLM) ──

def _build_fallback_summary(
    date_str: str,
    cards_total: int, card_rate: int,
    practice_total: int, practice_rate: int,
    tasks_completed: int, weak_topics: list[str],
) -> str:
    topics_str = "、".join(weak_topics[:3]) if weak_topics else "暂无"
    return (f"今天（{date_str}）你复习了 {cards_total} 张记忆卡片，"
            f"记忆正确率约 {card_rate}%，完成 {tasks_completed} 个任务。"
            f"练习了 {practice_total} 道题，正确率 {practice_rate}%。"
            + (f"薄弱点：{topics_str}，建议明天重点复习。" if weak_topics else ""))


def _build_fallback_weekly(
    start_str: str, end_str: str,
    cards_total: int, card_rate: int,
    practice_total: int, practice_rate: int,
    tasks_completed: int, study_days: int,
    weak_topics: list[str],
) -> str:
    topics_str = "、".join(weak_topics[:3]) if weak_topics else "暂无明显薄弱"
    return (f"本周（{start_str} 至 {end_str}）你共学习了 {study_days} 天，"
            f"复习记忆卡片 {cards_total} 张（正确率约 {card_rate}%），"
            f"完成练习 {practice_total} 道（正确率 {practice_rate}%），"
            f"完成任务 {tasks_completed} 个。"
            + f"薄弱知识点：{topics_str}，下周建议重点突破。")


def _extract_highlights(
    cards: int, card_rate: int,
    practice: int, practice_rate: int,
    tasks: int, remembered: int,
    weak_topics: list[str],
) -> list[str]:
    highlights = []
    if cards > 0:
        highlights.append(f"复习{cards}张卡片")
    if remembered >= cards * 0.8 and cards > 10:
        highlights.append("记忆效果优秀 🏆")
    if practice > 0:
        highlights.append(f"完成{practice}道练习")
    if practice_rate >= 80 and practice >= 5:
        highlights.append("正确率超80% ✨")
    if tasks > 0:
        highlights.append(f"完成任务{tasks}个")
    if weak_topics:
        highlights.append(f"薄弱：{'、'.join(weak_topics[:2])}")
    return highlights[:4]


def _suggest_next_week(weak_topics: list[str]) -> list[str]:
    suggestions = []
    if weak_topics:
        suggestions.append(f"重点复习：{'、'.join(weak_topics[:2])}")
    suggestions.append("保持每日复习习惯")
    if len(weak_topics) >= 3:
        suggestions.append("增加练习题量，针对性突破")
    else:
        suggestions.append("适度拓展新题型")
    return suggestions[:3]
