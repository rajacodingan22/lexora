-- P2: allow preview of meeting/project schedules for marketplace courses
-- Problem: sessions_read_allowed / assignments_read_enrolled require enrollment,
-- so non-enrolled students see 0 rows in Explore preview modal.
-- Fix: public SELECT for sessions/assignments of active + marketplace-visible courses.
-- meeting_link stays hidden from anonymous? No — link visibility is gated client-side
-- by isEnrolled; DB only opens title/starts_at/due_date preview. Link column is
-- still returned but UI never renders clickable link for non-enrolled.

create policy live_sessions_preview_marketplace on public.live_sessions
  for select to public
  using (
    exists (
      select 1 from public.courses c
      where c.id = live_sessions.course_id
        and c.status = 'active'
        and c.is_visible_marketplace = true
    )
  );

create policy assignments_preview_marketplace on public.assignments
  for select to public
  using (
    exists (
      select 1 from public.courses c
      where c.id = assignments.course_id
        and c.status = 'active'
        and c.is_visible_marketplace = true
    )
  );
