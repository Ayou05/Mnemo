from app.core.casr import process_encounter


def test_process_encounter_increases_confidence_on_remembered():
    result = process_encounter(
        confidence=20.0,
        avg_think_time=1000,
        avg_verify_time=500,
        avg_flips=1.0,
        review_count=2,
        result="remembered",
        think_time=900,
        verify_time=400,
        flip_count=1,
    )
    assert result["confidence"] > 20.0
    assert result["scheduled_interval_min"] > 0


def test_process_encounter_penalizes_forgot():
    result = process_encounter(
        confidence=60.0,
        avg_think_time=2000,
        avg_verify_time=500,
        avg_flips=1.0,
        review_count=8,
        result="forgot",
        think_time=5000,
        verify_time=1000,
        flip_count=2,
    )
    assert result["confidence"] < 60.0
