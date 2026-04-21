import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, ForeignKey, Text, Integer, Float, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    nickname: Mapped[str | None] = mapped_column(String(50))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    locale: Mapped[str] = mapped_column(String(10), default="zh")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    tasks = relationship("Task", back_populates="user", cascade="all, delete-orphan")
    task_categories = relationship("TaskCategory", back_populates="user", cascade="all, delete-orphan")
    memory_cards = relationship("MemoryCard", back_populates="user", cascade="all, delete-orphan")
    card_sets = relationship("CardSet", back_populates="user", cascade="all, delete-orphan")
    schedules = relationship("Schedule", back_populates="user", cascade="all, delete-orphan")
    course_notes = relationship("CourseNote", back_populates="user", cascade="all, delete-orphan")
    checkins = relationship("DailyCheckin", back_populates="user", cascade="all, delete-orphan")


class TaskCategory(Base):
    __tablename__ = "task_categories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    color: Mapped[str] = mapped_column(String(20), default="#6366f1")  # hex color
    icon: Mapped[str | None] = mapped_column(String(50))  # emoji or icon name
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="task_categories")


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    priority: Mapped[str] = mapped_column(String(20), default="medium")  # high/medium/low
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending/in_progress/completed
    category: Mapped[str] = mapped_column(String(50), default="其他")
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    estimated_time: Mapped[int | None] = mapped_column(Integer)  # minutes
    tags: Mapped[str | None] = mapped_column(Text)  # JSON array
    subtasks: Mapped[str | None] = mapped_column(Text)  # JSON array of {title, done}
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="tasks")


class CardSet(Base):
    __tablename__ = "card_sets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    source_type: Mapped[str] = mapped_column(String(20), default="manual")  # manual/excel/word/text/ai
    card_count: Mapped[int] = mapped_column(Integer, default=0)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="card_sets")
    cards = relationship("MemoryCard", back_populates="card_set", cascade="all, delete-orphan")


class MemoryCard(Base):
    __tablename__ = "memory_cards"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    card_set_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("card_sets.id", ondelete="SET NULL"), index=True)
    source_text: Mapped[str] = mapped_column(Text, nullable=False)
    target_text: Mapped[str] = mapped_column(Text, nullable=False)
    source_lang: Mapped[str] = mapped_column(String(10), default="en")
    target_lang: Mapped[str] = mapped_column(String(10), default="zh")
    domain: Mapped[str] = mapped_column(String(50), default="通用")
    difficulty: Mapped[int] = mapped_column(Integer, default=3)  # 1-5
    card_type: Mapped[str] = mapped_column(String(20), default="bilingual")
    extra_data: Mapped[str | None] = mapped_column(Text)
    next_review: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    review_count: Mapped[int] = mapped_column(Integer, default=0)
    ease_factor: Mapped[float] = mapped_column(Float, default=2.5)
    interval_days: Mapped[int] = mapped_column(Integer, default=0)
    is_mastered: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    # CASR fields
    confidence: Mapped[float] = mapped_column(Float, default=0.0)  # 0-100
    avg_think_time: Mapped[float] = mapped_column(Float, default=0.0)  # ms
    avg_verify_time: Mapped[float] = mapped_column(Float, default=0.0)  # ms
    avg_flips: Mapped[float] = mapped_column(Float, default=0.0)
    wrong_count: Mapped[int] = mapped_column(Integer, default=0)
    last_wrong_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_wrong_reason: Mapped[str | None] = mapped_column(String(20))
    last_score: Mapped[int | None] = mapped_column(Integer)
    last_mode: Mapped[str | None] = mapped_column(String(30))
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # drip-feed: NULL = not yet released
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="memory_cards")
    card_set = relationship("CardSet", back_populates="cards")


class CardEncounter(Base):
    """CASR encounter log — one record per card review interaction."""
    __tablename__ = "card_encounters"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    card_id: Mapped[str] = mapped_column(String(36), ForeignKey("memory_cards.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # Behavioral signals
    think_time: Mapped[int] = mapped_column(Integer, default=0)  # ms: front → first flip
    verify_time: Mapped[int] = mapped_column(Integer, default=0)  # ms: flip → button click
    flip_count: Mapped[int] = mapped_column(Integer, default=1)
    # User judgment
    result: Mapped[str] = mapped_column(String(10), nullable=False)  # forgot / fuzzy / remembered
    wrong_reason: Mapped[str | None] = mapped_column(String(30))
    # Algorithm state
    confidence_before: Mapped[float] = mapped_column(Float, default=0.0)
    confidence_after: Mapped[float] = mapped_column(Float, default=0.0)
    scheduled_interval_min: Mapped[int] = mapped_column(Integer, default=0)  # minutes until next review
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CourseNote(Base):
    __tablename__ = "course_notes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    raw_transcript: Mapped[str | None] = mapped_column(Text)
    cleaned_text: Mapped[str | None] = mapped_column(Text)
    structured_notes: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    course_name: Mapped[str | None] = mapped_column(String(200))
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    audio_file_url: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="course_notes")


class Schedule(Base):
    __tablename__ = "schedules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), default="我的课表")
    version: Mapped[int] = mapped_column(Integer, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    source_file_url: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="schedules")
    entries = relationship("ScheduleEntry", back_populates="schedule", cascade="all, delete-orphan")


class ScheduleEntry(Base):
    __tablename__ = "schedule_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    schedule_id: Mapped[str] = mapped_column(String(36), ForeignKey("schedules.id", ondelete="CASCADE"), nullable=False, index=True)
    course_name: Mapped[str] = mapped_column(String(200), nullable=False)
    teacher: Mapped[str | None] = mapped_column(String(100))
    location: Mapped[str | None] = mapped_column(String(200))
    day_of_week: Mapped[int] = mapped_column(Integer, default=1)
    start_time: Mapped[str] = mapped_column(String(10))
    end_time: Mapped[str] = mapped_column(String(10))
    weeks: Mapped[str | None] = mapped_column(String(200))
    color: Mapped[str | None] = mapped_column(String(20))

    schedule = relationship("Schedule", back_populates="entries")


class DailyCheckin(Base):
    __tablename__ = "daily_checkins"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    checkin_date: Mapped[str] = mapped_column(String(10), nullable=False)  # YYYY-MM-DD
    tasks_completed: Mapped[int] = mapped_column(Integer, default=0)
    cards_reviewed: Mapped[int] = mapped_column(Integer, default=0)
    study_minutes: Mapped[int] = mapped_column(Integer, default=0)
    notes_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="checkins")


class TaskPlanTemplate(Base):
    __tablename__ = "task_plan_templates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    month: Mapped[str] = mapped_column(String(7), nullable=False, index=True)  # YYYY-MM
    source_filename: Mapped[str | None] = mapped_column(String(255))
    export_mapping: Mapped[str | None] = mapped_column(Text)  # JSON mapping for export columns
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    entries = relationship("TaskPlanEntry", back_populates="template", cascade="all, delete-orphan")


class TaskPlanEntry(Base):
    __tablename__ = "task_plan_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    template_id: Mapped[str] = mapped_column(String(36), ForeignKey("task_plan_templates.id", ondelete="CASCADE"), nullable=False, index=True)
    day: Mapped[int] = mapped_column(Integer, nullable=False)
    planned_text: Mapped[str] = mapped_column(Text, default="")
    actual_text: Mapped[str | None] = mapped_column(Text)
    manual_text: Mapped[str | None] = mapped_column(Text)
    completion_rate: Mapped[float | None] = mapped_column(Float)
    locked: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    template = relationship("TaskPlanTemplate", back_populates="entries")
