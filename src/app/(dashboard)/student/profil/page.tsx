'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { createClient } from '@/lib/supabase-client'
import { updatePassword, updateProfile } from '@/lib/auth'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Flag } from '@/components/ui/flag'
import { BadgeHexagon } from '@/components/shared/badge-hexagon'
import {
  User, Mail, Phone, Camera, Lock, Globe, Loader2,
  Calendar, MapPin, Heart, Award,
  Pencil, Save, X
} from 'lucide-react'
import { DriveConnectCard } from '@/components/student/drive-connect-card'
import type { Language } from '@/types'

// ─── Common Timezones ────────────────────────────────────────────────────────
const COMMON_TIMEZONES = [
  'Asia/Jakarta',
  'Asia/Makassar',
  'Asia/Jayapura',
  'Asia/Singapore',
  'Asia/Kuala_Lumpur',
  'Asia/Bangkok',
  'Asia/Manila',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Riyadh',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'America/Mexico_City',
  'Africa/Cairo',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'Pacific/Auckland',
  'Pacific/Fiji',
] as const

// ─── Gender Options ──────────────────────────────────────────────────────────
const GENDER_OPTIONS = [
  { value: 'Laki-laki', label: 'Laki-laki' },
  { value: 'Perempuan', label: 'Perempuan' },
  { value: 'Tidak ingin menyebutkan', label: 'Tidak ingin menyebutkan' },
] as const

// ─── Common Countries ────────────────────────────────────────────────────────
const COMMON_COUNTRIES = [
  'Indonesia',
  'Malaysia',
  'Singapore',
  'Brunei Darussalam',
  'Thailand',
  'Vietnam',
  'Philippines',
  'Japan',
  'South Korea',
  'China',
  'India',
  'Australia',
  'United Kingdom',
  'United States',
  'Netherlands',
  'Germany',
  'France',
  'Saudi Arabia',
  'United Arab Emirates',
  'Other',
] as const

// ─── Edit Mode Toggle ────────────────────────────────────────────────────────
type ViewMode = 'view' | 'edit'

const LOCALE_MAP: Record<string, string> = { en: 'en-US', id: 'id-ID', zh: 'zh-CN' }

