-- Enable pgcrypto for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================================
-- 1. LANGUAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.languages (
  code TEXT PRIMARY KEY,
  name JSONB NOT NULL,
  native_name TEXT NOT NULL,
  flag_emoji TEXT,
  is_rtl BOOLEAN DEFAULT false,
  level_framework TEXT DEFAULT 'cefr',
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0
);

ALTER TABLE public.languages ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. LANGUAGE LEVELS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.language_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  language_code TEXT NOT NULL REFERENCES public.languages(code) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name JSONB NOT NULL,
  description JSONB,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(language_code, code)
);

ALTER TABLE public.language_levels ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. PROGRAMS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  language_code TEXT NOT NULL REFERENCES public.languages(code),
  slug TEXT NOT NULL UNIQUE,
  name JSONB NOT NULL,
  description JSONB,
  program_type TEXT DEFAULT 'regular',
  display_order INTEGER DEFAULT 0,
  passing_score NUMERIC DEFAULT 70,
  attendance_weight NUMERIC DEFAULT 10,
  assignment_weight NUMERIC DEFAULT 30,
  quiz_weight NUMERIC DEFAULT 30,
  exam_weight NUMERIC DEFAULT 30,
  is_active BOOLEAN DEFAULT true
);

ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  display_name TEXT,
  role TEXT DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'admin')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  photo_url TEXT,
  phone_number TEXT,
  bio TEXT,
  birth_date TEXT,
  gender TEXT,
  emergency_contact_name TEXT,
  emergency_contact_relation TEXT,
  notification_settings JSONB DEFAULT '{}',
  favorites JSONB DEFAULT '[]',
  saved_articles JSONB DEFAULT '[]',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  preferred_language TEXT DEFAULT 'id',
  avatar_url TEXT
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. TEACHERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  headline TEXT,
  bio TEXT,
  experience_years INTEGER DEFAULT 0,
  certifications JSONB DEFAULT '[]',
  hourly_rate NUMERIC DEFAULT 0,
  availability JSONB DEFAULT '{}',
  marketplace_visible BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'active',
  total_rating NUMERIC DEFAULT 0,
  reviews_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. TEACHER LANGUAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.teacher_languages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL REFERENCES public.languages(code),
  levels TEXT[] DEFAULT '{}',
  is_native BOOLEAN DEFAULT false,
  UNIQUE(teacher_id, language_code)
);

ALTER TABLE public.teacher_languages ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 7. TEACHER PROGRAMS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.teacher_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  UNIQUE(teacher_id, program_id)
);

ALTER TABLE public.teacher_programs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 8. COURSES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID REFERENCES public.teachers(id),
  program_id UUID REFERENCES public.programs(id),
  language_code TEXT REFERENCES public.languages(code),
  level_id UUID REFERENCES public.language_levels(id),
  title JSONB NOT NULL,
  description JSONB,
  syllabus JSONB,
  max_students INTEGER DEFAULT 20,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
  mode TEXT DEFAULT 'online' CHECK (mode IN ('online', 'offline', 'hybrid')),
  is_visible_marketplace BOOLEAN DEFAULT false,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 9. BATCHES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  max_students INTEGER DEFAULT 20,
  current_students INTEGER DEFAULT 0,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'full', 'completed'))
);

ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 10. ENROLLMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id),
  course_id UUID REFERENCES public.courses(id),
  batch_id UUID REFERENCES public.batches(id),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'dropped', 'waitlisted')),
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 11. LIVE SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.live_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  provider TEXT,
  meeting_link TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'ongoing', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 12. ATTENDANCE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id),
  status TEXT DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late', 'excused')),
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  duration_minutes INTEGER
);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 13. MATERIALS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  file_type TEXT,
  file_url TEXT,
  external_url TEXT,
  is_required BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 14. ASSIGNMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  instructions TEXT,
  max_grade NUMERIC DEFAULT 100,
  due_date TIMESTAMPTZ,
  resubmission_allowed BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 15. SUBMISSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id),
  file_url TEXT,
  notes TEXT,
  status TEXT DEFAULT 'submitted' CHECK (status IN ('submitted', 'late', 'graded', 'resubmitted')),
  submitted_at TIMESTAMPTZ DEFAULT now(),
  grade NUMERIC,
  feedback TEXT,
  graded_by UUID REFERENCES public.users(id),
  graded_at TIMESTAMPTZ
);

ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 16. RUBRICS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rubrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  criteria JSONB NOT NULL,
  max_score NUMERIC NOT NULL
);

