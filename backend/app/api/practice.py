"""Practice module — AI-powered practice question generation and quizzing."""

import json
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.response import ApiResponse
from app.core.security import oauth2_scheme, decode_access_token
from app.models.models import PracticeSet, PracticeQuestion, PracticeAnswer

router = APIRouter()
_settings = get_settings()


async def get_current_user_id(token: str = Depends(oauth2_scheme)) -> str:
    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user_id


# ── Schemas ──

class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=2, description="Natural language description of what to practice")
    goal: str | None = Field(None, description="User's study goal, e.g. MTI翻硕, 专四, 考研英语")


class AnswerRequest(BaseModel):
    question_id: str
    session_id: str
    user_answer: str = ""
    think_time_ms: int = 0


class ExplainRequest(BaseModel):
    question_id: str
    user_answer: str = ""


class TutorMessage(BaseModel):
    role: str = "user"  # "user" or "assistant"
    content: str


class TutorRequest(BaseModel):
    message: str = Field(..., min_length=1)
    history: list[TutorMessage] = Field(default_factory=list)
    # Question context (for per-question tutoring during quiz)
    question_id: str | None = None
    question_text: str | None = None
    user_answer: str | None = None
    correct_answer: str | None = None
    explanation: str | None = None
    # Quiz context (for post-quiz chat)
    wrong_questions: list[dict] | None = None  # [{question, user_answer, correct_answer, explanation}]
    quiz_title: str | None = None


# ── Generate Questions ──

