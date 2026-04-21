import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.response import ApiResponse
from app.core.security import decode_access_token, oauth2_scheme
from app.core.config import get_settings
from app.models.models import CourseNote
from app.schemas.schemas import CourseNoteCreate, CourseNoteOut

router = APIRouter()
settings = get_settings()


async def get_current_user_id(token: str = Depends(oauth2_scheme)) -> str:
    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="无效的认证")
    return user_id


# ═══════════════════════════════════════
# Course Notes CRUD
# ═══════════════════════════════════════

@router.post("/", status_code=201)
async def create_note(
    body: CourseNoteCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    note = CourseNote(
        user_id=user_id,
        title=body.title,
        raw_transcript=body.raw_transcript,
        cleaned_text=body.cleaned_text,
        structured_notes=body.structured_notes,
        summary=body.summary,
        course_name=body.course_name,
        duration_seconds=body.duration_seconds,
    )
    db.add(note)
    await db.flush()
    await db.refresh(note)
    return ApiResponse.success(data=CourseNoteOut.model_validate(note).model_dump())


@router.get("/")
async def list_notes(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    course_name: str | None = None,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    query = select(CourseNote).where(CourseNote.user_id == user_id)
    count_query = select(func.count()).select_from(CourseNote).where(CourseNote.user_id == user_id)

    if course_name:
        query = query.where(CourseNote.course_name == course_name)
        count_query = count_query.where(CourseNote.course_name == course_name)

    total = (await db.execute(count_query)).scalar()
    notes = (await db.execute(
        query.order_by(CourseNote.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()

    return ApiResponse.success(data={
        "items": [CourseNoteOut.model_validate(n).model_dump() for n in notes],
        "total": total,
        "page": page,
        "page_size": page_size,
    })


@router.get("/courses")
async def list_course_names(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get distinct course names for filtering."""
    result = await db.execute(
        select(CourseNote.course_name)
        .where(and_(CourseNote.user_id == user_id, CourseNote.course_name.isnot(None)))
        .distinct()
    )
    names = [row[0] for row in result.all() if row[0]]
    return ApiResponse.success(data=names)


@router.get("/{note_id}")
async def get_note(
    note_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CourseNote).where(and_(CourseNote.id == note_id, CourseNote.user_id == user_id))
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在")
    return ApiResponse.success(data=CourseNoteOut.model_validate(note).model_dump())


@router.put("/{note_id}")
async def update_note(
    note_id: str,
    body: CourseNoteCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CourseNote).where(and_(CourseNote.id == note_id, CourseNote.user_id == user_id))
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(note, key, value)

    await db.flush()
    await db.refresh(note)
    return ApiResponse.success(data=CourseNoteOut.model_validate(note).model_dump())


@router.delete("/{note_id}")
async def delete_note(
    note_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CourseNote).where(and_(CourseNote.id == note_id, CourseNote.user_id == user_id))
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在")
    await db.delete(note)
    return ApiResponse.success(message="已删除")


# ═══════════════════════════════════════
# AI Services
# ═══════════════════════════════════════

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


@router.post("/ai/clean-text")
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


@router.post("/ai/generate-notes")
async def generate_notes(
    body: GenerateNotesRequest,
    token: str = Depends(oauth2_scheme),
):
    """Generate structured notes from transcript using Deepseek LLM."""
    if not settings.DEEPSEEK_API_KEY:
        return ApiResponse.success(data={"structured_notes": "", "summary": "AI API key not configured", "cleaned_text": body.text})
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
        return ApiResponse.success(data={"structured_notes": notes})


@router.post("/ai/generate-cards")
async def generate_cards(
    body: GenerateCardsRequest,
    token: str = Depends(oauth2_scheme),
):
    """Generate memory cards from text using AI."""
    if not settings.DEEPSEEK_API_KEY:
        return ApiResponse.success(data={"cards": [], "note": "AI API key not configured"})
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
        result = resp.json()
        content = result["choices"][0]["message"]["content"]

        try:
            start = content.index("[")
            end = content.rindex("]") + 1
            cards = json.loads(content[start:end])
        except (ValueError, json.JSONDecodeError):
            cards = []

        return ApiResponse.success(data={"cards": cards})


@router.post("/ai/chat")
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
    # Add history
    for msg in body.history[-10:]:  # Keep last 10 messages
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