ALTER TABLE public.rubrics ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 17. QUIZZES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  time_limit_minutes INTEGER,
  passing_score NUMERIC DEFAULT 70,
  attempt_limit INTEGER DEFAULT 1,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 18. QUIZ QUESTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID REFERENCES public.quizzes(id) ON DELETE CASCADE,
  question_type TEXT NOT NULL CHECK (question_type IN ('multiple_choice', 'essay', 'listening', 'reading')),
  question_text TEXT NOT NULL,
  options JSONB,
  correct_answer TEXT,
  points NUMERIC DEFAULT 10,
  sort_order INTEGER DEFAULT 0
);

ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 19. QUIZ ATTEMPTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id),
  attempt_number INTEGER DEFAULT 1,
  answers JSONB DEFAULT '{}',
  score NUMERIC,
  started_at TIMESTAMPTZ DEFAULT now(),
  submitted_at TIMESTAMPTZ
);

ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 20. FINAL EXAMS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.final_exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  time_limit_minutes INTEGER,
  passing_score NUMERIC DEFAULT 70,
  max_attempts INTEGER DEFAULT 1,
  status TEXT DEFAULT 'draft'
);

ALTER TABLE public.final_exams ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 21. EXAM QUESTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.exam_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.final_exams(id) ON DELETE CASCADE,
  question_type TEXT NOT NULL,
  question_text TEXT NOT NULL,
  options JSONB,
  correct_answer TEXT,
  points NUMERIC DEFAULT 10,
  sort_order INTEGER DEFAULT 0
);

ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 22. EXAM RESULTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.exam_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.final_exams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id),
  answers JSONB DEFAULT '{}',
  score NUMERIC,
  passed BOOLEAN DEFAULT false,
  started_at TIMESTAMPTZ DEFAULT now(),
  submitted_at TIMESTAMPTZ
);

ALTER TABLE public.exam_results ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 23. GRADE AGGREGATES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.grade_aggregates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  weighted_total NUMERIC DEFAULT 0,
  grade_letter TEXT,
  grade_points NUMERIC DEFAULT 0,
  is_passing BOOLEAN DEFAULT false,
  last_updated TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.grade_aggregates ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 24. CERTIFICATES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id),
  course_id UUID REFERENCES public.courses(id),
  enrollment_id UUID REFERENCES public.enrollments(id),
  certificate_url TEXT,
  issued_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'issued', 'revoked'))
);

ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 25. DISCUSSION POSTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.discussion_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.discussion_posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id),
  title TEXT,
  content TEXT NOT NULL,
  image_url TEXT,
  is_pinned BOOLEAN DEFAULT false,
  is_locked BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.discussion_posts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 26. PLACEMENT TESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.placement_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  language_code TEXT NOT NULL REFERENCES public.languages(code),
  title TEXT NOT NULL,
  description TEXT,
  time_limit_minutes INTEGER,
  passing_score NUMERIC DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.placement_tests ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 27. PLACEMENT QUESTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.placement_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES public.placement_tests(id) ON DELETE CASCADE,
  question_type TEXT NOT NULL,
  question_text TEXT NOT NULL,
  options JSONB,
  correct_answer TEXT,
  points NUMERIC DEFAULT 10,
  sort_order INTEGER DEFAULT 0
);

ALTER TABLE public.placement_questions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 28. PLACEMENT RESULTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.placement_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES public.placement_tests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id),
  answers JSONB DEFAULT '{}',
  score NUMERIC,
  suggested_level_id UUID REFERENCES public.language_levels(id),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.placement_results ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 29. CMS CONTENT
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cms_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section TEXT NOT NULL,
  heading TEXT,
  content JSONB,
  is_published BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.cms_content ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 30. NEWS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID REFERENCES public.users(id),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  content TEXT,
  excerpt TEXT,
  category TEXT,
  status TEXT DEFAULT 'draft',
  image_url TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 31. CONTACT MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 32. AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  user_id UUID,
  role TEXT,
  details JSONB,
  ip_address TEXT,
  timestamp TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 33. SYSTEM SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