@router.post("/generate")
async def generate_questions(
    body: GenerateRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Generate practice questions from natural language description."""
    if not _settings.DEEPSEEK_API_KEY:
        return ApiResponse.success(data={"error": "no_api_key"})

    # Fetch user's weak topics for context
    weak_result = await db.execute(
        select(PracticeQuestion.topic, func.sum(PracticeQuestion.wrong_count).label("cnt"))
        .where(and_(PracticeQuestion.user_id == user_id, PracticeQuestion.wrong_count > 0))
        .group_by(PracticeQuestion.topic)
        .order_by(desc("cnt"))
        .limit(5)
    )
    weak_topics = [r.topic for r in weak_result.all() if r.topic]

    weak_context = f"\n\n## 用户薄弱知识点\n{', '.join(weak_topics)}" if weak_topics else ""
    goal_context = f"\n\n## 用户备考目标\n{body.goal}" if body.goal else ""

    prompt = f"""你是一个英语考试练习题生成器。根据用户的描述生成高质量练习题。

## 用户需求
{body.prompt}
{goal_context}
{weak_context}

## 要求
- 根据用户描述推断题型、难度、数量（用户没说的就自行合理决定）
- 题目要高质量、贴近真实考试（专四专八/考研英语水平）
- 返回 JSON 数组，每个元素是一道题：
{{
  "question": "题目文本",
  "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
  "answer": "正确答案（选择题写选项字母如A，填空题写完整答案）",
  "explanation": "简要解析（40字以内）",
  "type": "multiple_choice|fill_blank|translation|correction",
  "category": "语法|阅读|翻译|词汇|百科",
  "topic": "具体考点名称"
}}
- 填空题 options 为空数组 []
- 翻译题/改错题 options 为空数组 []
- 只返回 JSON 数组，不要其他内容"""

    import httpx
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://api.deepseek.com/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {_settings.DEEPSEEK_API_KEY}",
                },
                json={
                    "model": "deepseek-chat",
                    "messages": [
                        {"role": "system", "content": "你是一个专业的英语考试练习题生成器，只返回 JSON 数组。"},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.8,
                },
            )
            result = resp.json()
            content = result["choices"][0]["message"]["content"].strip()
            if content.startswith("```"):
                content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            questions = json.loads(content)
            if not isinstance(questions, list):
                questions = [questions]

            # Create practice set
            set_id = str(uuid.uuid4())
            # Derive title from first question's topic or user prompt
            title = questions[0].get("topic", "练习") if questions else "练习"
            if len(questions) > 1:
                title = f"{title}专项练习（{len(questions)}题）"
            practice_set = PracticeSet(
                id=set_id, user_id=user_id, title=title,
                source="generate", source_ref=body.prompt,
                question_count=len(questions),
            )
            db.add(practice_set)

            # Create questions
            saved = []
            for i, q in enumerate(questions):
                pq = PracticeQuestion(
                    id=str(uuid.uuid4()),
                    user_id=user_id,
                    practice_set_id=set_id,
                    question_text=q.get("question", ""),
                    options=json.dumps(q.get("options", []), ensure_ascii=False) if q.get("options") else None,
                    answer=q.get("answer", ""),
                    explanation=q.get("explanation", ""),
                    question_type=q.get("type", "multiple_choice"),
                    category=q.get("category", "语法"),
                    topic=q.get("topic"),
                    difficulty=q.get("difficulty", 3),
                    sort_order=i,
                )
                db.add(pq)
                saved.append({
                    "id": pq.id,
                    "question": pq.question_text,
                    "options": q.get("options", []),
                    "answer": pq.answer,
                    "explanation": pq.explanation,
                    "type": pq.question_type,
                    "category": pq.category,
                    "topic": pq.topic,
                    "difficulty": pq.difficulty,
                })

            await db.commit()
            return ApiResponse.success(data={
                "set_id": set_id,
                "title": title,
                "count": len(saved),
                "questions": saved,
            })
    except Exception as e:
        return ApiResponse.success(data={"error": "llm_error", "detail": str(e)})


# ── Get Practice Sets ──

@router.get("/sets")
async def get_practice_sets(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PracticeSet)
        .where(PracticeSet.user_id == user_id)
        .order_by(desc(PracticeSet.created_at))
        .limit(50)
    )
    sets = result.scalars().all()
    return ApiResponse.success(data={
        "items": [{
            "id": s.id,
            "title": s.title,
            "description": s.description,
            "source": s.source,
            "question_count": s.question_count,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        } for s in sets]
    })


# ── Get Questions in a Set ──

@router.get("/sets/{set_id}/questions")
async def get_set_questions(
    set_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PracticeQuestion)
        .where(and_(PracticeQuestion.practice_set_id == set_id, PracticeQuestion.user_id == user_id))
        .order_by(PracticeQuestion.sort_order)
    )
    questions = result.scalars().all()
    return ApiResponse.success(data={
        "items": [{
            "id": q.id,
            "question": q.question_text,
            "options": json.loads(q.options) if q.options else None,
            "answer": q.answer,
            "explanation": q.explanation,
            "question_type": q.question_type,
            "category": q.category,
            "topic": q.topic,
            "difficulty": q.difficulty,
            "confidence": round(q.confidence or 0, 1),
            "review_count": q.review_count,
            "wrong_count": q.wrong_count,
        } for q in questions]
    })


# ── Submit Answer ──

@router.post("/answer")
async def submit_answer(
    body: AnswerRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    # Get question
    result = await db.execute(
        select(PracticeQuestion).where(
            and_(PracticeQuestion.id == body.question_id, PracticeQuestion.user_id == user_id)
        )
    )
    question = result.scalar_one_or_none()
    if not question:
        return ApiResponse.success(data={"error": "question_not_found"})

    # Check answer
    user_ans = body.user_answer.strip()
    correct_ans = question.answer.strip()
    is_correct = _check_answer(user_ans, correct_ans, question.question_type)

    # Update question stats
    conf_before = question.confidence or 0.0
    if is_correct:
        question.confidence = min(100, conf_before + 15)
        question.review_count = (question.review_count or 0) + 1
    else:
        question.confidence = max(0, conf_before - 10)
        question.wrong_count = (question.wrong_count or 0) + 1
        question.review_count = (question.review_count or 0) + 1
        question.last_wrong_reason = "wrong_answer"

    # Schedule next review (simple interval)
    interval = 1 if is_correct else 0.5  # days
    if question.review_count > 3:
        interval = 3 if is_correct else 1
    if question.review_count > 7:
        interval = 7 if is_correct else 2
    question.next_review = datetime.now(timezone.utc) + timedelta(days=interval)

    # Record answer
    answer = PracticeAnswer(
        id=str(uuid.uuid4()),
        question_id=body.question_id,
        user_id=user_id,
        session_id=body.session_id,
        user_answer=user_ans,
        is_correct=is_correct,
        think_time_ms=body.think_time_ms,
        confidence_before=conf_before,
        confidence_after=question.confidence,
    )
    db.add(answer)
    await db.commit()

    return ApiResponse.success(data={
        "is_correct": is_correct,
        "correct_answer": correct_ans,
        "explanation": question.explanation,
        "confidence_after": round(question.confidence, 1),
    })


# ── AI Explain ──

@router.post("/explain")
async def explain_question(
    body: ExplainRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get AI explanation for a question, optionally analyzing user's wrong answer."""
    result = await db.execute(
        select(PracticeQuestion).where(
            and_(PracticeQuestion.id == body.question_id, PracticeQuestion.user_id == user_id)
        )
    )
    question = result.scalar_one_or_none()
    if not question:
        return ApiResponse.success(data={"error": "question_not_found"})

    # If question already has explanation and no user answer, return it directly
    if question.explanation and not body.user_answer:
        return ApiResponse.success(data={"explanation": question.explanation})

    if not _settings.DEEPSEEK_API_KEY:
        return ApiResponse.success(data={"explanation": question.explanation or "暂无解析"})

    user_context = ""
    if body.user_answer:
        user_context = f"\n\n## 用户的答案\n{body.user_answer}\n\n请分析用户的答案为什么错，指出具体错误点，然后给出正确答案的详细解析。"

    prompt = f"""请详细解析这道题：

## 题目
{question.question_text}

## 选项
{question.options or '无选项'}

## 正确答案
{question.answer}
{user_context}

## 要求
- 解析要清晰易懂
- 如果用户答错了，指出错误原因
- 举一反三：给出一个同考点的变体例句（一句话即可）
- 控制在 100 字以内

只返回解析文本，不要其他格式。"""

    import httpx
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.deepseek.com/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {_settings.DEEPSEEK_API_KEY}",
                },
                json={
                    "model": "deepseek-chat",
                    "messages": [
                        {"role": "system", "content": "你是一个英语学习助手，解析简洁专业。"},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.3,
                },
            )
            result = resp.json()
            explanation = result["choices"][0]["message"]["content"].strip()
            return ApiResponse.success(data={"explanation": explanation})
    except Exception:
        return ApiResponse.success(data={"explanation": question.explanation or "解析生成失败"})


