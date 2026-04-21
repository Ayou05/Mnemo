import json
import re
from difflib import SequenceMatcher
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.response import ApiResponse
from app.core.security import decode_access_token, oauth2_scheme
from app.core.casr import process_encounter, get_evolution_mode
from app.models.models import MemoryCard, CardEncounter
from app.schemas.schemas import (
    MemoryCardCreate, MemoryCardUpdate, MemoryCardOut,
    ReviewResult, MemoryStats,
    CASREncounter, CASRResponse, CASRQueueItem,
)

router = APIRouter()

WRONG_REASON_LABELS = {
    "mismatch": "答案不匹配",
    "partial_match": "部分匹配",
    "missing_content": "段落缺失关键信息",
}


async def get_current_user_id(token: str = Depends(oauth2_scheme)) -> str:
    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="无效的认证")
    return user_id


class WrittenAnswerReview(BaseModel):
    answer: str = Field(..., min_length=1)
    mode: str = Field(default="write_en_to_zh", pattern="^(write_en_to_zh|write_zh_to_en|cloze|paragraph)$")
    think_time: int = Field(default=0, ge=0)
    verify_time: int = Field(default=0, ge=0)
    flip_count: int = Field(default=1, ge=1)


def _normalize_answer(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"\s+", "", value)
    return re.sub(r"[.,!?;:'\"，。！？；：、（）()\-\[\]【】]", "", value)


def _expected_answer(card: MemoryCard, mode: str) -> str:
    if mode in ("write_zh_to_en", "paragraph"):
        return card.source_text
    if mode == "cloze":
        extra = json.loads(card.extra_data) if card.extra_data else {}
        return extra.get("cloze_answer") or card.target_text
    return card.target_text


def _evaluate_answer(answer: str, expected: str, mode: str = "write_en_to_zh") -> dict:
    actual_norm = _normalize_answer(answer)
    expected_norm = _normalize_answer(expected)
    if not actual_norm or not expected_norm:
        score = 0
    elif actual_norm == expected_norm:
        score = 100
    else:
        score = round(SequenceMatcher(None, actual_norm, expected_norm).ratio() * 100)

    if score >= 92:
        result = "remembered"
        verdict = "correct"
    elif score >= 65:
        result = "fuzzy"
        verdict = "partial"
    else:
        result = "forgot"
        verdict = "wrong"

    wrong_reason = None
    if verdict == "partial":
        wrong_reason = "partial_match"
    elif verdict == "wrong":
        wrong_reason = "mismatch"
    feedback: list[str] = []
    if verdict == "correct":
        feedback.append("核心表达准确，继续保持当前节奏。")
    elif mode == "paragraph":
        expected_words = [w for w in re.split(r"\s+", expected.strip()) if w]
        answer_words = [w for w in re.split(r"\s+", answer.strip()) if w]
        len_gap = abs(len(expected_words) - len(answer_words))
        if len_gap >= 6:
            wrong_reason = "missing_content"
            feedback.append("段落长度差异较大，可能遗漏了部分关键信息。")
        elif len_gap >= 3:
            feedback.append("段落主体已覆盖，建议补足细节信息。")
        if score < 65:
            feedback.append("建议先按句对齐原文，再进行整段默写。")
        elif score < 92:
            feedback.append("主要内容正确，重点优化术语和固定搭配。")
    else:
        if score < 65:
            feedback.append("建议先做一轮提示模式，再回到默写。")
        else:
            feedback.append("答案接近正确，优先修正关键词拼写。")
    return {
        "score": score,
        "result": result,
        "verdict": verdict,
        "wrong_reason": wrong_reason,
        "feedback": feedback,
        "expected_answer": expected,
        "normalized_answer": actual_norm,
        "normalized_expected": expected_norm,
    }


def _label_reason(reason: str | None) -> str:
    if not reason:
        return "未知"
    return WRONG_REASON_LABELS.get(reason, reason)


