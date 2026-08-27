'use client'

/**
 * Image Speak — contoh activity siap pakai (girl/boy/man/woman running)
 * Jalankan di browser console pada halaman admin/learning setelah login sebagai admin,
 * ATAU gunakan SQL di bawah (lebih cepat).
 *
 * SQL equivalent (run via supabase db query --linked):
 */

const ACTIVITY_ID = crypto.randomUUID()
const LESSON_ID = '8a69d925-7976-46b7-ad36-07368a948d2f' // Lesson 1: Who is running?

const CONTENT = {
  prompt: 'The girl is running.',
  images: [
    'https://images.unsplash.com/photo-1502904550040-7534597429ae?w=600&q=80', // girl running
    'https://images.unsplash.com/photo-1461897104016-0b3b00cc81ee?w=600&q=80', // boy running
    'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=600&q=80', // man running
    'https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=600&q=80', // woman running
  ],
  correctIndex: 0,
  expectedText: 'The girl is running.',
  threshold: 0.9,
  instructions: 'Tap the correct image, then speak the sentence clearly.',
}

console.log('Activity ID:', ACTIVITY_ID)
console.log('Lesson ID:', LESSON_ID)
console.log('Content:', JSON.stringify(CONTENT, null, 2))

// Untuk insert via SQL:
// insert into lesson_activities (lesson_id, activity_type, title, instruction, sort_order, status)
// values ('8a69d925-7976-46b7-ad36-07368a948d2f', 'image_speak', 'Who is running?', 'Tap the correct image, then speak the sentence.', 1, 'published');
//
// insert into activity_content (activity_id, content_type, content)
// values ('<ACTIVITY_ID>', 'image_speak', '<CONTENT_JSONB>');
