"""Memory card evaluation, classification, AI diagnosis, and SM-2.

Pure functions and helpers extracted from memory.py for maintainability.
"""

import json
import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher

from app.core.config import get_settings
from app.core.casr import process_encounter
from app.models.models import MemoryCard
from app.schemas.schemas import CASREncounter

_settings = get_settings()

WRONG_REASON_LABELS = {
    "mismatch": "答案不匹配",
    "partial_match": "部分匹配",
    "missing_content": "段落缺失关键信息",
    "spelling": "拼写错误",
    "word_order": "词序错误",
    "omission": "内容遗漏",
    "confusion": "形近/意近混淆",
    "grammar": "语法错误",
    "forgot": "完全遗忘",
}

WRONG_REASON_ICONS = {
    "spelling": "✏️",
    "word_order": "🔀",
    "omission": "📝",
    "confusion": "🔄",
    "grammar": "📐",
    "forgot": "🤔",
    "mismatch": "❌",
    "partial_match": "⚠️",
    "missing_content": "📄",
}


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
        wrong_reason = None
        feedback = ["核心表达准确，继续保持当前节奏。"]
    elif score >= 65:
        result = "fuzzy"
        verdict = "partial"
        wrong_reason, feedback = _classify_error_detail(expected, answer, mode, score)
    else:
        result = "forgot"
        verdict = "wrong"
        wrong_reason, feedback = _classify_error_detail(expected, answer, mode, score)

    return {
        "score": score,
        "result": result,
        "verdict": verdict,
        "wrong_reason": wrong_reason,
        "wrong_reason_icon": WRONG_REASON_ICONS.get(wrong_reason, ""),
        "feedback": feedback,
        "expected_answer": expected,
        "normalized_answer": actual_norm,
        "normalized_expected": expected_norm,
    }


# ── Error classification helpers ──

def _is_chinese(text: str) -> bool:
    chinese = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
    return chinese > len(text) * 0.3


def _edit_distance(s1: str, s2: str) -> int:
    if len(s1) < len(s2):
        return _edit_distance(s2, s1)
    if not s2:
        return len(s1)
    prev = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        curr = [i + 1]
        for j, c2 in enumerate(s2):
            curr.append(min(prev[j + 1] + 1, curr[j] + 1, prev[j] + (c1 != c2)))
        prev = curr
    return prev[-1]


def _classify_error_detail(expected: str, actual: str, mode: str, score: int) -> tuple[str, list[str]]:
    """Classify specific error type and return (reason, feedback_list)."""
    if mode == "paragraph":
        return _classify_paragraph(expected, actual, score)
    if _is_chinese(expected):
        return _classify_chinese(expected, actual)
    return _classify_english(expected, actual)


def _classify_chinese(expected: str, actual: str) -> tuple[str, list[str]]:
    exp_chars = [c for c in expected if c.strip()]
    act_chars = [c for c in actual if c.strip()]
    if not act_chars:
        return "forgot", ["没有作答，请先尝试回忆。"]

    exp_counter = Counter(exp_chars)
    act_counter = Counter(act_chars)

    # Same chars, different order
    if exp_counter == act_counter and exp_chars != act_chars:
        return "word_order", [
            "用字都正确，但顺序不对。",
            "提示：注意中文语序，尤其是修饰语和中心语的位置。",
        ]

    exp_set = set(exp_chars)
    act_set = set(act_chars)
    correct = sum(1 for c in act_chars if c in exp_set)
    accuracy = correct / len(act_chars) if act_chars else 0

    # Omission: actual is subset of expected
    if act_set.issubset(exp_set) and len(act_chars) < len(exp_chars) * 0.75:
        missing = list(exp_set - act_set)[:5]
        return "omission", [
            f"部分内容遗漏，缺少：{'、'.join(missing)}",
            "提示：先回忆整体意思，再补充细节。",
        ]

    # Confusion: high accuracy but some wrong chars
    if accuracy > 0.6:
        wrong = list({c for c in act_chars if c not in exp_set})[:3]
        return "confusion", [
            f"部分字写错了：{'、'.join(wrong)}",
            "提示：注意区分形近字，可以联想记忆。",
        ]

    return "mismatch", ["答案差异较大，建议回到原文重新记忆。"]


