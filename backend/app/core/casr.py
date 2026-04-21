"""
CASR — Confidence-Adaptive Spaced Repetition

A memory scheduling algorithm that uses behavioral signals (response time,
flip count) alongside user self-judgment to build a more accurate model of
memory strength than traditional SM-2.

Scientific basis:
  - Ebbinghaus (1885): Forgetting curve — memory decays over time
  - Nelson et al. (1984): Response time is a direct indicator of memory strength
  - Wiertelak et al. (2025): RT reflects retrieval fluency (Nature Sci Reports)
  - Hart (1965): Feeling-of-knowing judgments are only 60-70% accurate
  - Bjork (2020): Desirable difficulties — slightly hard learning is optimal
  - Wixted & Ebbesen (1991): Real forgetting follows power-law, not exponential
  - Cepeda et al. (2006): Spacing effect is one of the most robust findings
  - Roediger & Karpicke (2006): Testing effect — active recall > passive review
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone


# ═══════════════════════════════════════════════════
# Constants
# ═══════════════════════════════════════════════════

# EMA smoothing factor — gives 70% weight to history, 30% to new signal
EMA_ALPHA = 0.3

# Base result deltas (user self-judgment)
RESULT_DELTAS = {
    "forgot": -20,
    "fuzzy": 5,
    "remembered": 12,
}

# Think-time penalties (Nelson 1984: RT is memory strength indicator)
THINK_TIME_PENALTIES = [
    (10_000, -12),   # >10s: clearly didn't know
    (5_000, -6),     # >5s: hesitated significantly
    (3_000, -3),     # >3s: slight hesitation
]

# Flip-count penalties (Bjork 2020: hesitation = unstable memory)
FLIP_PENALTIES = [
    (3, -8),         # flipped 3+ times: clearly uncertain
    (2, -4),         # flipped 2 times: somewhat uncertain
]

# Verify-time penalty (Wiertelak 2025: confirmation time reflects fluency)
VERIFY_TIME_PENALTY = (5_000, -5)  # >5s staring at answer

# Scheduling intervals by confidence band (power-law inspired)
# Maps confidence ranges to base intervals in minutes
SCHEDULE_BANDS = [
    (0, 15, 10),         # 10 min — just learned / just forgot
    (16, 30, 60),        # 1 hour — still unfamiliar
    (31, 45, 240),       # 4 hours — starting to stick
    (46, 60, 1440),      # 1 day — basically knows it
    (61, 75, 4320),      # 3 days — fairly familiar
    (76, 85, 10080),     # 7 days — well known
    (86, 95, 20160),     # 14 days — very familiar
    (96, 100, 43200),    # 30 days — mastered
]

# Think-time interval modifiers (slow thinkers get shorter intervals)
THINK_TIME_MODIFIERS = [
    (5_000, 0.7),   # very slow: shorten by 30%
    (3_000, 0.85),  # somewhat slow: shorten by 15%
    (1_500, 1.1),   # fast: lengthen by 10%
]

# Card evolution thresholds (Bjork 2020: desirable difficulties)
EVOLUTION_HINT = 25       # below: show both sides
EVOLUTION_STANDARD = 50   # below: standard flip mode
EVOLUTION_TIMED = 75      # below: timed auto-flip
# above 75: flash mode (1.5s then hide)


# ═══════════════════════════════════════════════════
# Core Algorithm
# ═══════════════════════════════════════════════════

def compute_behavior_delta(think_time: int, verify_time: int, flip_count: int) -> int:
    """
    Compute confidence adjustment based on behavioral signals.

    The key insight (Nelson 1984, Wiertelak 2025): response time and
    hesitation patterns are more honest indicators of memory strength
    than self-reported judgment (Hart 1965: only 60-70% accurate).
    """
    delta = 0

    # Think-time penalties
    for threshold, penalty in THINK_TIME_PENALTIES:
        if think_time >= threshold:
            delta += penalty
            break

    # Flip-count penalties
    for threshold, penalty in FLIP_PENALTIES:
        if flip_count >= threshold:
            delta += penalty
            break

    # Verify-time penalty
    if verify_time >= VERIFY_TIME_PENALTY[0]:
        delta += VERIFY_TIME_PENALTY[1]

    return delta


def update_confidence(
    old_confidence: float,
    result: str,
    think_time: int,
    verify_time: int,
    flip_count: int,
) -> float:
    """
    Update confidence using EMA (Exponential Moving Average).

    Formula: new = old × (1 - α) + (old + delta) × α
    where α = 0.3, delta = result_delta + behavior_delta

    The EMA prevents a single failure from wiping out accumulated
    confidence, while still being responsive to new evidence.
    """
    # Step 1: User's self-judgment
    result_delta = RESULT_DELTAS.get(result, 0)

    # Step 2: Behavioral correction (algorithm is more honest than user)
    behavior_delta = compute_behavior_delta(think_time, verify_time, flip_count)

    # Step 3: EMA update
    effective_delta = result_delta + behavior_delta
    new_confidence = old_confidence * (1 - EMA_ALPHA) + (old_confidence + effective_delta) * EMA_ALPHA

    return max(0.0, min(100.0, new_confidence))


def compute_interval(confidence: float, avg_think_time: float) -> int:
    """
    Compute next review interval in minutes.

    Uses power-law inspired bands (Wixted & Ebbesen 1991) rather than
    SM-2's exponential decay. Power-law better models long-term memory:
    fast initial decay, then much slower decline.

    Interval is further adjusted by avg_think_time: slower thinkers
    get shorter intervals (they need more practice).
    """
    # Find base interval from confidence band
    base_interval = 10  # default 10 min
    for low, high, minutes in SCHEDULE_BANDS:
        if low <= confidence <= high:
            base_interval = minutes
            break

    # Apply think-time modifier
    modifier = 1.0
    for threshold, mod in THINK_TIME_MODIFIERS:
        if avg_think_time >= threshold:
            modifier = mod
            break

    return max(1, int(base_interval * modifier))


def get_evolution_mode(confidence: float) -> str:
    """
    Determine card display mode based on confidence.

    Based on Bjork (2020) "Desirable Difficulties":
    - Too easy = no reinforcement
    - Too hard = frustration
    - Just right = optimal learning

    Returns: "hint" | "standard" | "timed" | "flash"
    """
    if confidence < EVOLUTION_HINT:
        return "hint"
    elif confidence < EVOLUTION_STANDARD:
        return "standard"
    elif confidence < EVOLUTION_TIMED:
        return "timed"
    else:
        return "flash"


def process_encounter(
    confidence: float,
    avg_think_time: float,
    avg_verify_time: float,
    avg_flips: float,
    review_count: int,
    result: str,
    think_time: int,
    verify_time: int,
    flip_count: int,
) -> dict:
    """
    Full CASR encounter processing.

    Returns dict with all updated fields for the card.
    """
    # Update confidence
    new_confidence = update_confidence(
        confidence, result, think_time, verify_time, flip_count
    )

    # Update running averages (simple moving average)
    new_review_count = review_count + 1
    n = new_review_count
    new_avg_think = (avg_think_time * (n - 1) + think_time) / n
    new_avg_verify = (avg_verify_time * (n - 1) + verify_time) / n
    new_avg_flips = (avg_flips * (n - 1) + flip_count) / n

    # Compute next interval
    interval_min = compute_interval(new_confidence, new_avg_think)
    next_review = datetime.now(timezone.utc) + timedelta(minutes=interval_min)

    # Determine mastery
    is_mastered = new_confidence >= 90 and new_review_count >= 5

    return {
        "confidence": round(new_confidence, 1),
        "avg_think_time": round(new_avg_think, 0),
        "avg_verify_time": round(new_avg_verify, 0),
        "avg_flips": round(new_avg_flips, 2),
        "review_count": new_review_count,
        "interval_days": max(1, interval_min // 1440),
        "next_review": next_review,
        "is_mastered": is_mastered,
        "evolution_mode": get_evolution_mode(new_confidence),
        "scheduled_interval_min": interval_min,
    }
