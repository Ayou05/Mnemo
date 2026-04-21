import json
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
import email_validator  # noqa: F401


# ── Auth ──

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=100)
    nickname: Optional[str] = None


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: str
    username: str
    email: str
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None
    is_active: bool
    locale: str = "zh"
    created_at: datetime

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ── Task Categories ──

class TaskCategoryCreate(BaseModel):
    name: str = Field(..., max_length=50)
    color: str = Field(default="#6366f1", max_length=20)
    icon: Optional[str] = Field(None, max_length=50)
    sort_order: int = 0


class TaskCategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = Field(None, max_length=20)
    icon: Optional[str] = Field(None, max_length=50)
    sort_order: Optional[int] = None


class TaskCategoryOut(BaseModel):
    id: str
    name: str
    color: str
    icon: Optional[str]
    sort_order: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Tasks ──

class SubtaskItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    is_completed: bool = False

    @model_validator(mode="before")
    @classmethod
    def normalize_legacy_shape(cls, value):
        if isinstance(value, dict) and "done" in value and "is_completed" not in value:
            value = {**value, "is_completed": value["done"]}
        return value


class TaskCreate(BaseModel):
    title: str = Field(..., max_length=200)
    description: Optional[str] = None
    priority: str = Field(default="medium", pattern="^(high|medium|low)$")
    status: str = Field(default="pending", pattern="^(pending|in_progress|completed)$")
    category: str = Field(default="其他", max_length=50)
    due_date: Optional[datetime] = None
    estimated_time: Optional[int] = None
    tags: Optional[list[str]] = None
    subtasks: Optional[list[SubtaskItem]] = None
    is_pinned: bool = False


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    priority: Optional[str] = Field(None, pattern="^(high|medium|low)$")
    status: Optional[str] = Field(None, pattern="^(pending|in_progress|completed)$")
    category: Optional[str] = Field(None, max_length=50)
    due_date: Optional[datetime] = None
    estimated_time: Optional[int] = None
    tags: Optional[list[str]] = None
    subtasks: Optional[list[SubtaskItem]] = None
    is_pinned: Optional[bool] = None


class TaskOut(BaseModel):
    id: str
    title: str
    description: Optional[str]
    priority: str
    status: str
    category: str
    due_date: Optional[datetime]
    estimated_time: Optional[int]
    tags: Optional[list[str]]
    subtasks: Optional[list[SubtaskItem]]
    completed_at: Optional[datetime]
    is_pinned: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("tags", mode="before")
    @classmethod
    def parse_tags(cls, value):
        if value in (None, ""):
            return None
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
            except json.JSONDecodeError:
                return []
            return parsed if isinstance(parsed, list) else []
        return value

    @field_validator("subtasks", mode="before")
    @classmethod
    def parse_subtasks(cls, value):
        if value in (None, ""):
            return None
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
            except json.JSONDecodeError:
                return []
            return parsed if isinstance(parsed, list) else []
        return value


# ── Card Sets ──

class CardSetCreate(BaseModel):
    name: str = Field(..., max_length=200)
    description: Optional[str] = None
    source_type: str = Field(default="manual", max_length=20)


class CardSetUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    is_pinned: Optional[bool] = None


class CardSetOut(BaseModel):
    id: str
    name: str
    description: Optional[str]
    source_type: str
    card_count: int
    is_pinned: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class CardSetDetailOut(BaseModel):
    id: str
    name: str
    description: Optional[str]
    source_type: str
    card_count: int
    is_pinned: bool
    created_at: datetime
    cards: list = []

    model_config = {"from_attributes": True}


# ── Memory Cards ──

class MemoryCardCreate(BaseModel):
    source_text: str = Field(..., min_length=1)
    target_text: str = Field(..., min_length=1)
    source_lang: str = Field(default="en", max_length=10)
    target_lang: str = Field(default="zh", max_length=10)
    domain: str = Field(default="通用", max_length=50)
    difficulty: int = Field(default=3, ge=1, le=5)
    card_type: str = Field(default="bilingual", max_length=20)
    card_set_id: Optional[str] = None
    extra_data: Optional[dict] = None


class MemoryCardUpdate(BaseModel):
    source_text: Optional[str] = None
    target_text: Optional[str] = None
    source_lang: Optional[str] = Field(None, max_length=10)
    target_lang: Optional[str] = Field(None, max_length=10)
    domain: Optional[str] = Field(None, max_length=50)
    difficulty: Optional[int] = Field(None, ge=1, le=5)
    card_type: Optional[str] = Field(None, max_length=20)
    extra_data: Optional[dict] = None