def _classify_english(expected: str, actual: str) -> tuple[str, list[str]]:
    exp_words = re.findall(r"[a-zA-Z]+", expected.lower())
    act_words = re.findall(r"[a-zA-Z]+", actual.lower())
    if not act_words:
        return "forgot", ["没有作答，请先尝试回忆。"]

    exp_set = set(exp_words)
    act_set = set(act_words)

    # Word order: same multiset, different order
    if Counter(exp_words) == Counter(act_words) and exp_words != act_words:
        return "word_order", [
            "所有单词都正确，但语序不对。",
            "提示：注意英语语序（主谓宾结构、修饰语位置）。",
        ]

    # Omission: actual words subset of expected
    if act_set.issubset(exp_set) and len(act_words) < len(exp_words) * 0.75:
        missing = list(exp_set - act_set)[:5]
        return "omission", [
            f"遗漏了部分单词：{', '.join(missing)}",
            "提示：先回忆句子结构，再填充具体词汇。",
        ]

    # Spelling: most words match, a few are close
    matched = sum(1 for w in act_words if w in exp_set)
    spelling_errs = []
    for aw in act_words:
        if aw not in exp_set:
            for ew in exp_set:
                if len(aw) > 2 and len(ew) > 2 and _edit_distance(aw, ew) <= max(2, len(ew) // 3):
                    spelling_errs.append((aw, ew))
                    break
    if spelling_errs and matched + len(spelling_errs) >= len(act_words) * 0.6:
        examples = [f"{aw} → {ew}" for aw, ew in spelling_errs[:3]]
        return "spelling", [
            f"拼写有误：{'；'.join(examples)}",
            "提示：注意常见拼写陷阱（双写字母、不发音字母等）。",
        ]

    # Grammar: stem matches but surface form differs
    grammar_hints = _detect_grammar(exp_words, act_words, exp_set)
    if grammar_hints:
        return "grammar", grammar_hints

    # Confusion: high char overlap
    common = set(expected.lower()) & set(actual.lower())
    if len(common) / max(len(set(expected.lower())), 1) > 0.6:
        return "confusion", [
            "答案和正确答案很相似，可能混淆了表达。",
            "提示：注意区分形近词和意近词的具体用法。",
        ]

    return "mismatch", ["答案差异较大，建议回到原文重新记忆。"]


def _detect_grammar(exp_words: list, act_words: list, exp_set: set) -> list[str] | None:
    hints = []
    for aw in act_words:
        if aw in exp_set:
            continue
        aw_stem = re.sub(r"(ed|ing|es|s|d)$", "", aw, count=1)
        if len(aw_stem) < 3:
            continue
        for ew in exp_set:
            ew_stem = re.sub(r"(ed|ing|es|s|d)$", "", ew, count=1)
            if aw_stem == ew_stem and aw != ew and len(ew_stem) > 2:
                hints.append(f"注意词形变化：写了「{aw}」，应为「{ew}」")
                break
    if hints:
        hints.append("提示：注意时态、单复数等语法变化。")
        return hints[:3]
    return None


def _classify_paragraph(expected: str, actual: str, score: int) -> tuple[str, list[str]]:
    exp_words = [w for w in re.split(r"\s+", expected.strip()) if w]
    act_words = [w for w in re.split(r"\s+", actual.strip()) if w]
    if not act_words:
        return "forgot", ["请先尝试默写整段内容。"]

    len_gap = abs(len(exp_words) - len(act_words))
    if len_gap >= len(exp_words) * 0.4:
        return "missing_content", [
            f"段落长度差异较大（预期 {len(exp_words)} 词，实际 {len(act_words)} 词）。",
            "建议先按句对齐原文，逐句默写后再尝试整段。",
        ]

    exp_lower = [w.lower() for w in exp_words]
    act_lower = [w.lower() for w in act_words]
    correct = sum(1 for w in act_lower if w in set(exp_lower))
    accuracy = correct / len(act_lower) if act_lower else 0

    if accuracy > 0.7:
        return "grammar", [
            "大部分内容正确，但存在语法或表达问题。",
            "建议重点检查时态、冠词、介词的使用。",
        ]
    if accuracy > 0.4:
        return "omission", [
            "段落主体已覆盖，但部分内容有误或遗漏。",
            "建议按句对照原文，逐句修正。",
        ]
    return "mismatch", [
        "段落内容差异较大。",
        "建议先做提示模式巩固，再回到段落默写。",
    ]


def _label_reason(reason: str | None) -> str:
    if not reason:
        return "未知"
    return WRONG_REASON_LABELS.get(reason, reason)


async def _ai_diagnose_async(
    source_text: str, expected: str, actual: str, mode: str, score: int
) -> dict | None:
    """Fire-and-forget LLM diagnosis. Returns parsed dict or None on failure."""
    import httpx

    if not _settings.DASHSCOPE_API_KEY:
        return None

    prompt = _DIAGNOSE_PROMPT.format(
        mode=_MODE_LABELS.get(mode, mode),
        source=source_text[:200],
        expected=expected[:300],
        actual=actual[:300],
        score=score,
    )

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {_settings.DASHSCOPE_API_KEY}",
                },
                json={
                    "model": "qwen-turbo",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.3,
                    "max_tokens": 400,
                },
            )
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            start = content.index("{")
            end = content.rindex("}") + 1
            diagnosis = json.loads(content[start:end])

            # Normalize error_type to canonical key
            raw_type = diagnosis.get("error_type", "")
            diagnosis["reason_key"] = _LLM_REASON_MAP.get(raw_type, "mismatch")
            diagnosis["error_type"] = WRONG_REASON_LABELS.get(
                diagnosis["reason_key"], raw_type
            )
            return diagnosis
    except Exception:
        return None


