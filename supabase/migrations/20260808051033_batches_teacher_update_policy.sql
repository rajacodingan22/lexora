-- Teacher yang mengajar kursus (via course_teachers) boleh update batch milik kursusnya,
-- tapi HANYA kolom penjadwalan (start_date, end_date, meetings_per_week).
-- Kolom kunci (status, current_students, capacity, teacher_id, name, code, reminder_sent, id) diproteksi via WITH CHECK.
create policy "batches_update_assigned_teacher"
on public.batches
for update
to authenticated
using (
  exists (
    select 1
    from public.course_teachers ct
    where ct.course_id = batches.course_id
      and ct.teacher_id in (
        select id from public.teachers where user_id = auth.uid()
      )
  )
)
with check (
  exists (
    select 1
    from public.course_teachers ct
    where ct.course_id = batches.course_id
      and ct.teacher_id in (
        select id from public.teachers where user_id = auth.uid()
      )
  )
  -- proteksi kolom yang tidak boleh diubah teacher:
  and status = (select status from public.batches where id = batches.id)
  and current_students is not distinct from (select current_students from public.batches where id = batches.id)
  and capacity is not distinct from (select capacity from public.batches where id = batches.id)
  and teacher_id is not distinct from (select teacher_id from public.batches where id = batches.id)
  and name = (select name from public.batches where id = batches.id)
  and code is not distinct from (select code from public.batches where id = batches.id)
  and reminder_sent = (select reminder_sent from public.batches where id = batches.id)
  and id = (select id from public.batches where id = batches.id)
);