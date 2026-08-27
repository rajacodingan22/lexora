-- Activity log indexes
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);

-- Conversation indexes (arah_conversations)
CREATE INDEX IF NOT EXISTS idx_arah_conv_user ON arah_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_arah_conv_active ON arah_conversations(is_active);
CREATE INDEX IF NOT EXISTS idx_arah_conv_created ON arah_conversations(created_at DESC);

-- Message indexes (arah_messages)
CREATE INDEX IF NOT EXISTS idx_arah_msgs_conversation ON arah_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_arah_msgs_user ON arah_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_arah_msgs_created ON arah_messages(created_at ASC);

-- Discussion forum indexes (discussion_posts)
CREATE INDEX IF NOT EXISTS idx_disc_posts_course ON discussion_posts(course_id);
CREATE INDEX IF NOT EXISTS idx_disc_posts_user ON discussion_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_disc_posts_parent ON discussion_posts(parent_id);
CREATE INDEX IF NOT EXISTS idx_disc_posts_created ON discussion_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_disc_posts_pinned ON discussion_posts(is_pinned) WHERE is_pinned = true;

-- Exam results indexes
CREATE INDEX IF NOT EXISTS idx_exam_results_exam ON exam_results(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_user ON exam_results(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_course ON exam_results(course_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_status ON exam_results(status);
CREATE INDEX IF NOT EXISTS idx_exam_results_submitted ON exam_results(submitted_at DESC);

-- Teacher applications indexes
CREATE INDEX IF NOT EXISTS idx_teacher_apps_status ON teacher_applications(status);
CREATE INDEX IF NOT EXISTS idx_teacher_apps_user ON teacher_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_teacher_apps_submitted ON teacher_applications(submitted_at DESC);

-- Notification indexes (arah_notifications)
CREATE INDEX IF NOT EXISTS idx_arah_notif_user ON arah_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_arah_notif_user_read ON arah_notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_arah_notif_type ON arah_notifications(type);
CREATE INDEX IF NOT EXISTS idx_arah_notif_created ON arah_notifications(created_at DESC);

-- Certificate indexes
CREATE INDEX IF NOT EXISTS idx_certificates_user ON certificates(user_id);
CREATE INDEX IF NOT EXISTS idx_certificates_enrollment ON certificates(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_certificates_status ON certificates(status);
CREATE INDEX IF NOT EXISTS idx_certificates_issued ON certificates(issued_at DESC);

-- Placement results
CREATE INDEX IF NOT EXISTS idx_placement_results_user ON placement_results(user_id);

-- Enrollments status
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON enrollments(status);
CREATE INDEX IF NOT EXISTS idx_enrollments_user_status ON enrollments(user_id, status);
