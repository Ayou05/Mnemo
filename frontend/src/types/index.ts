export interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: "high" | "medium" | "low";
  status: "pending" | "in_progress" | "completed";
  category: string;
  due_date: string | null;
  estimated_time: number | null;
  tags: string[] | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemoryCard {
  id: string;
  source_text: string;
  target_text: string;
  source_lang: string;
  target_lang: string;
  domain: string;
  difficulty: number;
  card_type: string;
  extra_data: Record<string, unknown> | null;
  next_review: string;
  review_count: number;
  ease_factor: number;
  interval_days: number;
  created_at: string;
  updated_at: string;
}

export interface CourseNote {
  id: string;
  title: string;
  raw_transcript: string | null;
  cleaned_text: string | null;
  structured_notes: string | null;
  summary: string | null;
  course_name: string | null;
  duration_seconds: number | null;
  created_at: string;
}

export interface Schedule {
  id: string;
  name: string;
  version: number;
  is_active: boolean;
  entries: ScheduleEntry[];
  created_at: string;
}

export interface ScheduleEntry {
  id: string;
  course_name: string;
  teacher: string | null;
  location: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  weeks: string | null;
  color: string | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}
