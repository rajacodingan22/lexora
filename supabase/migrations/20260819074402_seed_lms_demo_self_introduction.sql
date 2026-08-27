-- hapus task legacy kosong (tanpa lesson)
delete from public.course_tasks where id = '4d0fe546-17d3-445b-8919-c3fe2df9159e';

-- task LMS baru: Self Introduction (TOEFL Preparation)
with task_ins as (
  insert into public.course_tasks
    (course_id, task_number, title, description, sort_order, status, estimated_duration,
     completion_requirement, lesson_unlock_rule, activity_unlock_rule, content_version)
  values
    ('d0000000-0000-0000-0000-000000000005', 1, 'Self Introduction',
     'Learn to introduce yourself: greetings, personal information, and talking about your background.',
     1, 'published', '45 min', 'all_lessons_mission', 'sequential', 'sequential', 1)
  returning id
),
lesson1 as (
  insert into public.task_lessons
    (task_id, lesson_number, title, description, icon, estimated_duration, sort_order, status, content_version)
  select id, 1, 'Greetings & Introductions',
         'Basic greetings and how to introduce yourself to others.', '👋', '20 min', 1, 'published', 1
  from task_ins
  returning id
),
lesson2 as (
  insert into public.task_lessons
    (task_id, lesson_number, title, description, icon, estimated_duration, sort_order, status, content_version)
  select id, 2, 'Talking About Yourself',
         'Describe your name, hometown, job, and hobbies in longer sentences.', '💬', '25 min', 2, 'published', 1
  from task_ins
  returning id
),
-- ============ LESSON 1 ACTIVITIES ============
l1a1 as (
  insert into public.lesson_activities (lesson_id, activity_type, title, instruction, sort_order, status, content_version)
  select id, 'learn', 'Greeting Basics', 'Read through the slides to learn common greeting phrases.', 1, 'published', 1
  from lesson1 returning id
),
l1a1c as (
  insert into public.activity_content (activity_id, content_type, content)
  select id, 'learn', $$
    {"slides": [
      {"title": "Formal vs Informal Greetings", "body": "In English, the greeting you use depends on the situation.\n\nFORMAL (work, first meeting):\n- Good morning / Good afternoon\n- How do you do?\n- Nice to meet you\n\nINFORMAL (friends, casual):\n- Hi / Hey\n- How is it going?\n- What's up?"},
      {"title": "Responding to Greetings", "body": "When someone greets you, respond naturally:\n\n- \"Hi, how are you?\" → \"I'm good, thanks. And you?\"\n- \"Nice to meet you\" → \"Nice to meet you too\"\n- \"How is it going?\" → \"Pretty well, thank you.\"\n\nAlways smile and make eye contact!"}
    ]}
  $$ from l1a1
),
l1a2 as (
  insert into public.lesson_activities (lesson_id, activity_type, title, instruction, sort_order, status, content_version)
  select id, 'vocabulary', 'Key Greeting Vocabulary', 'Study these words and mark which ones you already know.', 2, 'published', 1
  from lesson1 returning id
),
l1a2c as (
  insert into public.activity_content (activity_id, content_type, content)
  select id, 'vocabulary', $$
    {"items": [
      {"term": "Greeting", "translation": "Sapaan", "example": "A warm greeting makes a good first impression."},
      {"term": "Pleased to meet you", "translation": "Senang bertemu denganmu", "example": "Pleased to meet you, Mr. Lee."},
      {"term": "Acquaintance", "translation": "Kenalan", "example": "She is just an acquaintance, not a close friend."},
      {"term": "Farewell", "translation": "Ucapan perpisahan", "example": "They waved their hands in farewell."}
    ]}
  $$ from l1a2
),
l1a3 as (
  insert into public.lesson_activities (lesson_id, activity_type, title, instruction, sort_order, status, content_version)
  select id, 'quick_review', 'Greetings Quick Check', 'Answer these quick questions about greetings.', 3, 'published', 1
  from lesson1 returning id
),
l1a3c as (
  insert into public.activity_content (activity_id, content_type, content)
  select id, 'quick_review', $$
    {"questions": [
      {"question": "Which greeting is FORMAL?", "options": ["Hey!", "What's up?", "Good afternoon.", "Yo."], "answer": 2},
      {"question": "How do you respond to \"Nice to meet you\"?", "options": ["Nice to meet you too.", "I'm fine.", "See you later.", "Goodbye."], "answer": 0},
      {"question": "\"Farewell\" is used when...", "options": ["Meeting someone", "Saying goodbye", "Asking a question", "Ordering food"], "answer": 1}
    ]}
  $$ from l1a3
),
l1a4 as (
  insert into public.lesson_activities (lesson_id, activity_type, title, instruction, sort_order, status, content_version)
  select id, 'fill_blank', 'Complete the Greeting', 'Fill in the blanks with the correct words.', 4, 'published', 1
  from lesson1 returning id
),
l1a4c as (
  insert into public.activity_content (activity_id, content_type, content)
  select id, 'fill_blank', $$
    {"items": [
      {"before_text": "Good morning! How ______ you?", "blank_answer": "are", "after_text": "?"},
      {"before_text": "I'm doing well, thank ______.", "blank_answer": "you", "after_text": "."}
    ]}
  $$ from l1a4
),
-- ============ LESSON 2 ACTIVITIES ============
l2a1 as (
  insert into public.lesson_activities (lesson_id, activity_type, title, instruction, sort_order, status, content_version)
  select id, 'reading', 'Meet Sarah', 'Read the passage, then answer the questions.', 1, 'published', 1
  from lesson2 returning id
),
l2a1c as (
  insert into public.activity_content (activity_id, content_type, content)
  select id, 'reading', $$
    {"passages": [
      {"title": "Meet Sarah", "body": "Hello! My name is Sarah Johnson. I am 24 years old and I come from Bandung, Indonesia. I work as a graphic designer at a small company downtown. In my free time, I enjoy hiking and taking photographs of nature. I have one older brother who lives in Jakarta. My dream is to travel to Japan someday and see Mount Fuji."}
    ], "questions": [
      {"question": "Where is Sarah from?", "options": ["Jakarta", "Japan", "Bandung", "Bali"], "answer": 2},
      {"question": "What does Sarah do for a living?", "options": ["She is a student", "She is a graphic designer", "She is a photographer", "She is a teacher"], "answer": 1}
    ]}
  $$ from l2a1
),
l2a2 as (
  insert into public.lesson_activities (lesson_id, activity_type, title, instruction, sort_order, status, content_version)
  select id, 'matching', 'Match the Questions & Answers', 'Match each question with the correct answer.', 2, 'published', 1
  from lesson2 returning id
),
l2a2c as (
  insert into public.activity_content (activity_id, content_type, content)
  select id, 'matching', $$
    {"pairs": [
      {"left": "Where are you from?", "right": "I am from Surabaya."},
      {"left": "What do you do?", "right": "I work as a software engineer."},
      {"left": "How old are you?", "right": "I am twenty-five years old."}
    ]}
  $$ from l2a2
),
l2a3 as (
  insert into public.lesson_activities (lesson_id, activity_type, title, instruction, sort_order, status, content_version)
  select id, 'listening', 'Listening: An Introduction', 'Listen to the audio (or use the text-to-speech button) and answer the questions.', 3, 'published', 1
  from lesson2 returning id
),
l2a3c as (
  insert into public.activity_content (activity_id, content_type, content)
  select id, 'listening', $$
    {"audio_url": null, "audio_text": "Hi, I'm Daniel. I moved to Jakarta two years ago to study architecture. I really like the food here, especially soto ayam. In the future, I want to design eco-friendly buildings.",
     "transcript": "Hi, I'm Daniel. I moved to Jakarta two years ago to study architecture. I really like the food here, especially soto ayam. In the future, I want to design eco-friendly buildings.",
     "voice": null, "speed": 1,
     "questions": [
       {"question": "Why did Daniel move to Jakarta?", "options": ["To work", "To study architecture", "To visit family", "To start a business"], "answer": 1},
       {"question": "What does Daniel want to design in the future?", "options": ["Cars", "Clothes", "Eco-friendly buildings", "Mobile apps"], "answer": 2}
     ]}
  $$ from l2a3
),
l2a4 as (
  insert into public.lesson_activities (lesson_id, activity_type, title, instruction, sort_order, status, content_version)
  select id, 'speaking', 'Speaking: Introduce Yourself', 'Say the sentence out loud. Record yourself if your browser allows it.', 4, 'published', 1
  from lesson2 returning id
),
l2a4c as (
  insert into public.activity_content (activity_id, content_type, content)
  select id, 'speaking', $$
    {"instruction": "Practice saying this sentence until it feels natural, then mark it as done.",
     "target_sentence": "Hello! My name is Budi, and I am from Jakarta. Nice to meet you!",
     "self_check": true}
  $$ from l2a4
),
l2a5 as (
  insert into public.lesson_activities (lesson_id, activity_type, title, instruction, sort_order, status, content_version)
  select id, 'writing', 'Writing: About Me', 'Write a short paragraph introducing yourself.', 5, 'published', 1
  from lesson2 returning id
),
l2a5c as (
  insert into public.activity_content (activity_id, content_type, content)
  select id, 'writing', $$
    {"prompt": "Write a short paragraph (at least 20 words) introducing yourself. Mention your name, where you are from, and one thing you like.",
     "min_words": 20,
     "reference": "My name is Putri. I come from Yogyakarta and I am a student. I love reading novels and playing badminton on weekends."}
  $$ from l2a5
),
-- ============ MISSION ============
mission_ins as (
  insert into public.task_missions
    (task_id, title, mission_type, scenario, objectives, passing_score, max_attempts, unlock_next, status, content)
  select id, 'Mission: Introduce Yourself', 'quiz_challenge',
    'You are attending a study-abroad orientation. A classmate walks up to you and asks about yourself. Answer the questions to complete the conversation.',
    '["Answer questions about yourself", "Score at least 70% to pass", "Up to 3 attempts allowed"]',
    70, 3, true, 'published',
    $$
    {"questions": [
      {"question": "Which sentence is the best way to start an introduction?", "options": ["Goodbye, everyone!", "Hello, my name is Rina. Nice to meet you.", "What time is it?", "I am busy right now."], "answer": 1},
      {"question": "\"I am from Bali.\" answers which question?", "options": ["How old are you?", "What do you do?", "Where are you from?", "Where do you work?"], "answer": 2},
      {"question": "Choose the correct sentence:", "options": ["I have 22 years old.", "I am 22 years old.", "I is 22 years old.", "I are 22 years old."], "answer": 1},
      {"question": "How do you politely end a conversation?", "options": ["Talk louder", "Ignore the person", "It was nice talking to you. See you later!", "Ask for money"], "answer": 2}
    ]}
    $$
  from task_ins
  returning id
)
-- ============ ASSIGNMENT KE TOEFL BATCH 1 ============
insert into public.batch_tasks (batch_id, task_id, sort_order, status)
select 'e0000000-0000-0000-0000-000000000008', id, 1, 'published' from task_ins;