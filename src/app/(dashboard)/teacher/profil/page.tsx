'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase-client'
import { updatePassword, updateProfile } from '@/lib/auth'
import { useI18n } from '@/lib/i18n/client'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Flag } from '@/components/ui/flag'
import { User, Mail, Phone, Camera, Lock, Globe, Award, Plus, X, Loader2 } from 'lucide-react'
import type { Language, Program } from '@/types'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const DAY_LABEL_KEYS: Record<string, string> = {
  Monday: 'teacher2.profil.dayMonday',
  Tuesday: 'teacher2.profil.dayTuesday',
  Wednesday: 'teacher2.profil.dayWednesday',
  Thursday: 'teacher2.profil.dayThursday',
  Friday: 'teacher2.profil.dayFriday',
  Saturday: 'teacher2.profil.daySaturday',
  Sunday: 'teacher2.profil.daySunday',
}

export default function TeacherProfilePage() {
  const { user, refresh } = useAuth()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { t } = useI18n()

  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [preferredLanguage, setPreferredLanguage] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const [languages, setLanguages] = useState<Language[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [experienceYears, setExperienceYears] = useState('')
  const [certifications, setCertifications] = useState<string[]>([])
  const [newCert, setNewCert] = useState('')

  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([])
  const [selectedPrograms, setSelectedPrograms] = useState<string[]>([])

  const [schedule, setSchedule] = useState<Record<string, { start: string; end: string; enabled: boolean }>>(
    Object.fromEntries(DAYS.map((d) => [d, { start: '09:00', end: '17:00', enabled: false }]))
  )

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || '')
      setBio(user.bio || '')
      setPhoneNumber(user.phone_number || '')
      setPreferredLanguage((user as any).preferred_language || '')
    }
  }, [user])

  useEffect(() => {
    const load = async () => {
      try {
        const [langRes, progRes, teacherRes] = await Promise.all([
          supabase.from('languages').select('*').eq('is_active', true).order('sort_order'),
          supabase.from('programs').select('*').eq('is_active', true).order('display_order'),
          user ? supabase.from('teachers').select('*, languages:teacher_languages(*), programs:teacher_programs(program:programs(*))').eq('user_id', user.id).single() : null,
        ])

        if (langRes.data) setLanguages(langRes.data as Language[])
        if (progRes.data) setPrograms(progRes.data as Program[])

        if (teacherRes?.data) {
          const t = teacherRes.data as any
          setExperienceYears(t.experience_years?.toString() || '')
          setCertifications(Array.isArray(t.certifications) ? t.certifications : [])
          setSelectedLanguages((t.languages || []).map((tl: any) => tl.language_code))
          setSelectedPrograms((t.programs || []).map((tp: any) => tp.program?.id).filter(Boolean))

          if (t.availability?.schedule) {
            const sched = { ...schedule }
            const raw = t.availability.schedule as Record<string, { start: string; end: string }>
            DAYS.forEach((day, i) => {
              if (raw[i.toString()]) {
                sched[day] = { ...sched[day], ...raw[i.toString()], enabled: true }
              }
            })
            setSchedule(sched)
          }
        }
      } catch (err) {
        console.error('Failed to load profile:', err)
      }
    }
    load()
  }, [user])

  const getInitial = () => (user?.display_name || user?.email || '?')[0].toUpperCase()
  const photoUrl = photoPreview || user?.photo_url || null

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const uploadPhoto = async () => {
    if (!photoFile || !user) return
    setUploading(true)
    const ext = photoFile.name.split('.').pop()
    const filePath = `${user.id}/${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, photoFile)
    if (uploadError) { setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath)
    const { error: updateError } = await supabase.from('users').update({ photo_url: publicUrl }).eq('id', user.id)
    setUploading(false)
    if (!updateError) {
      setPhotoFile(null)
      setPhotoPreview(null)
      refresh()
    }
  }

  const addCertification = () => {
    const c = newCert.trim()
    if (c && !certifications.includes(c)) {
      setCertifications([...certifications, c])
      setNewCert('')
    }
  }

  const removeCertification = (cert: string) => {
    setCertifications(certifications.filter((c) => c !== cert))
  }

  const toggleLanguage = (code: string) => {
    setSelectedLanguages((prev) => prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code])
  }

  const toggleProgram = (id: string) => {
    setSelectedPrograms((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id])
  }

  const handleSaveProfile = async () => {
    if (!user) return
    setSavingProfile(true)
    setMessage(null)

    if (photoFile) await uploadPhoto()

    await updateProfile({ display_name: displayName, bio, phone_number: phoneNumber })
    await supabase.from('users').update({ preferred_language: preferredLanguage || null }).eq('id', user.id)

    const sched: Record<string, { start: string; end: string }> = {}
    DAYS.forEach((day, i) => {
      if (schedule[day].enabled) sched[i.toString()] = { start: schedule[day].start, end: schedule[day].end }
    })

    const { data: existingTeacher } = await supabase.from('teachers').select('id').eq('user_id', user.id).single()
    let teacherId: string | undefined = existingTeacher?.id
    if (existingTeacher) {
      await supabase.from('teachers').update({
        experience_years: parseInt(experienceYears) || 0,
        certifications,
        availability: { schedule: sched },
      }).eq('user_id', user.id)
    } else {
      const { data: inserted } = await supabase.from('teachers').insert({
        user_id: user.id,
        experience_years: parseInt(experienceYears) || 0,
        certifications,
        availability: { schedule: sched },
      }).select('id').single()
      teacherId = inserted?.id
    }

    if (!teacherId) {
      setSavingProfile(false)
      setMessage({ type: 'error', text: t('teacher2.profil.saveFailed') })
      return
    }

    const currentLangCodes = selectedLanguages
    const { data: existingTLs } = await supabase.from('teacher_languages').select('language_code').eq('teacher_id', teacherId)
    const existingCodes = (existingTLs || []).map((tl: any) => tl.language_code)
    const toAdd = currentLangCodes.filter((c) => !existingCodes.includes(c))
    const toRemove = existingCodes.filter((c) => !currentLangCodes.includes(c))
    if (toRemove.length > 0) await supabase.from('teacher_languages').delete().eq('teacher_id', teacherId).in('language_code', toRemove)
    if (toAdd.length > 0) await supabase.from('teacher_languages').insert(toAdd.map((code) => ({ teacher_id: teacherId, language_code: code, levels: ['basic', 'advance', 'expert'], is_native: false })))

    const currentProgIds = selectedPrograms
    const { data: existingTPs } = await supabase.from('teacher_programs').select('program_id').eq('teacher_id', teacherId)
    const existingProgIds = (existingTPs || []).map((tp: any) => tp.program_id)
    const progToAdd = currentProgIds.filter((id) => !existingProgIds.includes(id))
    const progToRemove = existingProgIds.filter((id) => !currentProgIds.includes(id))
    if (progToRemove.length > 0) await supabase.from('teacher_programs').delete().eq('teacher_id', teacherId).in('program_id', progToRemove)
    if (progToAdd.length > 0) await supabase.from('teacher_programs').insert(progToAdd.map((id) => ({ teacher_id: teacherId, program_id: id })))

    refresh()
    setSavingProfile(false)
    setMessage({ type: 'success', text: t('teacher2.profil.profileSaved') })
  }

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: t('teacher2.profil.passwordMismatch') })
      return
    }
    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: t('teacher2.profil.passwordTooShort') })
      return
    }
    setSavingPassword(true)
    setMessage(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: user?.email || '', password: currentPassword })
    if (signInError) {
      setMessage({ type: 'error', text: t('teacher2.profil.passwordIncorrect') })
      setSavingPassword(false)
      return
    }
    const { error } = await updatePassword(newPassword)
    setSavingPassword(false)
    if (error) {
      setMessage({ type: 'error', text: error.message })
      return
    }
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setMessage({ type: 'success', text: t('teacher2.profil.passwordUpdated') })
  }

  return (
    <DashboardLayout role="teacher">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">{t('teacher2.profil.title')}</h1>
        <p className="text-on-surface-variant">{t('teacher2.profil.subtitle')}</p>
      </div>

      {message && (
        <div className={`rounded-lg px-4 py-3 text-sm ${message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
          {message.text}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="p-6 text-center">
            <div className="mx-auto relative mb-4 h-24 w-24">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="group relative flex h-full w-full items-center justify-center overflow-hidden rounded-full"
                disabled={uploading}
              >
                {photoUrl ? (
                  <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500 to-indigo-600 text-3xl font-bold text-white">
                    {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : getInitial()}
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                  {uploading ? <Loader2 className="h-6 w-6 animate-spin text-white" /> : <Camera className="h-5 w-5 text-white" />}
                </div>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
            </div>
            <h2 className="text-lg font-semibold text-on-surface">{user?.display_name || t('teacher2.profil.teacherFallback')}</h2>
            <p className="text-sm text-on-surface-variant">{t('teacher2.profil.teacherFallback')}</p>
            <div className="mt-4 flex justify-center gap-2">
              <Badge variant={user?.status === 'active' ? 'success' : 'default'}>{user?.status || 'active'}</Badge>
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t('teacher2.profil.personalInfo')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label={t('teacher2.profil.fullName')} value={displayName} onChange={(e) => setDisplayName(e.target.value)} icon={<User className="h-4 w-4" />} />
                <Input label={t('teacher2.profil.email')} type="email" value={user?.email || ''} readOnly icon={<Mail className="h-4 w-4" />} />
                <Input label={t('teacher2.profil.phone')} type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} icon={<Phone className="h-4 w-4" />} />
                <Input label={t('teacher2.profil.experienceYears')} type="number" min="0" value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)} icon={<Award className="h-4 w-4" />} />
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-on-surface">{t('teacher2.profil.preferredLanguage')}</label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"><Globe className="h-4 w-4" /></div>
                    <Select value={preferredLanguage} onChange={(e) => setPreferredLanguage(e.target.value)} className="pl-10">
                      <option value="">{t('teacher2.profil.selectLanguage')}</option>
                      {languages.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.flag_emoji ? <Flag emoji={l.flag_emoji} className="h-3.5" /> : null} {l.native_name || l.name?.en}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-on-surface">{t('teacher2.profil.bio')}</label>
                <Textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder={t('teacher2.profil.bioPlaceholder')} />
              </div>
              <Button onClick={handleSaveProfile} loading={savingProfile}>{t('teacher2.profil.saveChanges')}</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t('teacher2.profil.certifications')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {certifications.map((cert) => (
                  <Badge key={cert} variant="outline" className="gap-1 pr-1">
                    {cert}
                    <button type="button" onClick={() => removeCertification(cert)} className="ml-1 rounded-full p-0.5 hover:bg-red-500/20">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={newCert} onChange={(e) => setNewCert(e.target.value)} placeholder={t('teacher2.profil.addCertification')} onKeyDown={(e) => e.key === 'Enter' && addCertification()} />
                <Button size="sm" variant="outline" onClick={addCertification}><Plus className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t('teacher2.profil.languagesTaught')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {languages.map((l) => {
                  const selected = selectedLanguages.includes(l.code)
                  return (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => toggleLanguage(l.code)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${selected ? 'bg-indigo-500 text-white' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface'}`}
                    >
                      {l.flag_emoji ? <Flag emoji={l.flag_emoji} className="h-3.5" /> : null} {l.native_name || l.name?.en}
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t('teacher2.profil.programsTaught')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {programs.map((p) => {
                  const selected = selectedPrograms.includes(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleProgram(p.id)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${selected ? 'bg-indigo-500 text-white' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface'}`}
                    >
                      {p.name?.en || p.slug}
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t('teacher2.profil.availabilitySchedule')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {DAYS.map((day) => {
                const s = schedule[day]
                return (
                  <div key={day} className="flex items-center justify-between rounded-lg bg-surface-container-low p-3">
                    <span className="text-sm text-on-surface">{t(DAY_LABEL_KEYS[day] || day)}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={s.start}
                        onChange={(e) => setSchedule({ ...schedule, [day]: { ...s, start: e.target.value } })}
                        disabled={!s.enabled}
                        className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-on-surface disabled:opacity-40"
                      />
                      <span className="text-xs text-muted">{t('teacher2.profil.timeTo')}</span>
                      <input
                        type="time"
                        value={s.end}
                        onChange={(e) => setSchedule({ ...schedule, [day]: { ...s, end: e.target.value } })}
                        disabled={!s.enabled}
                        className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-on-surface disabled:opacity-40"
                      />
                      <input
                        type="checkbox"
                        checked={s.enabled}
                        onChange={(e) => setSchedule({ ...schedule, [day]: { ...s, enabled: e.target.checked } })}
                        className="rounded border-border ml-2"
                      />
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t('teacher2.profil.changePassword')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label={t('teacher2.profil.currentPassword')} type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} icon={<Lock className="h-4 w-4" />} />
                <Input label={t('teacher2.profil.newPassword')} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} icon={<Lock className="h-4 w-4" />} />
                <Input label={t('teacher2.profil.confirmNewPassword')} type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} icon={<Lock className="h-4 w-4" />} />
              </div>
              <Button onClick={handleChangePassword} loading={savingPassword}>{t('teacher2.profil.updatePassword')}</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  )
}