export default function StudentProfilePage() {
  const { user, refresh } = useAuth()
  const { t, lang } = useI18n()
  const locale = LOCALE_MAP[lang] || 'en-US'
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── View mode toggle ───────────────────────────────────────────────────
  const [mode, setMode] = useState<ViewMode>('view')

  // ── Form fields ────────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [gender, setGender] = useState('')
  const [country, setCountry] = useState('')
  const [customCountry, setCustomCountry] = useState('')
  const [timezone, setTimezone] = useState('')
  const [preferredLanguage, setPreferredLanguage] = useState('')
  // ── Password fields ────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // ── Photo upload ───────────────────────────────────────────────────────
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  // ── Async data ─────────────────────────────────────────────────────────
  const [languages, setLanguages] = useState<Language[]>([])
  const [placementResult, setPlacementResult] = useState<{ provisional_level: string; test: { language_code: string } | null } | null>(null)
  const [badges, setBadges] = useState<{ id: string; badge_type: string; title: string; description: string | null; earned_at: string }[]>([])
  const [loadingData, setLoadingData] = useState(true)

  // ── Save state ─────────────────────────────────────────────────────────
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // ── Derived ────────────────────────────────────────────────────────────
  const showOtherCountry = country === 'Other'
  const _effectiveCountry = showOtherCountry ? customCountry : country
  const photoUrl = photoPreview || user?.photo_url || null

  const requiredFields = {
    phone_number: !!user?.phone_number,
    birth_date: !!user?.birth_date,
    country: !!user?.country,
  }
  const isProfileComplete = requiredFields.phone_number && requiredFields.birth_date && requiredFields.country
  const missingCount = [!requiredFields.phone_number, !requiredFields.birth_date, !requiredFields.country].filter(Boolean).length

  // ── Load user data ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return

    setDisplayName(user.display_name || '')
    setBio(user.bio || '')
    setPhoneNumber(user.phone_number || '')
    setBirthDate(user.birth_date || '')
    setGender(user.gender || '')
    setCountry(user.country === 'Other' || (user.country && !COMMON_COUNTRIES.includes(user.country as any)) ? 'Other' : (user.country || ''))
    if (user.country && !COMMON_COUNTRIES.includes(user.country as any)) {
      setCustomCountry(user.country || '')
    }
    setTimezone(user.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta')
    setPreferredLanguage(user.preferred_language || '')
  }, [user])

  // ── Load languages & placement ─────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    const load = async () => {
      try {
        const [langRes, placementRes, badgeRes] = await Promise.all([
          supabase.from('languages').select('*').eq('is_active', true).order('sort_order'),
          supabase.from('placement_results').select('provisional_level, test:test_id(language_code)').eq('user_id', user.id).order('completed_at', { ascending: false }).limit(1).maybeSingle(),
          supabase.from('student_badges').select('id, badge_type, title, description, earned_at').eq('user_id', user.id).order('earned_at', { ascending: true }),
        ])
        if (langRes.data) setLanguages(langRes.data as Language[])
        if (placementRes.data) {
          setPlacementResult(placementRes.data as unknown as { provisional_level: string; test: { language_code: string } | null })
        }
        if (badgeRes.data) setBadges(badgeRes.data as typeof badges)
      } catch (err) {
        console.error('Failed to load profile data:', err)
      }
      setLoadingData(false)
    }
    load()
  }, [user])

  // ── Helpers ────────────────────────────────────────────────────────────
  const getInitial = () => (user?.display_name || user?.email || '?')[0].toUpperCase()

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

  // ── Save Profile ───────────────────────────────────────────────────────
  const handleSaveProfile = async () => {
    if (!user) return
    setSavingProfile(true)
    setMessage(null)

    // Upload file if selected
    if (photoFile) await uploadPhoto()

    const finalCountry = showOtherCountry ? customCountry.trim() : country

    const { error } = await updateProfile({
      display_name: displayName,
      bio,
      phone_number: phoneNumber,
      birth_date: birthDate || null,
      gender: gender || null,
      country: finalCountry || null,
      timezone: timezone || null,
      preferred_language: preferredLanguage || null,
    })

    if (!error) {
      refresh()
      setMode('view')
      setMessage({ type: 'success', text: t('student1.profil.saveSuccess') })
    } else {
      setMessage({ type: 'error', text: typeof error === 'string' ? error : t('student1.profil.saveError') })
    }
    setSavingProfile(false)
  }

  // ── Change Password ────────────────────────────────────────────────────
  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: t('student1.profil.passwordMismatch') })
      return
    }
    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: t('student1.profil.passwordTooShort') })
      return
    }
    setSavingPassword(true)
    setMessage(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: user?.email || '', password: currentPassword })
    if (signInError) {
      setMessage({ type: 'error', text: t('student1.profil.currentPasswordWrong') })
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
    setMessage({ type: 'success', text: t('student1.profil.passwordUpdated') })
  }

  // ── Discard changes ────────────────────────────────────────────────────
  const handleCancel = () => {
    if (user) {
      setDisplayName(user.display_name || '')
      setBio(user.bio || '')
      setPhoneNumber(user.phone_number || '')
      setBirthDate(user.birth_date || '')
      setGender(user.gender || '')
      setCountry(user.country === 'Other' || (user.country && !COMMON_COUNTRIES.includes(user.country as any)) ? 'Other' : (user.country || ''))
      if (user.country && !COMMON_COUNTRIES.includes(user.country as any)) {
        setCustomCountry(user.country || '')
      }
      setTimezone(user.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta')
      setPreferredLanguage(user.preferred_language || '')
      setPhotoFile(null)
      setPhotoPreview(null)
    }
    setMode('view')
    setMessage(null)
  }

  // ── Language name helper ───────────────────────────────────────────────
  const getLanguageName = (code: string): React.ReactNode => {
    const lang = languages.find((l) => l.code === code)
    if (!lang) return code
    return (
      <>
        {lang.flag_emoji ? <Flag emoji={lang.flag_emoji} className="h-3.5" /> : null} {lang.native_name || lang.name?.en}
      </>
    )
  }

  // ── Render: Profile Display Card (View Mode) ───────────────────────────
  const renderProfileHeader = () => (
    <Card variant="gradient" className="overflow-hidden">
      <div className="relative">
        {/* Background decorative gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-accent/5 to-primary/10" />
        <CardContent className="relative p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="h-24 w-24 overflow-hidden rounded-full border-2 border-border/40 shadow-lg">
                {user?.photo_url ? (
                  <img src={user.photo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500 to-indigo-600 text-3xl font-bold text-white">
                    {getInitial()}
                  </div>
                )}
              </div>
              {!isProfileComplete && missingCount > 0 && (
                <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-warning text-[10px] font-bold text-on-surface shadow-md">
                  {missingCount}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-left min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
                <h2 className="text-xl font-bold text-on-surface">
                  {user?.display_name || 'Student'}
                </h2>
                <Badge variant="primary" size="sm">Student</Badge>
                {placementResult && (
                  <Badge variant="accent" size="sm">
                    <Award className="h-3 w-3 mr-0.5" />
                    {placementResult.test?.language_code?.toUpperCase()} {placementResult.provisional_level}
                  </Badge>
                )}
              </div>

              {user?.email && (
                <p className="text-sm text-on-surface-variant flex items-center justify-center sm:justify-start gap-1.5 mt-1">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  {user.email}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-3 text-xs text-on-surface-variant">
                {user?.phone_number && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" /> {user.phone_number}
                  </span>
                )}
                {user?.country && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {user.country}
                  </span>
                )}
                {user?.birth_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />{' '}
                    {new Date(user.birth_date + 'T00:00:00').toLocaleDateString(locale, {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                )}
                {user?.preferred_language && (
                  <span className="flex items-center gap-1">
                    <Globe className="h-3.5 w-3.5" /> {getLanguageName(user.preferred_language)}
                  </span>
                )}
              </div>

              {user?.bio && (
                <p className="mt-3 text-sm text-on-surface-variant italic border-l-2 border-border/40 pl-3">
                  {user.bio}
                </p>
              )}
            </div>

            {/* Edit button */}
            <div className="shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMode('edit')}
                className="gap-1.5"
              >
                <Pencil className="h-3.5 w-3.5" />
                {t('student1.profil.editProfile')}
              </Button>
            </div>
          </div>
        </CardContent>
      </div>
    </Card>
  )

  // ── Render: Profile Incomplete Banner ──────────────────────────────────
  const renderIncompleteBanner = () => {
    if (isProfileComplete) return null
    return (
      <Card className="border-warning/30 bg-gradient-to-r from-warning/10 to-orange-500/5">
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/20">
              <Heart className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-sm font-semibold text-on-surface">{t('student1.profil.completeProfile')}</p>
              <p className="text-xs text-on-surface-variant">
                {t('student1.profil.fieldsNeeded', { count: missingCount })}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="warning"
            className="shrink-0"
            onClick={() => setMode('edit')}
          >
            {t('student1.profil.completeNow')}
          </Button>
        </CardContent>
      </Card>
    )
  }

  // ── Render: Edit Form ──────────────────────────────────────────────────
  const renderEditForm = () => (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Photo Card */}
      <Card className="lg:col-span-1">
        <CardContent className="p-6 text-center space-y-4">
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

          <p className="text-[10px] text-on-surface-variant">{t('student1.profil.photoHint')}</p>
        </CardContent>
      </Card>

      {/* Main Form */}
      <div className="lg:col-span-2 space-y-6">
        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('student1.profil.personalInfo')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label={t('student1.profil.fullName')}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                icon={<User className="h-4 w-4" />}
              />
              <Input
                label="Email"
                type="email"
                value={user?.email || ''}
                readOnly
                icon={<Mail className="h-4 w-4" />}
              />
              <Input
                label={t('student1.profil.phoneNumber')}
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                icon={<Phone className="h-4 w-4" />}
              />
              <Input
                label={t('student1.profil.birthDate')}
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                icon={<Calendar className="h-4 w-4" />}
              />
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-on-surface">{t('student1.profil.genderOptional')}</label>
                <Select value={gender} onChange={(e) => setGender(e.target.value)}>
                  <option value="">{t('student1.profil.selectGender')}</option>
                  {GENDER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-on-surface">{t('student1.profil.country')}</label>
                <Select value={country} onChange={(e) => setCountry(e.target.value)}>
                  <option value="">{t('student1.profil.selectCountry')}</option>
                  {COMMON_COUNTRIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
                {showOtherCountry && (
                  <Input
                    placeholder={t('student1.profil.countryPlaceholder')}
                    value={customCountry}
                    onChange={(e) => setCustomCountry(e.target.value)}
                    className="mt-2"
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-on-surface">{t('student1.profil.timezone')}</label>
                <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-on-surface">{t('student1.profil.primaryLanguage')}</label>
                <Select value={preferredLanguage} onChange={(e) => setPreferredLanguage(e.target.value)}>
                  <option value="">{t('student1.profil.selectLanguage')}</option>
                  {languages.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.flag_emoji ? <Flag emoji={l.flag_emoji} className="h-3.5" /> : null} {l.native_name || l.name?.en}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-on-surface">{t('student1.profil.bio')}</label>
              <Textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder={t('student1.profil.bioPlaceholder')} />
            </div>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('student1.profil.changePassword')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label={t('student1.profil.currentPassword')} type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} icon={<Lock className="h-4 w-4" />} />
              <Input label={t('student1.profil.newPassword')} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} icon={<Lock className="h-4 w-4" />} />
              <Input label={t('student1.profil.confirmPassword')} type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} icon={<Lock className="h-4 w-4" />} />
            </div>
            <Button onClick={handleChangePassword} loading={savingPassword} variant="secondary">{t('student1.profil.updatePassword')}</Button>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 justify-end">
          <Button variant="ghost" onClick={handleCancel} className="gap-1.5">
            <X className="h-4 w-4" /> {t('student1.profil.cancel')}
          </Button>
          <Button onClick={handleSaveProfile} loading={savingProfile} className="gap-1.5">
            <Save className="h-4 w-4" /> {t('student1.profil.saveProfile')}
          </Button>
        </div>
      </div>
    </div>
  )

  // ── Main Render ────────────────────────────────────────────────────────
  return (
    <section className="space-y-6">
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-on-surface">{t('student1.profil.title')}</h1>
            <p className="text-on-surface-variant">
              {mode === 'view'
                ? t('student1.profil.subtitleView')
                : t('student1.profil.subtitleEdit')}
            </p>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`rounded-lg px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'bg-red-500/10 text-red-400'
          }`}>
            {message.text}
          </div>
        )}

        {/* Loading */}
        {loadingData ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : mode === 'view' ? (
          <>
            {renderIncompleteBanner()}
            {renderProfileHeader()}

            {/* Additional detail cards in view mode */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Globe className="h-4 w-4 text-primary" /> {t('student1.profil.languageRegion')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {user?.preferred_language && (
                    <div className="flex items-center justify-between rounded-lg bg-surface-container-low p-3">
                      <span className="text-sm text-on-surface-variant">{t('student1.profil.primaryLanguage')}</span>
                      <span className="text-sm font-medium text-on-surface">{getLanguageName(user.preferred_language)}</span>
                    </div>
                  )}
                  {user?.country && (
                    <div className="flex items-center justify-between rounded-lg bg-surface-container-low p-3">
                      <span className="text-sm text-on-surface-variant">{t('student1.profil.country')}</span>
                      <span className="text-sm font-medium text-on-surface">{user.country}</span>
                    </div>
                  )}
                  {user?.timezone && (
                    <div className="flex items-center justify-between rounded-lg bg-surface-container-low p-3">
                      <span className="text-sm text-on-surface-variant">{t('student1.profil.timezone')}</span>
                      <span className="text-sm font-medium text-on-surface">{user.timezone.replace(/_/g, ' ')}</span>
                    </div>
                  )}
                  {user?.gender && (
                    <div className="flex items-center justify-between rounded-lg bg-surface-container-low p-3">
                      <span className="text-sm text-on-surface-variant">{t('student1.profil.gender')}</span>
                      <span className="text-sm font-medium text-on-surface">{user.gender}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Award className="h-4 w-4 text-primary" /> {t('student1.profil.learningProgress')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {placementResult ? (
                    <div className="flex items-center justify-between rounded-lg bg-surface-container-low p-3">
                      <span className="text-sm text-on-surface-variant">{t('student1.profil.placementTestLevel')}</span>
                      <Badge variant="accent" size="sm">
                    {placementResult.test?.language_code?.toUpperCase()} {placementResult.provisional_level}
                      </Badge>
                    </div>
                  ) : (
                    <p className="text-sm text-on-surface-variant text-center py-4">
                      {t('student1.profil.noPlacementTest')}
                    </p>
                  )}
                  <div className="flex items-center justify-between rounded-lg bg-surface-container-low p-3">
                    <span className="text-sm text-on-surface-variant">{t('student1.profil.accountStatus')}</span>
                    <Badge variant={user?.status === 'active' ? 'success' : 'default'}>
                      {user?.status || 'active'}
                    </Badge>
                  </div>
                  {user?.created_at && (
                    <div className="flex items-center justify-between rounded-lg bg-surface-container-low p-3">
                      <span className="text-sm text-on-surface-variant">{t('student1.profil.memberSince')}</span>
                      <span className="text-sm font-medium text-on-surface">
                        {new Date(user.created_at).toLocaleDateString(locale, {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <DriveConnectCard />
            </div>

            {/* Badges */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Award className="h-4 w-4 text-primary" /> {t('student1.profil.badges')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {badges.length === 0 ? (
                  <p className="text-sm text-on-surface-variant text-center py-4">
                    {t('student1.profil.noBadges')}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-4">
                    {badges.map((b) => (
                      <div key={b.id} className="flex flex-col items-center gap-1.5 text-center">
                        <BadgeHexagon type={b.badge_type} title={b.title} description={b.description || undefined} photoUrl={user?.photo_url} size={64} />
                        <span className="max-w-28 text-xs font-medium text-on-surface leading-tight">{b.title}</span>
                        <span className="text-[10px] text-muted">
                          {new Date(b.earned_at).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          renderEditForm()
        )}
      </div>
    </section>
  )
}