def _apply_casr_encounter(card: MemoryCard, user_id: str, body: CASREncounter) -> dict:
    confidence_before = card.confidence or 0
    update = process_encounter(
        confidence=confidence_before,
        avg_think_time=card.avg_think_time or 0,
        avg_verify_time=card.avg_verify_time or 0,
        avg_flips=card.avg_flips or 0,
        review_count=card.review_count,
        result=body.result,
        think_time=body.think_time,
        verify_time=body.verify_time,
        flip_count=body.flip_count,
    )

    card.confidence = update["confidence"]
    card.avg_think_time = update["avg_think_time"]
    card.avg_verify_time = update["avg_verify_time"]
    card.avg_flips = update["avg_flips"]
    card.review_count = update["review_count"]
    card.interval_days = update["interval_days"]
    card.next_review = update["next_review"]
    card.is_mastered = update["is_mastered"]
    if body.result == "forgot":
        card.wrong_count = (card.wrong_count or 0) + 1
        card.last_wrong_at = datetime.now(timezone.utc)

    return {
        "card_id": card.id,
        "confidence_before": round(confidence_before, 1),
        "confidence_after": update["confidence"],
        "result": body.result,
        "evolution_mode": update["evolution_mode"],
        "scheduled_interval_min": update["scheduled_interval_min"],
        "is_mastered": update["is_mastered"],
        "wrong_count": card.wrong_count,
    }


def _build_cloze_question(text: str) -> dict:
    """Build a deterministic cloze blank from a phrase or sentence."""
    tokens = re.findall(r"\w+|[^\w\s]", text, flags=re.UNICODE)
    word_indexes = [i for i, t in enumerate(tokens) if re.match(r"\w+", t, flags=re.UNICODE)]
    if not word_indexes:
        return {"prompt_text": text, "answer": text}
    idx = word_indexes[len(word_indexes) // 2]
    answer = tokens[idx]
    tokens[idx] = "_____"
    return {"prompt_text": "".join(tokens), "answer": answer}


# ═══════════════════════════════════════
# SM-2 Spaced Repetition Algorithm
# ═══════════════════════════════════════

def sm2_review(card: MemoryCard, quality: int) -> dict:
    """
    SM-2 algorithm. quality: 0-5
    0 = complete blackout, 5 = perfect
    Returns updated fields dict.
    """
    q = max(0, min(5, quality))

    if q >= 3:
        # Correct response
        if card.review_count == 0:
            card.interval_days = 1
        elif card.review_count == 1:
            card.interval_days = 6
        else:
            card.interval_days = round(card.interval_days * card.ease_factor)
        card.review_count += 1
    else:
        # Incorrect — reset
        card.review_count = 0
        card.interval_days = 1

    # Update ease factor
    card.ease_factor = max(1.3, card.ease_factor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))

    # Next review
    card.next_review = datetime.utcnow() + timedelta(days=card.interval_days)

    # Mastered if reviewed 5+ times with interval >= 21 days
    card.is_mastered = card.review_count >= 5 and card.interval_days >= 21

    return {
        "interval_days": card.interval_days,
        "ease_factor": round(card.ease_factor, 2),
        "next_review": card.next_review.isoformat(),
        "review_count": card.review_count,
        "is_mastered": card.is_mastered,
    }


# ═══════════════════════════════════════
# Card CRUD
# ═══════════════════════════════════════