class MemoryCardOut(BaseModel):
    id: str
    card_set_id: Optional[str]
    source_text: str
    target_text: str
    source_lang: str
    target_lang: str
    domain: str
    difficulty: int
    card_type: str
    extra_data: Optional[str]
    next_review: Optional[datetime]
    review_count: int
    ease_factor: float
    interval_days: int
    is_mastered: bool
    sort_order: int
    # CASR fields
    confidence: float = 0.0
    avg_think_time: float = 0.0
    avg_verify_time: float = 0.0
    avg_flips: float = 0.0
    wrong_count: int = 0
    last_wrong_at: Optional[datetime] = None
    last_wrong_reason: Optional[str] = None
    last_score: Optional[int] = None
    last_mode: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReviewResult(BaseModel):
    quality: int = Field(..., ge=0, le=5, description="0=blackout, 1=incorrect, 2=incorrect(easy), 3=correct(hard), 4=correct, 5=perfect")


class CASREncounter(BaseModel):
    """CASR review submission with behavioral signals."""
    result: str = Field(..., pattern="^(forgot|fuzzy|remembered)$")
    think_time: int = Field(default=0, ge=0, description="ms from card shown to first flip")
    verify_time: int = Field(default=0, ge=0, description="ms from flip to button click")
    flip_count: int = Field(default=1, ge=1, description="number of times card was flipped")


class CASRResponse(BaseModel):
    """Response after CASR encounter processing."""
    card_id: str
    confidence_before: float
    confidence_after: float
    result: str
    evolution_mode: str
    scheduled_interval_min: int
    is_mastered: bool


class CASRQueueItem(BaseModel):
    """Card item in CASR review queue."""
    id: str
    source_text: str
    target_text: str
    source_lang: str = "en"
    target_lang: str = "zh"
    card_type: str = "bilingual"
    confidence: float = 0.0
    review_count: int = 0
    evolution_mode: str = "standard"
    card_set_id: Optional[str] = None

    model_config = {"from_attributes": True}


class MemoryStats(BaseModel):
    total: int
    mastered: int
    due_today: int
    total_reviews: int
    avg_ease: float
    mastery_rate: float
    domains: dict
    difficulties: dict


# ── Course Notes ──

class CourseNoteCreate(BaseModel):
    title: str = Field(..., max_length=200)
    raw_transcript: Optional[str] = None
    cleaned_text: Optional[str] = None
    structured_notes: Optional[str] = None
    summary: Optional[str] = None
    course_name: Optional[str] = Field(None, max_length=100)
    duration_seconds: Optional[int] = None


class CourseNoteOut(BaseModel):
    id: str
    title: str
    raw_transcript: Optional[str]
    cleaned_text: Optional[str]
    structured_notes: Optional[str]
    summary: Optional[str]
    course_name: Optional[str]
    duration_seconds: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Schedule ──

class ScheduleCreate(BaseModel):
    name: str = Field(..., max_length=100)
    entries: list["ScheduleEntryCreate"] = []


class ScheduleEntryCreate(BaseModel):
    course_name: str = Field(..., max_length=200)
    teacher: Optional[str] = None
    location: Optional[str] = None
    day_of_week: int = Field(..., ge=1, le=7)
    start_time: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    end_time: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    weeks: Optional[list[int]] = None
    color: Optional[str] = None


class ScheduleEntryOut(BaseModel):
    id: str
    course_name: str
    teacher: Optional[str]
    location: Optional[str]
    day_of_week: int
    start_time: str
    end_time: str
    weeks: Optional[str]
    color: Optional[str]

    model_config = {"from_attributes": True}


class ScheduleOut(BaseModel):
    id: str
    name: str
    version: int
    is_active: bool
    entries: list[ScheduleEntryOut] = []
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Daily Checkin ──

class DailyCheckinCreate(BaseModel):
    checkin_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    tasks_completed: int = 0
    cards_reviewed: int = 0
    study_minutes: int = 0
    notes_count: int = 0


class DailyCheckinOut(BaseModel):
    id: str
    checkin_date: str
    tasks_completed: int
    cards_reviewed: int
    study_minutes: int
    notes_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class TaskPlanEntryOut(BaseModel):
    id: str
    day: int
    planned_text: str
    actual_text: Optional[str] = None
    manual_text: Optional[str] = None
    completion_rate: Optional[float] = None
    locked: bool
    updated_at: datetime

    model_config = {"from_attributes": True}


class TaskPlanTemplateOut(BaseModel):
    id: str
    name: str
    month: str
    source_filename: Optional[str] = None
    export_mapping: Optional[str] = None
    entries: list[TaskPlanEntryOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