def _adjust_difficulty(card: MemoryCard, result: str, score: int) -> None:
    """Dynamically adjust card difficulty based on actual performance.

    Uses a momentum-based approach:
      - Every review nudges difficulty slightly
      - Streaks of correct/wrong answers create stronger adjustments
      - No minimum review_count gate — adjusts from the start
    """
    current = card.difficulty or 3
    review_count = card.review_count or 0
    wrong_count = card.wrong_count or 0

    # Calculate recent wrong rate (capped at last 10 reviews for responsiveness)
    effective_reviews = min(review_count, 10)
    recent_wrong_rate = (wrong_count / effective_reviews) if effective_reviews > 0 else 0

    if result == "remembered" and score >= 90:
        # Correct answer — consider lowering difficulty
        if score >= 98 and recent_wrong_rate < 0.1:
            # Near-perfect: drop by 1
            card.difficulty = max(1, current - 1)
        elif score >= 95 and recent_wrong_rate < 0.2:
            # Very good: drop by 1 if not already easy
            if current > 2:
                card.difficulty = current - 1
        elif score >= 90 and recent_wrong_rate < 0.3:
            # Good: drop by 1 only if card is rated hard
            if current >= 4:
                card.difficulty = current - 1
    elif result == "forgot":
        # Wrong answer — consider raising difficulty
        if score < 30:
            # Complete blank: raise by 1
            card.difficulty = min(5, current + 1)
        elif score < 50 and recent_wrong_rate > 0.4:
            # Struggling significantly: raise by 1
            card.difficulty = min(5, current + 1)
        elif score < 65 and recent_wrong_rate > 0.5:
            # Consistent failure: raise by 1
            if current < 4:
                card.difficulty = current + 1
    elif result == "fuzzy":
        # Partial — only adjust if there's a clear pattern
        if score < 70 and recent_wrong_rate > 0.5 and current < 5:
            card.difficulty = current + 1


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


def _recommend_mode_for_card(card: MemoryCard) -> str:
    """Recommend the best training mode for a single card based on its state."""
    conf = card.confidence or 0
    reason = card.last_wrong_reason or ""
    wrong_count = card.wrong_count or 0

    # Error-pattern overrides
    if reason == "spelling" and wrong_count >= 2:
        return "cloze"
    if reason == "word_order" and wrong_count >= 2:
        return "paragraph"
    if reason in ("forgot", "omission") and wrong_count >= 3:
        return "write_en_to_zh"
    if reason == "grammar" and wrong_count >= 2:
        return "paragraph"

    # Confidence-based
    if conf < 30:
        return "write_en_to_zh"
    elif conf < 60:
        return "write_zh_to_en"
    elif conf < 80:
        return "cloze"
    else:
        return "paragraph"


_MODE_LABELS = {
    "write_en_to_zh": "看英文写中文",
    "write_zh_to_en": "看中文写英文",
    "cloze": "完形填空",
    "paragraph": "段落默写",
}

# Map LLM free-text error_type to canonical reason keys
_LLM_REASON_MAP = {
    "拼写错误": "spelling",
    "语法错误": "grammar",
    "词序错误": "word_order",
    "内容遗漏": "omission",
    "形近意近混淆": "confusion",
    "完全遗忘": "forgot",
    "段落缺失": "missing_content",
    "答案不匹配": "mismatch",
    "部分匹配": "partial_match",
    "spelling": "spelling",
    "grammar": "grammar",
    "word_order": "word_order",
    "omission": "omission",
    "confusion": "confusion",
    "forgot": "forgot",
    "missing_content": "missing_content",
    "mismatch": "mismatch",
    "partial_match": "partial_match",
}

_DIAGNOSE_PROMPT = """你是一个专业的语言学习诊断助手。学生做了一道记忆练习题，请详细分析错误原因并给出针对性建议。

题目类型：{mode}
提示内容：{source}
正确答案：{expected}
学生答案：{actual}
相似度分数：{score}%

请严格按以下JSON格式返回（不要加markdown标记或其他文字）：
{{"error_type": "必须从以下选择一个：拼写错误/语法错误/词序错误/内容遗漏/形近意近混淆/完全遗忘",
"error_detail": "具体描述哪里错了，为什么错（80字以内，指出具体差异点）",
"suggestions": ["针对性建议1", "针对性建议2", "针对性建议3"],
"encouragement": "一句简短的鼓励（20字以内）"}}"""