@router.post("/", status_code=201)
async def create_card(
    body: MemoryCardCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    card = MemoryCard(
        user_id=user_id,
        source_text=body.source_text,
        target_text=body.target_text,
        source_lang=body.source_lang,
        target_lang=body.target_lang,
        domain=body.domain,
        difficulty=body.difficulty,
        card_type=body.card_type,
        extra_data=json.dumps(body.extra_data) if body.extra_data else None,
        next_review=datetime.utcnow(),
    )
    db.add(card)
    await db.flush()
    await db.refresh(card)
    return ApiResponse.success(data=MemoryCardOut.model_validate(card).model_dump())


@router.post("/batch", status_code=201)
async def batch_create_cards(
    body: list[MemoryCardCreate],
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    cards = []
    for item in body:
        card = MemoryCard(
            user_id=user_id,
            source_text=item.source_text,
            target_text=item.target_text,
            source_lang=item.source_lang,
            target_lang=item.target_lang,
            domain=item.domain,
            difficulty=item.difficulty,
            card_type=item.card_type,
            extra_data=json.dumps(item.extra_data) if item.extra_data else None,
            next_review=datetime.utcnow(),
        )
        db.add(card)
        cards.append(card)
    await db.flush()
    for c in cards:
        await db.refresh(c)
    return ApiResponse.success(data={
        "created": len(cards),
        "cards": [MemoryCardOut.model_validate(c).model_dump() for c in cards],
    })


@router.get("/")
async def list_cards(
    page: int = Query(1, ge=1),
    page_size: int = Query(200, ge=1, le=2000),
    domain: str | None = None,
    card_type: str | None = None,
    card_set_id: str | None = None,
    mastered: bool | None = None,
    sort: str = Query("created", pattern="^(created|review_count|difficulty|source_text)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    query = select(MemoryCard).where(MemoryCard.user_id == user_id)
    count_query = select(func.count()).select_from(MemoryCard).where(MemoryCard.user_id == user_id)

    if domain:
        query = query.where(MemoryCard.domain == domain)
        count_query = count_query.where(MemoryCard.domain == domain)
    if card_type:
        query = query.where(MemoryCard.card_type == card_type)
        count_query = count_query.where(MemoryCard.card_type == card_type)
    if card_set_id:
        query = query.where(MemoryCard.card_set_id == card_set_id)
        count_query = count_query.where(MemoryCard.card_set_id == card_set_id)
    if mastered is not None:
        query = query.where(MemoryCard.is_mastered == mastered)
        count_query = count_query.where(MemoryCard.is_mastered == mastered)

    # Sorting
    sort_col = {
        "created": MemoryCard.created_at,
        "review_count": MemoryCard.review_count,
        "difficulty": MemoryCard.difficulty,
        "source_text": MemoryCard.source_text,
    }.get(sort, MemoryCard.created_at)
    query = query.order_by(sort_col.desc() if order == "desc" else sort_col.asc())

    total = (await db.execute(count_query)).scalar()
    cards = (await db.execute(
        query.offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()

    return ApiResponse.success(data={
        "items": [MemoryCardOut.model_validate(c).model_dump() for c in cards],
        "total": total,
        "page": page,
        "page_size": page_size,
    })


@router.get("/domains")
async def list_domains(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MemoryCard.domain, func.count().label("count"))
        .where(MemoryCard.user_id == user_id)
        .group_by(MemoryCard.domain)
        .order_by(func.count().desc())
    )
    domains = [{"name": row.domain, "count": row.count} for row in result]
    return ApiResponse.success(data=domains)


@router.get("/review-queue")
async def get_review_queue(
    limit: int = Query(20, ge=1, le=100),
    domain: str | None = None,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get cards due for review (next_review <= now), ordered by priority."""
    now = datetime.utcnow()
    query = select(MemoryCard).where(
        and_(
            MemoryCard.user_id == user_id,
            MemoryCard.is_mastered == False,
            or_(
                MemoryCard.next_review <= now,
                MemoryCard.next_review.is_(None),
            ),
        )
    )
    if domain:
        query = query.where(MemoryCard.domain == domain)

    # Prioritize: overdue first, then by difficulty desc, then by review_count asc
    query = query.order_by(
        MemoryCard.next_review.asc().nullsfirst(),
        MemoryCard.difficulty.desc(),
        MemoryCard.review_count.asc(),
    )

    result = await db.execute(query.limit(limit))
    cards = result.scalars().all()

    return ApiResponse.success(data={
        "items": [MemoryCardOut.model_validate(c).model_dump() for c in cards],
        "total": len(cards),
    })


@router.post("/review/{card_id}")
async def review_card(
    card_id: str,
    body: ReviewResult,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MemoryCard).where(and_(MemoryCard.id == card_id, MemoryCard.user_id == user_id))
    )
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="卡片不存在")

    update = sm2_review(card, body.quality)
    await db.flush()
    await db.refresh(card)

    return ApiResponse.success(data={
        "card": MemoryCardOut.model_validate(card).model_dump(),
        "sm2_update": update,
    })


@router.get("/stats")
async def get_memory_stats(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    total = (await db.execute(
        select(func.count()).select_from(MemoryCard).where(MemoryCard.user_id == user_id)
    )).scalar()

    mastered = (await db.execute(
        select(func.count()).select_from(MemoryCard).where(
            and_(MemoryCard.user_id == user_id, MemoryCard.is_mastered == True)
        )
    )).scalar()

    due_today = (await db.execute(
        select(func.count()).select_from(MemoryCard).where(
            and_(
                MemoryCard.user_id == user_id,
                MemoryCard.is_mastered == False,
                or_(
                    MemoryCard.next_review <= datetime.utcnow(),
                    MemoryCard.next_review.is_(None),
                ),
            )
        )
    )).scalar()

    total_reviews = (await db.execute(
        select(func.sum(MemoryCard.review_count)).where(MemoryCard.user_id == user_id)
    )).scalar() or 0

    avg_ease = (await db.execute(
        select(func.avg(MemoryCard.ease_factor)).where(MemoryCard.user_id == user_id)
    )).scalar() or 2.5

    # Domain distribution
    domain_result = await db.execute(
        select(MemoryCard.domain, func.count().label("count"))
        .where(MemoryCard.user_id == user_id)
        .group_by(MemoryCard.domain)
    )
    domains = {row.domain: row.count for row in domain_result}

    # Weak domains by wrong count
    weak_domain_result = await db.execute(
        select(MemoryCard.domain, func.sum(MemoryCard.wrong_count).label("wrong_total"))
        .where(MemoryCard.user_id == user_id)
        .group_by(MemoryCard.domain)
        .order_by(func.sum(MemoryCard.wrong_count).desc())
    )
    weak_domains = [
        {"domain": row.domain, "wrong_total": int(row.wrong_total or 0)}
        for row in weak_domain_result
        if int(row.wrong_total or 0) > 0
    ][:5]
    wrong_reason_result = await db.execute(
        select(MemoryCard.last_wrong_reason, func.count().label("count"))
        .where(
            and_(
                MemoryCard.user_id == user_id,
                MemoryCard.last_wrong_reason.is_not(None),
            )
        )
        .group_by(MemoryCard.last_wrong_reason)
        .order_by(func.count().desc())
    )
    wrong_reasons = [
        {
            "reason": row.last_wrong_reason,
            "label": _label_reason(row.last_wrong_reason),
            "count": int(row.count or 0),
        }
        for row in wrong_reason_result
    ]
    trend_since = datetime.now(timezone.utc) - timedelta(days=7)
    trend_result = await db.execute(
        select(
            func.date(CardEncounter.created_at).label("day"),
            CardEncounter.wrong_reason,
            func.count().label("count"),
        )
        .where(
            and_(
                CardEncounter.user_id == user_id,
                CardEncounter.created_at >= trend_since,
                CardEncounter.wrong_reason.is_not(None),
            )
        )
        .group_by(func.date(CardEncounter.created_at), CardEncounter.wrong_reason)
        .order_by(func.date(CardEncounter.created_at).asc(), func.count().desc())
    )
    wrong_reason_trend = [
        {
            "day": str(row.day),
            "reason": row.wrong_reason,
            "label": _label_reason(row.wrong_reason),
            "count": int(row.count or 0),
        }
        for row in trend_result
    ]

    # Difficulty distribution
    diff_result = await db.execute(
        select(MemoryCard.difficulty, func.count().label("count"))
        .where(MemoryCard.user_id == user_id)
        .group_by(MemoryCard.difficulty)
    )
    difficulties = {str(row.difficulty): row.count for row in diff_result}

    return ApiResponse.success(data={
        "total": total,
        "mastered": mastered,
        "due_today": due_today,
        "total_reviews": total_reviews,
        "avg_ease": round(float(avg_ease), 2),
        "mastery_rate": round(mastered / total * 100, 1) if total > 0 else 0,
        "domains": domains,
        "difficulties": difficulties,
        "weak_domains": weak_domains,
        "wrong_reasons": wrong_reasons,
        "wrong_reason_trend": wrong_reason_trend,
    })


@router.get("/wrongbook")
async def get_wrongbook(
    card_set_id: str | None = None,
    limit: int = Query(100, ge=1, le=500),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    query = select(MemoryCard).where(
        and_(MemoryCard.user_id == user_id, MemoryCard.wrong_count > 0)
    )
    if card_set_id:
        query = query.where(MemoryCard.card_set_id == card_set_id)
    result = await db.execute(
        query.order_by(MemoryCard.wrong_count.desc(), MemoryCard.last_wrong_at.desc().nullslast()).limit(limit)
    )
    cards = result.scalars().all()
    return ApiResponse.success(data={
        "items": [MemoryCardOut.model_validate(c).model_dump() for c in cards],
        "total": len(cards),
    })


@router.get("/{card_id}")
async def get_card(
    card_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MemoryCard).where(and_(MemoryCard.id == card_id, MemoryCard.user_id == user_id))
    )
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="卡片不存在")
    return ApiResponse.success(data=MemoryCardOut.model_validate(card).model_dump())


@router.put("/{card_id}")
async def update_card(
    card_id: str,
    body: MemoryCardUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MemoryCard).where(and_(MemoryCard.id == card_id, MemoryCard.user_id == user_id))
    )
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="卡片不存在")

    update_data = body.model_dump(exclude_unset=True)
    if "extra_data" in update_data and update_data["extra_data"] is not None:
        update_data["extra_data"] = json.dumps(update_data["extra_data"])

    for key, value in update_data.items():
        setattr(card, key, value)

    await db.flush()
    await db.refresh(card)
    return ApiResponse.success(data=MemoryCardOut.model_validate(card).model_dump())


@router.delete("/{card_id}")
async def delete_card(
    card_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MemoryCard).where(and_(MemoryCard.id == card_id, MemoryCard.user_id == user_id))
    )
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="卡片不存在")
    await db.delete(card)
    return ApiResponse.success(message="已删除")


# ═══════════════════════════════════════
# CASR — Confidence-Adaptive Spaced Repetition
# ═══════════════════════════════════════

@router.get("/casr/queue")
async def casr_review_queue(
    card_set_id: str | None = None,
    mode: str = Query("standard", pattern="^(standard|write_en_to_zh|write_zh_to_en|cloze)$"),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get cards due for CASR review. Prioritizes: due cards > new cards."""
    now = datetime.now(timezone.utc)
    query = select(MemoryCard).where(MemoryCard.user_id == user_id)

    if card_set_id:
        query = query.where(MemoryCard.card_set_id == card_set_id)

    # Priority 1: due cards (next_review <= now OR next_review IS NULL with review_count > 0)
    due_cards = (await db.execute(
        query.where(
            and_(
                or_(
                    MemoryCard.next_review <= now,
                    and_(MemoryCard.next_review.is_(None), MemoryCard.review_count > 0),
                ),
                MemoryCard.is_mastered == False,
            )
        ).order_by(MemoryCard.confidence.asc()).limit(50)
    )).scalars().all()

    # Priority 2: new cards (review_count == 0)
    if not due_cards:
        new_query = select(MemoryCard).where(
            and_(MemoryCard.user_id == user_id, MemoryCard.review_count == 0)
        )
        if card_set_id:
            new_query = new_query.where(MemoryCard.card_set_id == card_set_id)
        due_cards = (await db.execute(
            new_query.order_by(MemoryCard.created_at.asc()).limit(30)
        )).scalars().all()

    items = []
    for c in due_cards:
        items.append({
            "id": c.id,
            "source_text": c.source_text,
            "target_text": c.target_text,
            "source_lang": c.source_lang,
            "target_lang": c.target_lang,
            "card_type": c.card_type,
            "confidence": c.confidence or 0,
            "review_count": c.review_count,
            "evolution_mode": get_evolution_mode(c.confidence or 0),
            "card_set_id": c.card_set_id,
            "mode": mode,
            "prompt_text": c.source_text,
            "expected_answer": c.target_text,
        })
        if mode == "write_zh_to_en":
            items[-1]["prompt_text"] = c.target_text
            items[-1]["expected_answer"] = c.source_text
        elif mode == "cloze":
            cloze = _build_cloze_question(c.source_text)
            items[-1]["prompt_text"] = cloze["prompt_text"]
            items[-1]["expected_answer"] = cloze["answer"]

    return ApiResponse.success(data={"items": items, "total": len(items)})


@router.post("/casr/review/{card_id}")
async def casr_review_card(
    card_id: str,
    body: CASREncounter,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Submit a CASR encounter with behavioral signals."""
    result = await db.execute(
        select(MemoryCard).where(and_(MemoryCard.id == card_id, MemoryCard.user_id == user_id))
    )
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="卡片不存在")

    response = _apply_casr_encounter(card, user_id, body)

    # Log encounter
    encounter = CardEncounter(
        card_id=card_id,
        user_id=user_id,
        think_time=body.think_time,
        verify_time=body.verify_time,
        flip_count=body.flip_count,
        result=body.result,
        confidence_before=response["confidence_before"],
        confidence_after=response["confidence_after"],
        scheduled_interval_min=response["scheduled_interval_min"],
    )
    db.add(encounter)

    await db.flush()
    return ApiResponse.success(data=response)


@router.post("/train/evaluate/{card_id}")
async def evaluate_written_answer(
    card_id: str,
    body: WrittenAnswerReview,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Evaluate typed recall, give instant feedback, and feed the result into CASR."""
    result = await db.execute(
        select(MemoryCard).where(and_(MemoryCard.id == card_id, MemoryCard.user_id == user_id))
    )
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="卡片不存在")

    expected = _expected_answer(card, body.mode)
    evaluation = _evaluate_answer(body.answer, expected, body.mode)
    encounter_body = CASREncounter(
        result=evaluation["result"],
        think_time=body.think_time,
        verify_time=body.verify_time,
        flip_count=body.flip_count,
    )
    response = _apply_casr_encounter(card, user_id, encounter_body)
    card.last_score = int(evaluation["score"])
    card.last_mode = body.mode
    if evaluation["result"] == "forgot":
        card.last_wrong_reason = evaluation["wrong_reason"] or "mismatch"
    elif evaluation["result"] == "fuzzy":
        card.last_wrong_reason = evaluation["wrong_reason"] or "partial_match"
    else:
        card.last_wrong_reason = None

    encounter = CardEncounter(
        card_id=card_id,
        user_id=user_id,
        think_time=body.think_time,
        verify_time=body.verify_time,
        flip_count=body.flip_count,
        result=evaluation["result"],
        wrong_reason=evaluation.get("wrong_reason"),
        confidence_before=response["confidence_before"],
        confidence_after=response["confidence_after"],
        scheduled_interval_min=response["scheduled_interval_min"],
    )
    db.add(encounter)
    await db.flush()

    return ApiResponse.success(data={
        **response,
        **evaluation,
        "answer": body.answer,
        "mode": body.mode,
    })


@router.get("/training/session-summary")
async def get_training_session_summary(
    hours: int = Query(24, ge=1, le=168),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    result = await db.execute(
        select(CardEncounter).where(
            and_(CardEncounter.user_id == user_id, CardEncounter.created_at >= since)
        )
    )
    encounters = result.scalars().all()
    total = len(encounters)
    if total == 0:
        return ApiResponse.success(data={
            "hours": hours,
            "total": 0,
            "correct_rate": 0,
            "avg_think_time_ms": 0,
            "avg_verify_time_ms": 0,
        })
    remembered = sum(1 for e in encounters if e.result == "remembered")
    avg_think = round(sum(e.think_time for e in encounters) / total)
    avg_verify = round(sum(e.verify_time for e in encounters) / total)
    return ApiResponse.success(data={
        "hours": hours,
        "total": total,
        "correct_rate": round(remembered / total * 100, 1),
        "avg_think_time_ms": avg_think,
        "avg_verify_time_ms": avg_verify,
    })


@router.get("/casr/encounters/{card_id}")
async def get_card_encounters(
    card_id: str,
    limit: int = Query(20, ge=1, le=100),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get encounter history for a card."""
    result = await db.execute(
        select(CardEncounter)
        .where(and_(CardEncounter.card_id == card_id, CardEncounter.user_id == user_id))
        .order_by(CardEncounter.created_at.desc())
        .limit(limit)
    )
    encounters = result.scalars().all()
    return ApiResponse.success(data={
        "items": [
            {
                "id": e.id,
                "think_time": e.think_time,
                "verify_time": e.verify_time,
                "flip_count": e.flip_count,
                "result": e.result,
                "confidence_before": e.confidence_before,
                "confidence_after": e.confidence_after,
                "scheduled_interval_min": e.scheduled_interval_min,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in encounters
        ]
    })


@router.post("/wrongbook/{card_id}/clear")
async def clear_wrongbook_item(
    card_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MemoryCard).where(and_(MemoryCard.id == card_id, MemoryCard.user_id == user_id))
    )
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="卡片不存在")
    card.wrong_count = 0
    card.last_wrong_at = None
    await db.flush()
    return ApiResponse.success(message="已移出错题本")


@router.get("/wrongbook/review-queue")
async def wrongbook_review_queue(
    limit: int = Query(30, ge=1, le=100),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MemoryCard)
        .where(and_(MemoryCard.user_id == user_id, MemoryCard.wrong_count > 0))
        .order_by(MemoryCard.wrong_count.desc(), MemoryCard.last_wrong_at.desc().nullslast())
        .limit(limit)
    )
    cards = result.scalars().all()
    return ApiResponse.success(data={
        "items": [
            {
                "id": c.id,
                "source_text": c.source_text,
                "target_text": c.target_text,
                "source_lang": c.source_lang,
                "target_lang": c.target_lang,
                "card_type": c.card_type,
                "confidence": c.confidence or 0,
                "review_count": c.review_count,
                "evolution_mode": get_evolution_mode(c.confidence or 0),
                "card_set_id": c.card_set_id,
                "wrong_count": c.wrong_count or 0,
                "prompt_text": c.source_text,
                "expected_answer": c.target_text,
                "mode": "write_en_to_zh",
            }
            for c in cards
        ],
        "total": len(cards),
    })