# ── AI Tutor (multi-turn) ──

@router.post("/tutor")
async def ai_tutor(
    body: TutorRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Multi-turn AI tutoring. Supports per-question context and post-quiz discussion."""
    if not _settings.DEEPSEEK_API_KEY:
        return ApiResponse.success(data={"content": "AI 辅导功能暂不可用，请检查 API 配置。"})

    # Build system prompt with context
    system_parts = [
        "你是一位专业的英语学习辅导老师。你的任务是帮助学生理解他们做错的题目，深入分析错误原因，并帮助他们真正掌握相关知识点。",
        "",
        "## 辅导原则",
        "- 不要只给答案，要引导学生思考",
        "- 分析错误根因：是知识点盲区、粗心、还是理解偏差？",
        "- 用简洁易懂的语言解释",
        "- 适当举一反三，给出同考点的变体",
        "- 如果学生追问，耐心解答，不要敷衍",
        "- 回复控制在 200 字以内，除非学生要求详细解释",
    ]

    # Add question context if provided
    if body.question_text:
        system_parts.extend([
            "",
            "## 当前讨论的题目",
            f"题目：{body.question_text}",
        ])
        if body.user_answer:
            system_parts.append(f"学生的答案：{body.user_answer}")
        if body.correct_answer:
            system_parts.append(f"正确答案：{body.correct_answer}")
        if body.explanation:
            system_parts.append(f"参考解析：{body.explanation}")

    # Add quiz context if provided (post-quiz discussion)
    if body.wrong_questions:
        system_parts.extend([
            "",
            f"## 最近一次练习：{body.quiz_title or '练习'}",
            f"学生共错了 {len(body.wrong_questions)} 道题：",
        ])
        for i, wq in enumerate(body.wrong_questions, 1):
            system_parts.append(
                f"{i}. 题目：{wq.get('question', '')[:80]}… "
                f"学生答：{wq.get('user_answer', '')} "
                f"正确答案：{wq.get('correct_answer', '')}"
            )
        system_parts.extend([
            "",
            "学生可能想讨论其中某道错题，或者想了解整体薄弱点。请根据学生的问题灵活回应。",
        ])

    system_prompt = "\n".join(system_parts)

    # Build messages array with history
    messages = [{"role": "system", "content": system_prompt}]
    for msg in body.history:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": body.message})

    import httpx
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.deepseek.com/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {_settings.DEEPSEEK_API_KEY}",
                },
                json={
                    "model": "deepseek-chat",
                    "messages": messages,
                    "temperature": 0.4,
                },
            )
            result = resp.json()
            content = result["choices"][0]["message"]["content"].strip()
            return ApiResponse.success(data={"content": content})
    except Exception as e:
        return ApiResponse.success(data={"content": f"AI 辅导暂时不可用：{str(e)}"})


# ── Stats ──

@router.get("/stats")
async def get_practice_stats(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get practice statistics for the user."""
    # Total questions
    total_q = await db.execute(
        select(func.count()).select_from(PracticeQuestion).where(PracticeQuestion.user_id == user_id)
    )
    total_questions = total_q.scalar() or 0

    # Total answers
    total_a = await db.execute(
        select(func.count()).select_from(PracticeAnswer).where(PracticeAnswer.user_id == user_id)
    )
    total_answers = total_a.scalar() or 0

    # Correct answers
    correct_a = await db.execute(
        select(func.count()).select_from(PracticeAnswer).where(
            and_(PracticeAnswer.user_id == user_id, PracticeAnswer.is_correct == True)
        )
    )
    correct_answers = correct_a.scalar() or 0

    # Weak topics
    weak_result = await db.execute(
        select(PracticeQuestion.topic, func.count().label("cnt"))
        .join(PracticeAnswer, PracticeAnswer.question_id == PracticeQuestion.id)
        .where(and_(PracticeAnswer.user_id == user_id, PracticeAnswer.is_correct == False))
        .group_by(PracticeQuestion.topic)
        .order_by(desc("cnt"))
        .limit(5)
    )
    weak_topics = [{"topic": r.topic, "wrong_count": r.cnt} for r in weak_result.all() if r.topic]

    # Category distribution
    cat_result = await db.execute(
        select(PracticeQuestion.category, func.count().label("cnt"))
        .where(PracticeQuestion.user_id == user_id)
        .group_by(PracticeQuestion.category)
    )
    categories = [{"category": r.category, "count": r.cnt} for r in cat_result.all()]

    return ApiResponse.success(data={
        "total_questions": total_questions,
        "total_answers": total_answers,
        "correct_answers": correct_answers,
        "accuracy": round(correct_answers / total_answers * 100, 1) if total_answers > 0 else 0,
        "weak_topics": weak_topics,
        "categories": categories,
    })


# ── Practice History ──

@router.get("/history")
async def get_practice_history(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get all practice sessions with stats."""
    result = await db.execute(
        select(PracticeSet)
        .where(PracticeSet.user_id == user_id)
        .order_by(desc(PracticeSet.created_at))
        .limit(50)
    )
    sets = result.scalars().all()
    history = []
    for s in sets:
        ans_result = await db.execute(
            select(func.count(), func.sum(func.cast(PracticeAnswer.is_correct, Integer)))
            .where(PracticeAnswer.session_id == s.id)
        )
        row = ans_result.one()
        total = row[0] or 0
        correct = row[1] or 0
        history.append({
            "set_id": s.id,
            "title": s.title,
            "question_count": s.question_count,
            "total_answered": total,
            "correct_count": correct,
            "accuracy": round(correct / total * 100, 1) if total > 0 else 0,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        })
    return ApiResponse.success(data=history)


# ── Wrong Questions ──

@router.get("/wrong")
async def get_wrong_questions(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get all questions the user has answered wrong at least once."""
    wrong_ids_result = await db.execute(
        select(PracticeAnswer.question_id)
        .where(and_(PracticeAnswer.user_id == user_id, PracticeAnswer.is_correct == False))
        .distinct()
    )
    wrong_ids = [row[0] for row in wrong_ids_result.all()]
    if not wrong_ids:
        return ApiResponse.success(data=[])

    questions_result = await db.execute(
        select(PracticeQuestion)
        .where(PracticeQuestion.id.in_(wrong_ids))
        .order_by(desc(PracticeQuestion.created_at))
    )
    questions = questions_result.scalars().all()
    items = []
    for q in questions:
        items.append({
            "id": q.id,
            "question": q.question_text,
            "options": json.loads(q.options) if q.options else None,
            "answer": q.answer,
            "explanation": q.explanation,
            "type": q.question_type,
            "category": q.category,
            "topic": q.topic,
            "difficulty": q.difficulty,
            "wrong_count": q.wrong_count or 0,
        })
    return ApiResponse.success(data=items)


# ── Helpers ──

def _check_answer(user_ans: str, correct_ans: str, q_type: str) -> bool:
    """Check if user's answer is correct."""
    if not user_ans:
        return False
    ua = user_ans.strip().lower().rstrip(".")
    ca = correct_ans.strip().lower().rstrip(".")
    # Direct match
    if ua == ca:
        return True
    # Match option letter (A, B, C, D)
    if len(ua) == 1 and ua.isalpha():
        if ca.startswith(ua) or ca.startswith(f"{ua}.") or ca.startswith(f"{ua} "):
            return True
    # Match option text
    if ca.startswith(ua) or ua.startswith(ca):
        return True
    return False
