'use client'

import { createClient } from './supabase-client'
import type { User } from '@/types'

/**
 * ⚠️ SECURITY NOTE: Role in `options.data`
 *
 * The `role` parameter is IGNORED on purpose: registration always creates
 * a `student` account. The `users_guard_role_status` DB trigger also forces
 * role='student' + status='active' on INSERT for non-admin. Teacher/admin
 * accounts are only created/promoted by admins (admin users page).
 */
export interface TeacherRegistrationData {
  fullName: string
  birthDate: string
  gender: string
  nationality: string
  phoneNumber: string
  email: string
  address: string
  timezone: string
  languages: string[]
  levels: Record<string, string[]>
  programs: string[]
  highestEducation: string
  institution: string
  major: string
  graduationYear: string
  hasTeachingExp: boolean
  experienceYears: string
  experienceInstitution: string
  experienceDescription: string
  teachingMode: string
  sessionDuration: number
  maxStudents: number
  teachingDays: string[]
  teachingHours: Record<string, string>
}

export async function signUp(
  email: string,
  password: string,
  displayName: string,
  _role: string = 'student',
  teacherRegistration?: TeacherRegistrationData,
) {
  const supabase = createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName,
        role: 'student',
        ...(teacherRegistration
          ? {
              teacher_registration: {
                enabled: true,
                full_name: teacherRegistration.fullName,
                birth_date: teacherRegistration.birthDate,
                gender: teacherRegistration.gender,
                nationality: teacherRegistration.nationality,
                phone_number: teacherRegistration.phoneNumber,
                email: teacherRegistration.email,
                address: teacherRegistration.address,
                timezone: teacherRegistration.timezone,
                languages: teacherRegistration.languages,
                levels: teacherRegistration.levels,
                programs: teacherRegistration.programs,
                highest_education: teacherRegistration.highestEducation,
                institution: teacherRegistration.institution,
                major: teacherRegistration.major,
                graduation_year: teacherRegistration.graduationYear,
                has_teaching_exp: teacherRegistration.hasTeachingExp,
                experience_years: teacherRegistration.experienceYears,
                experience_institution: teacherRegistration.experienceInstitution,
                experience_description: teacherRegistration.experienceDescription,
                teaching_mode: teacherRegistration.teachingMode,
                session_duration: teacherRegistration.sessionDuration,
                max_students_per_class: teacherRegistration.maxStudents,
                teaching_days: teacherRegistration.teachingDays,
                teaching_hours: teacherRegistration.teachingHours,
              },
            }
          : {}),
      },
      emailRedirectTo: `${window.location.origin}/verifikasi-email`,
    },
  })
  return { data, error }
} 

export async function signIn(email: string, password: string) {
  const supabase = createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

export async function signInWithGoogle() {
  const supabase = createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/api/auth/callback` },
  })
  return { data, error }
}

export async function signOut() {
  const supabase = createClient()
  const { error } = await supabase.auth.signOut()
  return { error }
}

export async function resetPassword(email: string) {
  const supabase = createClient()
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/lupa-password`,
  })
  return { data, error }
}

export async function updatePassword(newPassword: string) {
  const supabase = createClient()
  const { data, error } = await supabase.auth.updateUser({ password: newPassword })
  return { data, error }
}

export async function getCurrentUser() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  return profile as User
}

export async function updateProfile(updates: Partial<User>) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Whitelist allowed fields to prevent mass assignment
  const allowedFields = ['display_name', 'photo_url', 'bio', 'phone_number', 'birth_date', 'gender', 'country', 'timezone', 'preferred_language']
  const sanitized: Record<string, unknown> = {}
  for (const key of allowedFields) {
    if (key in updates) {
      sanitized[key] = (updates as Record<string, unknown>)[key]
    }
  }

  const { data, error } = await supabase
    .from('users')
    .update(sanitized)
    .eq('id', user.id)
    .select()
    .single()

  return { data: data as User, error }
}