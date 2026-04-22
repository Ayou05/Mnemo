import json
import re
import uuid
from collections import Counter
from difflib import SequenceMatcher
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
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
_settings = get_settings()


from app.core.evaluation import (
    WRONG_REASON_LABELS, WRONG_REASON_ICONS,
    _expected_answer, _evaluate_answer, _classify_error_detail,
    _ai_diagnose_async, _adjust_difficulty,
    _apply_casr_encounter, _build_cloze_question,
    _recommend_mode_for_card, sm2_review, _label_reason,
)
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
    """Get cards due for review (next_review <= now), ordered by priority. Only released cards."""
    now = datetime.utcnow()
    query = select(MemoryCard).where(
        and_(
            MemoryCard.user_id == user_id,
            MemoryCard.released_at.isnot(None),  # drip-feed: only released cards
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

    # Effective difficulty: based on actual confidence/performance
    # Maps confidence ranges to difficulty buckets
    cards_for_eff = await db.execute(
        select(MemoryCard.confidence, MemoryCard.difficulty)
        .where(MemoryCard.user_id == user_id)
    )
    effective_diff = {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}
    for row in cards_for_eff:
        conf = row.confidence or 0
        if conf >= 90:
            effective_diff["1"] += 1  # mastered → easy
        elif conf >= 70:
            effective_diff["2"] += 1
        elif conf >= 50:
            effective_diff["3"] += 1
        elif conf >= 30:
            effective_diff["4"] += 1
        else:
            effective_diff["5"] += 1  # struggling → hard

    # Drip-feed: unreleased cards count
    unreleased = (await db.execute(
        select(func.count()).select_from(MemoryCard).where(
            and_(MemoryCard.user_id == user_id, MemoryCard.released_at.is_(None))
        )
    )).scalar() or 0

    return ApiResponse.success(data={
        "total": total,
        "mastered": mastered,
        "due_today": due_today,
        "total_reviews": total_reviews,
        "avg_ease": round(float(avg_ease), 2),
        "mastery_rate": round(mastered / total * 100, 1) if total > 0 else 0,
        "domains": domains,
        "difficulties": difficulties,
        "effective_difficulties": effective_diff,
        "weak_domains": weak_domains,
        "wrong_reasons": wrong_reasons,
        "wrong_reason_trend": wrong_reason_trend,
        "unreleased": unreleased,
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

    # Enrich each card with recent wrong encounter history
    card_ids = [c.id for c in cards]
    wrong_history: dict[str, list[dict]] = {}
    if card_ids:
        encounters = (await db.execute(
            select(CardEncounter)
            .where(and_(
                CardEncounter.card_id.in_(card_ids),
                CardEncounter.user_id == user_id,
                CardEncounter.result.in_(["forgot", "fuzzy"]),
            ))
            .order_by(CardEncounter.created_at.desc())
        )).scalars().all()
        for enc in encounters:
            wrong_history.setdefault(enc.card_id, []).append({
                "result": enc.result,
                "wrong_reason": enc.wrong_reason,
                "confidence_before": round(enc.confidence_before, 1),
                "confidence_after": round(enc.confidence_after, 1),
                "created_at": enc.created_at.isoformat() if enc.created_at else None,
            })
        # Keep only last 5 per card
        for cid in wrong_history:
            wrong_history[cid] = wrong_history[cid][:5]

    items = []
    for c in cards:
        item = MemoryCardOut.model_validate(c).model_dump()
        item["wrong_history"] = wrong_history.get(c.id, [])
        items.append(item)

    # Wrong reason distribution across all wrongbook cards
    reason_dist = {}
    for c in cards:
        reason = c.last_wrong_reason or "mismatch"
        reason_dist[reason] = reason_dist.get(reason, 0) + 1

    return ApiResponse.success(data={
        "items": items,
        "total": len(cards),
        "reason_distribution": {k: v for k, v in sorted(reason_dist.items(), key=lambda x: -x[1])},
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
    """Get cards due for CASR review. Prioritizes: due cards > new cards. Only released cards."""
    now = datetime.now(timezone.utc)
    base_filter = and_(
        MemoryCard.user_id == user_id,
        MemoryCard.released_at.isnot(None),  # drip-feed: only released cards
    )
    query = select(MemoryCard).where(base_filter)

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

    # Priority 2: new released cards (review_count == 0)
    if not due_cards:
        new_query = select(MemoryCard).where(
            and_(base_filter, MemoryCard.review_count == 0)
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
            "recommended_mode": _recommend_mode_for_card(c),
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

    # Auto-trigger AI diagnosis for wrong/fuzzy answers
    ai_diagnosis = None
    if evaluation["result"] in ("forgot", "fuzzy"):
        # Set rule-based reason immediately
        card.last_wrong_reason = evaluation["wrong_reason"] or (
            "mismatch" if evaluation["result"] == "forgot" else "partial_match"
        )
        # Fire AI diagnosis in background
        ai_diagnosis = await _ai_diagnose_async(
            source_text=card.source_text or "",
            expected=expected,
            actual=body.answer,
            mode=body.mode,
            score=evaluation["score"],
        )
        if ai_diagnosis:
            # Override with AI's more accurate classification
            card.last_wrong_reason = ai_diagnosis.get("reason_key", card.last_wrong_reason)
            card.last_wrong_detail = ai_diagnosis.get("error_detail", "")
    else:
        card.last_wrong_reason = None
        card.last_wrong_detail = None

    # Dynamic difficulty adjustment
    _adjust_difficulty(card, evaluation["result"], evaluation["score"])

    encounter = CardEncounter(
        card_id=card_id,
        user_id=user_id,
        think_time=body.think_time,
        verify_time=body.verify_time,
        flip_count=body.flip_count,
        result=evaluation["result"],
        wrong_reason=card.last_wrong_reason,
        confidence_before=response["confidence_before"],
        confidence_after=response["confidence_after"],
        scheduled_interval_min=response["scheduled_interval_min"],
    )
    db.add(encounter)
    await db.flush()

    resp_data = {
        **response,
        **evaluation,
        "answer": body.answer,
        "mode": body.mode,
    }
    # Attach AI diagnosis if available
    if ai_diagnosis:
        resp_data["ai_diagnosis"] = ai_diagnosis

    return ApiResponse.success(data=resp_data)


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


# ═══════════════════════════════════════
# Reset — 重置学习进度
# ═══════════════════════════════════════

class ResetRequest(BaseModel):
    scope: str = Field("all", pattern="^(all|domain|card_set)$")
    domain: str | None = None
    card_set_id: str | None = None


@router.post("/reset")
async def reset_progress(
    body: ResetRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Reset learning progress for cards. Does NOT delete cards."""
    query = select(MemoryCard).where(MemoryCard.user_id == user_id)

    if body.scope == "domain" and body.domain:
        query = query.where(MemoryCard.domain == body.domain)
    elif body.scope == "card_set" and body.card_set_id:
        query = query.where(MemoryCard.card_set_id == body.card_set_id)

    result = await db.execute(query)
    cards = result.scalars().all()

    if not cards:
        return ApiResponse.error(message="没有找到匹配的卡片")

    card_ids = [c.id for c in cards]
    now = datetime.now(timezone.utc)

    # Reset CASR state on all matched cards
    for card in cards:
        card.confidence = 0
        card.review_count = 0
        card.interval_days = 0
        card.next_review = now
        card.wrong_count = 0
        card.is_mastered = False
        card.avg_think_time = 0
        card.avg_verify_time = 0
        card.avg_flips = 0
        card.ease_factor = 2.5
        card.last_score = None
        card.last_wrong_at = None

    # Delete all encounter logs for these cards
    await db.execute(
        CardEncounter.__table__.delete().where(CardEncounter.card_id.in_(card_ids))
    )

    await db.flush()

    return ApiResponse.success(data={
        "reset_count": len(cards),
        "scope": body.scope,
        "message": f"已重置 {len(cards)} 张卡片的学习进度",
    })


# ═══════════════════════════════════════
# Drip-feed — 智能新卡释放
# ═══════════════════════════════════════

@router.post("/drip-feed/release")
async def release_new_cards(
    limit: int = Query(20, ge=1, le=200),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Release unreleased cards into the review queue (drip-feed)."""
    now = datetime.now(timezone.utc)

    # Find cards that haven't been released yet
    result = await db.execute(
        select(MemoryCard).where(
            and_(
                MemoryCard.user_id == user_id,
                MemoryCard.released_at.is_(None),
            )
        ).order_by(MemoryCard.created_at.asc()).limit(limit)
    )
    cards = result.scalars().all()

    released_count = 0
    for card in cards:
        card.released_at = now
        card.next_review = now  # immediately due
        released_count += 1

    await db.flush()

    return ApiResponse.success(data={
        "released_count": released_count,
        "remaining_unreleased": released_count < limit,  # hint: more available
    })


@router.get("/drip-feed/status")
async def drip_feed_status(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get drip-feed status: how many cards are released vs unreleased."""
    total = (await db.execute(
        select(func.count()).select_from(MemoryCard).where(MemoryCard.user_id == user_id)
    )).scalar() or 0

    released = (await db.execute(
        select(func.count()).select_from(MemoryCard).where(
            and_(MemoryCard.user_id == user_id, MemoryCard.released_at.isnot(None))
        )
    )).scalar() or 0

    unreleased = total - released

    return ApiResponse.success(data={
        "total": total,
        "released": released,
        "unreleased": unreleased,
    })


# ── LLM-powered error diagnosis ──

class DiagnoseRequest(BaseModel):
    source_text: str
    expected: str
    actual: str
    mode: str
    score: int


@router.post("/diagnose")
async def diagnose_error(
    body: DiagnoseRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Use LLM to provide detailed error analysis for a wrong answer."""
    if not _settings.DASHSCOPE_API_KEY:
        raise HTTPException(status_code=503, detail="AI 服务未配置")

    diagnosis = await _ai_diagnose_async(
        source_text=body.source_text,
        expected=body.expected,
        actual=body.actual,
        mode=body.mode,
        score=body.score,
    )
    if diagnosis:
        return ApiResponse.success(data=diagnosis)
    return ApiResponse.success(data={
        "error_type": "分析失败",
        "error_detail": "AI 返回格式异常，请重试。",
        "suggestions": [],
        "encouragement": "继续加油！",
        "reason_key": "mismatch",
    })


# ── Smart mode recommendation ──

@router.get("/recommend-mode")
async def recommend_mode(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Recommend the best training mode based on performance + error patterns."""

    cards = (await db.execute(
        select(MemoryCard).where(MemoryCard.user_id == user_id)
    )).scalars().all()

    if not cards:
        return ApiResponse.success(data={
            "recommended_mode": "write_en_to_zh",
            "mode_label": "看英文写中文",
            "reason": "还没有卡片，先从基础模式开始。",
            "signals": {},
        })

    total = len(cards)
    reviewed = [c for c in cards if c.review_count > 0]
    wrong_cards = [c for c in cards if (c.wrong_count or 0) > 0]
    mastered = sum(1 for c in cards if c.is_mastered)
    avg_confidence = sum(c.confidence or 0 for c in cards) / total

    # Mostly new cards → basic recall
    if len(reviewed) < total * 0.3:
        return ApiResponse.success(data={
            "recommended_mode": "write_en_to_zh",
            "mode_label": "看英文写中文",
            "reason": f"大部分卡片还没学过（{total - len(reviewed)}/{total} 张新卡），建议先从基础回忆开始。",
            "signals": {"new_ratio": round((total - len(reviewed)) / total, 2), "avg_confidence": round(avg_confidence, 1)},
        })

    # Error-pattern-driven recommendations
    wrong_reason_counts: dict[str, int] = {}
    for c in wrong_cards:
        reason = c.last_wrong_reason or "forgot"
        wrong_reason_counts[reason] = wrong_reason_counts.get(reason, 0) + 1

    top_reasons = sorted(wrong_reason_counts.items(), key=lambda x: -x[1])
    if top_reasons:
        top_reason, top_count = top_reasons[0]

        if top_reason == "spelling" and top_count >= 2:
            return ApiResponse.success(data={
                "recommended_mode": "cloze",
                "mode_label": "完形填空",
                "reason": f"近期拼写错误较多（{top_count} 次），完形填空能精准训练单词拼写。",
                "signals": {"top_error": top_reason, "top_error_count": top_count, "avg_confidence": round(avg_confidence, 1)},
            })
        if top_reason == "word_order" and top_count >= 2:
            return ApiResponse.success(data={
                "recommended_mode": "paragraph",
                "mode_label": "段落默写",
                "reason": f"近期词序错误较多（{top_count} 次），段落默写能强化语序记忆。",
                "signals": {"top_error": top_reason, "top_error_count": top_count, "avg_confidence": round(avg_confidence, 1)},
            })
        if top_reason in ("forgot", "omission", "missing_content") and top_count >= 3:
            return ApiResponse.success(data={
                "recommended_mode": "write_zh_to_en",
                "mode_label": "看中文写英文",
                "reason": f"近期遗忘/遗漏较多（{top_count} 次），反向回忆能激活主动输出能力。",
                "signals": {"top_error": top_reason, "top_error_count": top_count, "avg_confidence": round(avg_confidence, 1)},
            })
        if top_reason == "grammar" and top_count >= 2:
            return ApiResponse.success(data={
                "recommended_mode": "paragraph",
                "mode_label": "段落默写",
                "reason": f"近期语法错误较多（{top_count} 次），段落默写能强化语法运用。",
                "signals": {"top_error": top_reason, "top_error_count": top_count, "avg_confidence": round(avg_confidence, 1)},
            })

    # Confidence-driven fallback
    if avg_confidence >= 75:
        mode, mode_label = "paragraph", "段落默写"
        reason = f"平均掌握度 {avg_confidence:.0f}%，可以挑战段落默写来巩固。"
    elif avg_confidence >= 50:
        mode, mode_label = "cloze", "完形填空"
        reason = f"平均掌握度 {avg_confidence:.0f}%，完形填空能平衡难度和效果。"
    elif avg_confidence >= 30:
        mode, mode_label = "write_zh_to_en", "看中文写英文"
        reason = f"平均掌握度 {avg_confidence:.0f}%，反向回忆能加强薄弱环节。"
    else:
        mode, mode_label = "write_en_to_zh", "看英文写中文"
        reason = f"平均掌握度 {avg_confidence:.0f}%，建议先从基础回忆开始。"

    return ApiResponse.success(data={
        "recommended_mode": mode,
        "mode_label": mode_label,
        "reason": reason,
        "signals": {"avg_confidence": round(avg_confidence, 1), "mastered_ratio": round(mastered / total, 2)},
    })


# ── Session Insight — AI-powered post-review summary ──

class SessionInsightRequest(BaseModel):
    """Frontend sends session stats; backend enriches with DB data and calls LLM."""
    remembered: int = 0
    fuzzy: int = 0
    forgot: int = 0
    score: int = 0
    card_ids: list[str] = Field(default_factory=list)


@router.post("/training/session-insight")
async def session_insight(
    body: SessionInsightRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Generate an AI-powered summary after a review session completes."""
    total = body.remembered + body.fuzzy + body.forgot
    if total == 0:
        return ApiResponse.success(data={"summary": "", "weak_points": [], "suggestions": [], "encouragement": ""})

    # Gather encounter data for this session's cards
    card_data = []
    if body.card_ids:
        cards_result = await db.execute(
            select(MemoryCard).where(
                and_(MemoryCard.id.in_(body.card_ids), MemoryCard.user_id == user_id)
            )
        )
        cards = cards_result.scalars().all()
        card_map = {c.id: c for c in cards}

        # Get recent encounters (last 30 min) for these cards
        since = datetime.now(timezone.utc) - timedelta(minutes=30)
        enc_result = await db.execute(
            select(CardEncounter).where(
                and_(
                    CardEncounter.card_id.in_(body.card_ids),
                    CardEncounter.user_id == user_id,
                    CardEncounter.created_at >= since,
                )
            ).order_by(CardEncounter.created_at.desc())
        )
        encounters = enc_result.scalars().all()

        # Build per-card summary
        for cid in body.card_ids:
            card = card_map.get(cid)
            if not card:
                continue
            card_encs = [e for e in encounters if e.card_id == cid]
            last_enc = card_encs[0] if card_encs else None
            card_data.append({
                "source": card.source_text[:80],
                "target": card.target_text[:80],
                "confidence": round(card.confidence or 0, 1),
                "result": last_enc.result if last_enc else "unknown",
                "wrong_reason": last_enc.wrong_reason if last_enc else None,
                "think_time_ms": last_enc.think_time if last_enc else 0,
            })

    # Wrong reason distribution
    wrong_reasons = [d["wrong_reason"] for d in card_data if d.get("wrong_reason")]
    reason_counts = Counter(wrong_reasons)

    # Build prompt
    accuracy = round((body.remembered + body.fuzzy) / total * 100) if total > 0 else 0
    weak_cards = [d for d in card_data if d["result"] in ("forgot", "fuzzy")]

    prompt = f"""你是一个学习助手，请根据以下复习数据生成一段简短的学习总结。

## 本次复习数据
- 总卡片数：{total}
- 记住：{body.remembered}，模糊：{body.fuzzy}，忘记：{body.forgot}
- 正确率：{accuracy}%
- 积分：{body.score}
- 错误类型分布：{dict(reason_counts) if reason_counts else "无"}

## 薄弱卡片
{json.dumps(weak_cards[:5], ensure_ascii=False, indent=2) if weak_cards else "无薄弱卡片"}

## 要求
请用 JSON 格式返回，包含以下字段：
1. "summary"：一句话总结本次复习表现（20字以内，口语化，带鼓励）
2. "weak_points"：薄弱环节列表（最多3条，每条15字以内，指出具体问题）
3. "suggestions"：学习建议（最多2条，每条20字以内，具体可执行）
4. "encouragement"：一句鼓励的话（15字以内）

只返回 JSON，不要其他内容。"""

    if not _settings.DEEPSEEK_API_KEY:
        # Fallback: rule-based insight without LLM
        fallback = {
            "summary": f"复习了 {total} 张卡片，正确率 {accuracy}%",
            "weak_points": [],
            "suggestions": [],
            "encouragement": "继续加油！" if accuracy < 80 else "表现不错！",
        }
        if weak_cards:
            top_reasons = reason_counts.most_common(3)
            fallback["weak_points"] = [
                f"{_label_reason(r)} 出现 {c} 次" for r, c in top_reasons
            ]
            fallback["suggestions"] = ["建议明天重点复习薄弱卡片"]
        return ApiResponse.success(data=fallback)

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
                        {"role": "system", "content": "你是一个简洁的学习助手，只返回 JSON。"},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.7,
                },
            )
            result = resp.json()
            content = result["choices"][0]["message"]["content"].strip()
            # Parse JSON from response (handle markdown code blocks)
            if content.startswith("```"):
                content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            insight = json.loads(content)
            return ApiResponse.success(data=insight)
    except Exception:
        return ApiResponse.success(data={
            "summary": f"复习了 {total} 张卡片，正确率 {accuracy}%",
            "weak_points": [],
            "suggestions": [],
            "encouragement": "继续加油！",
        })


# ── Proactive Quiz — AI-generated quiz based on weak points ──

@router.post("/proactive-quiz")
async def proactive_quiz(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Generate a quiz question targeting the user's weakest knowledge points."""
    # 1. Find weak cards from recent encounters (last 7 days)
    since = datetime.now(timezone.utc) - timedelta(days=7)
    enc_result = await db.execute(
        select(CardEncounter, MemoryCard)
        .join(MemoryCard, CardEncounter.card_id == MemoryCard.id)
        .where(and_(
            CardEncounter.user_id == user_id,
            CardEncounter.created_at >= since,
            CardEncounter.result.in_(["forgot", "fuzzy"]),
        ))
        .order_by(CardEncounter.created_at.desc())
        .limit(30)
    )
    weak_rows = enc_result.all()

    if not weak_rows:
        return ApiResponse.success(data={"has_quiz": False, "reason": "no_weak_points"})

    # 2. Build weak point summary (deduplicate by card)
    weak_cards = []
    seen = set()
    for enc, card in weak_rows:
        if card.id in seen:
            continue
        seen.add(card.id)
        weak_cards.append({
            "source": card.source_text[:100],
            "target": card.target_text[:100],
            "confidence": round(card.confidence or 0, 1),
            "wrong_reason": enc.wrong_reason,
            "domain": card.domain,
            "difficulty": card.difficulty,
        })

    # 3. Error type distribution
    reason_counts = Counter(enc.wrong_reason for enc, _ in weak_rows if enc.wrong_reason)

    # 4. Generate quiz with DeepSeek
    prompt = f"""你是一个英语学习助手。根据用户的薄弱数据，出一道简短的测验题。

## 薄弱卡片数据
{json.dumps(weak_cards[:6], ensure_ascii=False, indent=2)}

## 错误类型分布
{dict(reason_counts.most_common(5))}

## 要求
- 出一道题，针对最突出的薄弱点
- 题型选择最合适的：填空题(fill_blank)、选择题(multiple_choice)、翻译题(translation)、改错题(correction)
- 题目要简短，一句话能说完
- 难度适中
- 返回 JSON 格式：
{{
  "question": "题目内容",
  "type": "fill_blank|multiple_choice|translation|correction",
  "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
  "answer": "正确答案",
  "explanation": "简要解析（30字以内）",
  "hint": "一个小提示（可选，不给就直接null）",
  "topic": "考点名称（如：虚拟语气、现在完成时）"
}}

只返回 JSON，不要其他内容。"""

    if not _settings.DEEPSEEK_API_KEY:
        return ApiResponse.success(data={"has_quiz": False, "reason": "no_api_key"})

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
                        {"role": "system", "content": "你是一个简洁的学习助手，只返回 JSON。"},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.8,
                },
            )
            result = resp.json()
            content = result["choices"][0]["message"]["content"].strip()
            if content.startswith("```"):
                content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            quiz = json.loads(content)
            quiz["has_quiz"] = True
            quiz["quiz_id"] = str(uuid.uuid4())
            return ApiResponse.success(data=quiz)
    except Exception:
        return ApiResponse.success(data={"has_quiz": False, "reason": "llm_error"})
