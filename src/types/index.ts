import type { CourseCatalogDetails } from '@/lib/course-catalog'

export type UserRole = 'user' | 'student' | 'teacher' | 'admin'

export interface User {
  id: string
  email: string | null
  display_name: string | null
  role: UserRole
  status: string
  photo_url: string | null
  phone_number: string | null
  bio: string | null
  birth_date: string | null
  gender: string | null
  preferred_language: string | null
  country: string | null
  timezone: string | null
  nationality: string | null
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Language {
  code: string
  name: { id: string; en: string }
  native_name: string
  flag_emoji: string
  is_rtl: boolean
  level_framework: string
  is_active: boolean
  sort_order: number
}

export type CatalogTier = 'basic' | 'advance' | 'expert'
export type CatalogTrack = 'fast_track' | 'regular' | 'intensive'

export interface LanguageLevel {
  id: string
  language_code: string
  code: string
  tier?: CatalogTier | null
  name: { id: string; en: string }
  sort_order: number
  is_active: boolean
}

export interface Program {
  id: string
  language_code: string
  slug: string
  name: { id: string; en: string }
  description: { id: string; en: string }
  program_type: string
  tier?: CatalogTier | null
  track_type?: CatalogTrack | null
  details?: CourseCatalogDetails
  display_order: number
  passing_score: number
  attendance_weight: number
  assignment_weight: number
  quiz_weight: number
  exam_weight: number
  is_active: boolean
}

export interface Teacher {
  id: string
  user_id: string
  headline: string | null
  bio: string | null
  experience_years: number | null
  certifications: string[]
  hourly_rate: number | null
  availability: Record<string, unknown>
  marketplace_visible: boolean
  status: string
  created_at: string
  updated_at: string
  user?: User
  languages?: TeacherLanguage[]
}

export interface TeacherLanguage {
  id: string
  teacher_id: string
  language_code: string
  levels: string[]
  is_native: boolean
  language?: Language
}

export interface Course {
  id: string
  program_id: string
  language_code: string
  level_id: string
  tier?: CatalogTier | null
  track_type?: CatalogTrack | null
  title: { id: string; en: string }
  description: { id: string; en: string }
  syllabus: unknown
  details?: CourseCatalogDetails
  min_students: number
  max_students: number
  status: string
  mode: string
  is_visible_marketplace: boolean
  price: number
  meeting_count: number
  project_count: number
  is_try_class: boolean
  starts_at: string | null
  ends_at: string | null
  created_at: string
  updated_at: string
  teacher?: User
  program?: Program
  language?: Language
  level?: LanguageLevel
}

export interface Enrollment {
  id: string
  user_id: string
  course_id: string
  teacher_id: string | null
  batch_id: string | null
  status: string
  enrolled_at: string
  completed_at: string | null
  course?: Course
  grade?: GradeAggregate
}

export interface PlacementTest {
  id: string
  language_code: string
  title: { id: string; en: string }
  question_count: number
  time_limit_minutes: number
  is_active: boolean
}

export interface PlacementResult {
  id: string
  test_id: string
  user_id: string
  provisional_level: string
  score: number
  completed_at: string
}

export interface LiveSession {
  id: string
  course_id: string
  teacher_id: string | null
  title: string
  description: string | null
  provider: string
  meeting_link: string
  starts_at: string
  duration_minutes: number
  status: string
  created_at: string
}

export interface Attendance {
  id: string
  session_id: string
  user_id: string
  status: string
  marked_at: string
}

export interface Material {
  id: string
  course_id: string
  folder_id: string | null
  title: string
  description: string | null
  file_type: string
  file_url: string | null
  external_url: string | null
  is_required: boolean
  sort_order: number
  created_at: string
}

export interface Assignment {
  id: string
  course_id: string
  teacher_id: string | null
  title: string
  instructions: string
  max_grade: number
  due_date: string
  resubmission_allowed: boolean
  status: string
  created_at: string
  updated_at: string
}

export interface Submission {
  id: string
  assignment_id: string
  user_id: string
  file_url: string | null
  notes: string | null
  status: string
  submitted_at: string | null
  grade: number | null
  feedback: string | null
  graded_by: string | null
  graded_at: string | null
}

export interface AssignmentGrade {
  submission_id: string
  grade: number
  feedback: string | null
  graded_at: string | null
  graded_by: string | null
}

export interface QuizQuestion {
  id: string
  quiz_id: string
  question_type: string
  question_text: string
  options: unknown
  correct_answer: string
  points: number
  sort_order: number
}

export interface Quiz {
  id: string
  course_id: string
  title: string
  description: string | null
  time_limit_minutes: number | null
  passing_score: number
  attempt_limit: number
  status: string
  questions?: QuizQuestion[]
}



export interface QuizAttempt {
  id: string
  quiz_id: string
  user_id: string
  attempt_number: number
  score: number | null
  status: string
  answers: unknown
  submitted_at: string | null
}

export interface FinalExam {
  id: string
  course_id: string
  teacher_id: string
  title: string
  description: string | null
  time_limit_minutes: number
  passing_score: number
  max_attempts: number
  status: string
  is_published: boolean
  created_at: string
  updated_at: string
}

export interface FinalExamAttempt {
  id: string
  exam_id: string
  user_id: string
  course_id: string
  score: number
  total_points: number
  answers: Record<string, string | string[]>
  essay_scores: Record<string, number>
  status: string
  started_at: string | null
  submitted_at: string | null
}

export interface GradeAggregate {
  id: string
  enrollment_id: string
  attendance_score: number
  assignment_average: number
  quiz_average: number
  final_exam_score: number
  task_score: number
  weighted_total: number
  grade_letter: string
  grade_points: number
  is_passing: boolean
  last_updated: string
}

export interface Certificate {
  id: string
  enrollment_id: string
  user_id: string
  course_id: string
  certificate_code: string
  language_code: string
  final_grade: number
  issue_date: string
  status: string
  pdf_url: string | null
}

export interface Batch {
  id: string
  course_id: string
  teacher_id: string
  name: string
  schedule: unknown
  zoom_link: string | null
  max_students: number
  status: 'active' | 'completed' | 'cancelled'
  start_date: string | null
  end_date: string | null
  created_at: string
  updated_at: string
  course?: Course
  teacher?: User
  enrollments?: Enrollment[]
}

export interface Payment {
  id: string
  enrollment_id: string | null
  user_id: string
  invoice_number: string
  amount: number
  description: string
  proof_url: string | null
  status: 'pending' | 'awaiting_proof' | 'under_review' | 'approved' | 'rejected' | 'paid' | 'cancelled'
  purpose: 'course' | 'placement' | string
  admin_notes: string | null
  due_date: string | null
  paid_at: string | null
  created_at: string
  updated_at: string
}

export interface TeacherProposal {
  id: string
  user_id: string
  status: 'pending' | 'approved' | 'rejected'
  headline: string | null
  bio: string | null
  experience_years: number | null
  education: string | null
  certifications: any[]
  documents_url: string[]
  languages_offered: string[]
  preferred_hourly_rate: number | null
  reviewed_by: string | null
  reviewed_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  user?: User
}

export interface News {
  id: string
  title: { id: string; en: string }
  content: { id: string; en: string }
  thumbnail: string | null
  target_audience: 'all' | 'student' | 'teacher' | 'admin'
  slug: string
  status: 'draft' | 'published' | 'archived'
  author_id: string
  published_at: string | null
  created_at: string
  updated_at: string
  author?: User
}

export interface Event {
  id: string
  title: { id: string; en: string }
  description: { id: string; en: string }
  date: string
  end_date: string | null
  location: string | null
  image_url: string | null
  registration_url: string | null
  max_participants: number | null
  status: 'draft' | 'published' | 'cancelled'
  created_at: string
  updated_at: string
}

export interface FAQ {
  id: string
  question: { id: string; en: string }
  answer: { id: string; en: string }
  category: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Testimonial {
  id: string
  name: string
  role: string | null
  text: { id: string; en: string }
  avatar_url: string | null
  rating: number
  sort_order: number
  is_active: boolean
  created_at: string
}

export interface Partner {
  id: string
  name: string
  logo_url: string | null
  website_url: string | null
  sort_order: number
  is_active: boolean
  created_at: string
}

export interface SystemSettings {
  id: string
  key: string
  value: unknown
  description?: string | null
  group?: string | null
  updated_at: string
}

export interface AuditLog {
  id: string
  user_id: string
  action: string
  entity_type: string
  entity_id: string | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
  user?: Pick<User, 'id' | 'display_name' | 'email' | 'role'>
}

export interface DiscussionPost {
  id: string
  course_id: string
  parent_id: string | null
  user_id: string
  title: string | null
  content: string
  is_pinned: boolean
  is_locked: boolean
  is_deleted: boolean
  created_at: string
  updated_at: string
  user?: User
  replies?: DiscussionPost[]
}

export interface Notification {
  id: string
  user_id: string
  sender_id: string | null
  type: string // 'meeting' | 'assignment' | 'quiz' | 'exam' | 'grade' | 'certificate' | 'info'
  title: string
  body: string
  link: string
  is_read: boolean
  created_at: string
  template_key?: string | null
  params?: Record<string, string | number> | null
  sender?: Pick<User, 'id' | 'display_name' | 'photo_url' | 'role'>
}

export interface BatchmateProfile {
  id: string
  display_name: string | null
  photo_url: string | null
  bio: string | null
  country: string | null
  preferred_language: string | null
  role: UserRole
  status: string
  course_id: string
  batch_id: string
  batch_name: string | null
}

export type TaskStatus = 'draft' | 'published' | 'archived'
export type LessonUnlockRule = 'all_available' | 'sequential' | 'minimum_score'
export type ActivityUnlockRule = 'all_available' | 'sequential'
export type CompletionRequirement = 'all_lessons'
export type ProgressStatus = 'not_started' | 'in_progress' | 'completed'
export type BatchTaskStatus = 'published' | 'unpublished'

export interface CourseTask {
  id: string
  course_id: string
  teacher_id: string | null
  task_number: number
  title: string
  description: string | null
  cover_image_url: string | null
  sort_order: number
  status: TaskStatus
  sequential_learning: boolean
  estimated_duration?: string | null
  min_completion_score?: number
  completion_requirement?: CompletionRequirement
  lesson_unlock_rule?: LessonUnlockRule
  required_lesson_score?: number
  activity_unlock_rule?: ActivityUnlockRule
  content_version?: number
  dialog_enabled?: boolean
  dialog_topic?: string | null
  dialog_character_name?: string | null
  dialog_character_role?: string | null
  dialog_instructions?: string | null
  dialog_duration_sec?: number
  created_at: string
  updated_at: string
}

export type TaskMaterialType = 'text' | 'video' | 'audio' | 'pdf' | 'image' | 'file' | 'link' | 'quiz' | 'exercise'

export interface TaskMaterial {
  id: string
  task_id: string
  title: string
  description: string | null
  sort_order: number
  content_type: TaskMaterialType
  content: string | null
  content_url: string | null
  is_required: boolean
  created_at: string
  updated_at: string
}

export type MaterialProgressStatus = 'not_started' | 'in_progress' | 'completed'

export interface StudentMaterialProgress {
  id: string
  user_id: string
  material_id: string
  status: MaterialProgressStatus
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface BatchmateCertificate {
  id: string
  user_id: string
  course_id: string
  certificate_code: string
  issue_date: string
  pdf_url: string | null
  language_code: string
  status: string
  course_title: { id: string; en: string } | null
}

// ============================================================
// LEARNING MANAGEMENT SYSTEM (LMS)
// ============================================================

export type ActivityType =
  | 'reading'
  | 'listening'
  | 'image_speak'
  | 'speaking_review'

export type MissionType =
  | 'quiz_challenge'
  | 'speaking_challenge'
  | 'writing_challenge'
  | 'interactive_dialogue'
  | 'ai_conversation'

export interface TaskLesson {
  id: string
  task_id: string
  lesson_number: number
  title: string
  description: string | null
  icon: string | null
  estimated_duration: string | null
  sort_order: number
  status: TaskStatus
  content_version: number
  created_at: string
  updated_at: string
}

export interface LessonActivity {
  id: string
  lesson_id: string
  activity_type: ActivityType
  title: string
  instruction: string | null
  sort_order: number
  status: TaskStatus
  content_version: number
  created_at: string
  updated_at: string
}

export interface ActivityContent {
  id: string
  activity_id: string
  content_type: ActivityType
  schema_version: number
  content_version: number
  content: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface TaskMission {
  id: string
  task_id: string
  title: string
  mission_type: MissionType
  scenario: string | null
  objectives: string[]
  passing_score: number
  max_attempts: number | null
  unlock_next: boolean
  status: TaskStatus
  content: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface BatchTask {
  id: string
  batch_id: string
  task_id: string
  sort_order: number
  status: BatchTaskStatus
  availability_start: string | null
  availability_end: string | null
  override_enabled: boolean
  override_title: string | null
  override_duration: string | null
  created_at: string
  updated_at: string
}

export interface StudentTaskProgress {
  id: string
  user_id: string
  batch_id: string
  task_id: string
  status: ProgressStatus
  total_lessons: number
  completed_lessons: number
  total_activities: number
  completed_activities: number
  last_lesson_id: string | null
  last_activity_id: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface StudentLessonProgress {
  id: string
  user_id: string
  batch_id: string
  task_id: string
  lesson_id: string
  status: ProgressStatus
  score: number | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface StudentActivityProgress {
  id: string
  user_id: string
  batch_id: string
  task_id: string
  lesson_id: string
  activity_id: string
  status: ProgressStatus
  score: number | null
  attempts: number
  answers: Record<string, unknown> | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface StudentMissionResult {
  id: string
  user_id: string
  batch_id: string
  task_id: string
  mission_id: string
  score: number
  passed: boolean
  attempts: number
  payload: Record<string, unknown> | null
  created_at: string
}

export interface ActivityLibraryItem {
  id: string
  activity_type: ActivityType
  title: string
  description: string | null
  content: Record<string, unknown>
  usage_count: number
  created_at: string
  updated_at: string
}

export interface DialogSession {
  id: string
  user_id: string
  batch_id: string
  task_id: string
  topic: string
  character_name: string | null
  character_role: string | null
  language_code: string
  status: 'active' | 'completed' | 'expired' | 'abandoned'
  started_at: string
  ends_at: string | null
  completed_at: string | null
  turns: Array<Record<string, unknown>>
  feedback: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

// ---------- Activity content shapes (visual builder only) ----------

export interface LmsQuizQuestion {
  question: string
  options: string[]
  answer: number
  explanation?: string | null
}

export interface LearnSlide {
  title: string
  body: string
  image_url?: string | null
}

export interface FlashcardCard {
  front: string
  back: string
  image_url?: string | null
}

export interface VocabularyItem {
  term: string
  translation: string
  example?: string | null
  image_url?: string | null
}

export interface ListeningContent {
  audio_url?: string | null
  audio_text?: string | null
  voice?: string | null
  speed?: number
  instructions?: string
}

export interface ReadingContent {
  text: string
  instructions?: string
}

export interface ImageSpeakContent {
  prompt: string
  images: string[]
  correctIndex: number
  expectedText: string
  threshold?: number
  instructions?: string
}

export interface SpeakingReviewContent {
  text: string
  instructions?: string
  voice?: string | null
  rate?: number
  /** Passage text for karaoke display — if different from text */
  passageText?: string
}

export type ActivityContentData = ReadingContent | ListeningContent | ImageSpeakContent | SpeakingReviewContent

