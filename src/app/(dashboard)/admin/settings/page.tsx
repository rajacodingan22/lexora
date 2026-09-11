'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ImageUpload } from '@/components/ui/image-upload'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/lib/i18n/client'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { Loader2, CheckCircle2, AlertCircle, Mail, Key, Database, Bell, LogIn, Sparkles } from 'lucide-react'

type SettingMap = Record<string, unknown>
type SectionName = 'auth' | 'email' | 'ai' | 'storage' | 'notification' | 'payment' | 'placement'
type SectionStatus = { type: 'success'; message: string } | { type: 'error'; message: string } | null

const SENSITIVE_KEYS = ['ai_api_key', 'smtp_password', 'smtp_user']

const K = {
  AUTH_REG: 'auth_allow_registration',
  AUTH_GOOGLE: 'auth_allow_google_login',
  SMTP_HOST: 'smtp_host',
  SMTP_PORT: 'smtp_port',
  SMTP_USER: 'smtp_user',
  SMTP_PASSWORD: 'smtp_password',
  SMTP_FROM_EMAIL: 'smtp_from_email',
  SMTP_FROM_NAME: 'smtp_from_name',
  AI_ENDPOINT: 'ai_api_endpoint',
  AI_KEY: 'ai_api_key',
  AI_MODEL: 'ai_model',
  AI_ENABLED: 'ai_enabled',
  STORAGE_MAX_UPLOAD: 'storage_max_upload_size_mb',
  STORAGE_ALLOWED_TYPES: 'storage_allowed_file_types',
  NOTIF_EMAIL: 'notif_email_enabled',
  NOTIF_PUSH: 'notif_push_enabled',
  PLACEMENT_POPUP: 'placement_popup_enabled',
  PLACEMENT_PERSONALITY_LINK: 'personality_test_link',
  PLACEMENT_PRICE: 'placement_test_price',
  PLACEMENT_BONUS: 'placement_bonus_meetings',
} as const

async function fetchAllSettings(supabase: ReturnType<typeof createClient>): Promise<SettingMap> {
  const { data, error } = await supabase.from('system_settings').select('key, value')
  if (error) throw error
  const map: SettingMap = {}
  for (const row of data ?? []) {
    map[row.key] = row.value
  }
  for (const key of Object.keys(map)) {
    if (SENSITIVE_KEYS.includes(key)) {
      map[key] = '••••••••'
    }
  }
  return map
}

async function upsertSettings(supabase: ReturnType<typeof createClient>, entries: { key: string; value: unknown }[]): Promise<void> {
  const { error } = await supabase.from('system_settings').upsert(entries, { onConflict: 'key' })
  if (error) throw error
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between rounded-lg bg-surface-container-low p-3 cursor-pointer">
      <span className="text-sm text-on-surface">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-border accent-primary"
      />
    </label>
  )
}

function SectionStatusBadge({ status }: { status: SectionStatus }) {
  if (!status) return null
  const isSuccess = status.type === 'success'
  const Icon = isSuccess ? CheckCircle2 : AlertCircle
  const colorClass = isSuccess ? 'text-success' : 'text-destructive'
  return (
    <div className={'flex items-center gap-1.5 text-xs mt-2 ' + colorClass}>
      <Icon className="h-3.5 w-3.5" />
      {status.message}
    </div>
  )
}

function SectionSkeleton() {
  const { t } = useI18n()
  return (
    <div className="col-span-full flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <span className="ml-3 text-on-surface-variant">{t('admin2.settings.loading')}</span>
    </div>
  )
}

export default function AdminSettingsPage() {
  const { t } = useI18n()
  const supabase = useMemo(() => createClient(), [])
  const [settings, setSettings] = useState<SettingMap | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<SectionName | null>(null)
  const rawSettingsRef = useRef<SettingMap>({})
  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set())
  const [statuses, setStatuses] = useState<Record<SectionName, SectionStatus>>({
    auth: null,
    email: null,
    ai: null,
    storage: null,
    notification: null,
    payment: null,
    placement: null,
  })

  useEffect(() => {
    fetchAllSettings(supabase)
      .then((map) => {
        setSettings(map)
        setLoading(false)
        // Store originals separately
        supabase.from('system_settings').select('key, value').then(({ data }) => {
          if (data) {
            const raw: SettingMap = {}
            for (const row of data) {
              raw[row.key] = row.value
            }
            rawSettingsRef.current = raw
          }
        })
      })
      .catch((err) => {
        console.error('Failed to load settings', err)
        setLoading(false)
      })
  }, [supabase])

  const get = useCallback(
    (key: string, fallback: unknown = '') => {
      const value = settings?.[key] ?? fallback
      if (SENSITIVE_KEYS.includes(key) && value === '••••••••' && visibleFields.has(key)) {
        return rawSettingsRef.current[key] ?? value
      }
      return value
    },
    [settings, visibleFields],
  )

  const set = useCallback(
    (key: string, value: unknown) => {
      if (SENSITIVE_KEYS.includes(key)) {
        rawSettingsRef.current[key] = value
      }
      setSettings((prev) => (prev ? { ...prev, [key]: value } : { [key]: value }))
    },
    [],
  )

  const setStatus = useCallback((section: SectionName, status: SectionStatus) => {
    setStatuses((prev) => ({ ...prev, [section]: status }))
  }, [])

  async function saveSection(section: SectionName, keys: string[]) {
    setSaving(section)
    setStatus(section, null)
    const entries = keys
      .map((key) => ({ key, value: settings?.[key] ?? null }))
      .filter(
        (e) =>
          e.value !== null &&
          e.value !== undefined &&
          !(SENSITIVE_KEYS.includes(e.key) && e.value === '••••••••'),
      )
    try {
      await upsertSettings(supabase, entries)
      setStatus(section, { type: 'success', message: t('admin2.settings.saved') })
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : t('admin2.settings.saveFailed', { error: JSON.stringify(err) })
      setStatus(section, { type: 'error', message: msg })
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <SectionSkeleton />

  return (
    <div className="space-y-6">
<div>
        <h1 className="text-2xl font-bold text-on-surface">{t('admin2.settings.title')}</h1>
        <p className="text-on-surface-variant">{t('admin2.settings.subtitle')}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Authentication */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
<LogIn className="h-4 w-4 text-indigo-400" />
              {t('admin2.settings.authTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Toggle
              label={t('admin2.settings.allowRegistration')}
              checked={!!get(K.AUTH_REG, false)}
              onChange={(v) => set(K.AUTH_REG, v)}
            />
            <Toggle
              label={t('admin2.settings.allowGoogle')}
              checked={!!get(K.AUTH_GOOGLE, false)}
              onChange={(v) => set(K.AUTH_GOOGLE, v)}
            />
            <Button
              size="sm"
              loading={saving === 'auth'}
              disabled={saving !== null}
              onClick={() => saveSection('auth', [K.AUTH_REG, K.AUTH_GOOGLE])}
            >
              {t('admin2.settings.saveAuth')}
            </Button>
            <SectionStatusBadge status={statuses.auth} />
          </CardContent>
        </Card>

        {/* Email */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-indigo-400" />
              {t('admin2.settings.emailTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-on-surface-variant">
              {t('admin2.settings.emailDesc')}
            </p>
            <Input
              label={t('admin2.settings.smtpHost')}
              placeholder="smtp.gmail.com"
              value={get(K.SMTP_HOST, '') as string}
              onChange={(e) => set(K.SMTP_HOST, e.target.value)}
            />
            <Input
              label={t('admin2.settings.smtpPort')}
              placeholder="587"
              value={get(K.SMTP_PORT, '') as string}
              onChange={(e) => set(K.SMTP_PORT, e.target.value)}
            />
            <div className="relative">
              <Input
                label={t('admin2.settings.smtpUser')}
                placeholder="noreply@lexora.com"
                value={get(K.SMTP_USER, '') as string}
                onChange={(e) => set(K.SMTP_USER, e.target.value)}
              />
            </div>
            <div className="relative">
              <Input
                label={t('admin2.settings.smtpPassword')}
                type={visibleFields.has(K.SMTP_PASSWORD) ? 'text' : 'password'}
                placeholder={t('admin2.settings.appPassword')}
                value={get(K.SMTP_PASSWORD, '') as string}
                onChange={(e) => set(K.SMTP_PASSWORD, e.target.value)}
              />
              <button
                type="button"
                onClick={() => setVisibleFields((prev) => {
                  const next = new Set(prev)
                  if (next.has(K.SMTP_PASSWORD)) {
                    next.delete(K.SMTP_PASSWORD)
                    set(K.SMTP_PASSWORD, '••••••••')
                  } else {
                    next.add(K.SMTP_PASSWORD)
                    set(K.SMTP_PASSWORD, rawSettingsRef.current[K.SMTP_PASSWORD] ?? '')
                  }
                  return next
                })}
                className="absolute right-3 top-[38px] text-xs text-primary hover:underline"
              >
                {visibleFields.has(K.SMTP_PASSWORD) ? t('admin2.settings.hide') : t('admin2.settings.show')}
              </button>
            </div>
            <Input
              label={t('admin2.settings.fromEmail')}
              type="email"
              placeholder="noreply@lexora.com"
              value={get(K.SMTP_FROM_EMAIL, '') as string}
              onChange={(e) => set(K.SMTP_FROM_EMAIL, e.target.value)}
            />
            <Input
              label={t('admin2.settings.fromName')}
              placeholder="Lexora Academy"
              value={get(K.SMTP_FROM_NAME, '') as string}
              onChange={(e) => set(K.SMTP_FROM_NAME, e.target.value)}
            />
            <Button
              size="sm"
              loading={saving === 'email'}
              disabled={saving !== null}
              onClick={() =>
                saveSection('email', [
                  K.SMTP_HOST,
                  K.SMTP_PORT,
                  K.SMTP_USER,
                  K.SMTP_PASSWORD,
                  K.SMTP_FROM_EMAIL,
                  K.SMTP_FROM_NAME,
                ])
              }
            >
              {t('admin2.settings.saveEmail')}
            </Button>
            <SectionStatusBadge status={statuses.email} />
          </CardContent>
        </Card>

        {/* AI Settings (OpenCode Zen) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
<Key className="h-4 w-4 text-indigo-400" />
              {t('admin2.settings.aiTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              label={t('admin2.settings.apiEndpoint')}
              value={get(K.AI_ENDPOINT, '') as string}
              onChange={(e) => set(K.AI_ENDPOINT, e.target.value)}
            />
            <Input
              label={t('admin2.settings.model')}
              placeholder="deepseek-v4-flash-free"
              value={get(K.AI_MODEL, 'deepseek-v4-flash-free') as string}
              onChange={(e) => set(K.AI_MODEL, e.target.value)}
            />
            <div className="relative">
              <Input
                label={t('admin2.settings.apiKey')}
                type={visibleFields.has(K.AI_KEY) ? 'text' : 'password'}
                value={get(K.AI_KEY, '') as string}
                onChange={(e) => set(K.AI_KEY, e.target.value)}
              />
              <button
                type="button"
                onClick={() => setVisibleFields((prev) => {
                  const next = new Set(prev)
                  if (next.has(K.AI_KEY)) {
                    next.delete(K.AI_KEY)
                    set(K.AI_KEY, '••••••••')
                  } else {
                    next.add(K.AI_KEY)
                    set(K.AI_KEY, rawSettingsRef.current[K.AI_KEY] ?? '')
                  }
                  return next
                })}
                className="absolute right-3 top-[38px] text-xs text-primary hover:underline"
              >
{visibleFields.has(K.AI_KEY) ? t('admin2.settings.hide') : t('admin2.settings.show')}
              </button>
            </div>
            <Toggle
              label={t('admin2.settings.enableAi')}
              checked={!!get(K.AI_ENABLED, false)}
              onChange={(v) => set(K.AI_ENABLED, v)}
            />
            <Button
              size="sm"
              loading={saving === 'ai'}
              disabled={saving !== null}
              onClick={() => saveSection('ai', [K.AI_ENDPOINT, K.AI_KEY, K.AI_MODEL, K.AI_ENABLED])}
            >
              {t('admin2.settings.saveAi')}
            </Button>
            <SectionStatusBadge status={statuses.ai} />
          </CardContent>
        </Card>

        {/* Storage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
<Database className="h-4 w-4 text-indigo-400" />
              {t('admin2.settings.storageTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              label={t('admin2.settings.maxUpload')}
              type="number"
              min={0}
              value={get(K.STORAGE_MAX_UPLOAD, '') as string}
              onChange={(e) => set(K.STORAGE_MAX_UPLOAD, e.target.valueAsNumber || e.target.value)}
            />
            <Input
              label={t('admin2.settings.allowedTypes')}
              value={get(K.STORAGE_ALLOWED_TYPES, '') as string}
              onChange={(e) => set(K.STORAGE_ALLOWED_TYPES, e.target.value)}
            />
            <Button
              size="sm"
              loading={saving === 'storage'}
              disabled={saving !== null}
              onClick={() =>
                saveSection('storage', [K.STORAGE_MAX_UPLOAD, K.STORAGE_ALLOWED_TYPES])
              }
            >
              {t('admin2.settings.saveStorage')}
            </Button>
            <SectionStatusBadge status={statuses.storage} />
          </CardContent>
        </Card>

        {/* Notification */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Bell className="h-4 w-4 text-indigo-400" />
              {t('admin2.settings.notifTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-on-surface-variant">
              {t('admin2.settings.notifDesc')}
            </p>
            <Toggle
              label={t('admin2.settings.emailNotif')}
              checked={!!get(K.NOTIF_EMAIL, false)}
              onChange={(v) => set(K.NOTIF_EMAIL, v)}
            />
            <Toggle
              label={t('admin2.settings.pushNotif')}
              checked={!!get(K.NOTIF_PUSH, false)}
              onChange={(v) => set(K.NOTIF_PUSH, v)}
            />
            <Button
              size="sm"
              loading={saving === 'notification'}
              disabled={saving !== null}
              onClick={() => saveSection('notification', [K.NOTIF_EMAIL, K.NOTIF_PUSH])}
            >
              {t('admin2.settings.saveNotif')}
            </Button>
            <SectionStatusBadge status={statuses.notification} />
          </CardContent>
        </Card>

        {/* Payment */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Database className="h-4 w-4 text-indigo-400" />
              {t('admin2.settings.paymentTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              label={t('admin2.settings.whatsappNumber')}
              placeholder={t('admin2.settings.exampleNumber')}
              value={get('whatsapp_number', '') as string}
              onChange={(e) => set('whatsapp_number', e.target.value)}
            />
            <Input
              label={t('admin2.settings.bankName')}
              placeholder={t('admin2.settings.exampleBank')}
              value={get('bank_name', '') as string}
              onChange={(e) => set('bank_name', e.target.value)}
            />
            <Input
              label={t('admin2.settings.bankAccount')}
              placeholder={t('admin2.settings.exampleAccount')}
              value={get('bank_account', '') as string}
              onChange={(e) => set('bank_account', e.target.value)}
            />
            <Input
              label={t('admin2.settings.bankHolder')}
              placeholder={t('admin2.settings.exampleHolder')}
              value={get('bank_holder', '') as string}
              onChange={(e) => set('bank_holder', e.target.value)}
            />
            <Input
              label={t('admin2.settings.courseFee')}
              type="number"
              min={0}
              placeholder={t('admin2.settings.exampleFee')}
              value={get('course_fee', '') as string}
              onChange={(e) => set('course_fee', e.target.value)}
            />
            <Button
              size="sm"
              loading={saving === 'payment'}
              disabled={saving !== null}
              onClick={() => saveSection('payment', ['whatsapp_number', 'bank_name', 'bank_account', 'bank_holder', 'course_fee'])}
            >
              {t('admin2.settings.savePayment')}
            </Button>
            <SectionStatusBadge status={statuses.payment} />
          </CardContent>
        </Card>

        {/* Placement */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-indigo-400" />
              {t('admin2.settings.placementTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-on-surface-variant">
              {t('admin2.settings.placementDesc')}
            </p>
            <Toggle
              label={t('admin2.settings.placementPopupEnabled')}
              checked={get(K.PLACEMENT_POPUP, true) !== false}
              onChange={(v) => set(K.PLACEMENT_POPUP, v)}
            />
            <Input
              label={t('admin2.settings.personalityLink')}
              type="url"
              placeholder={t('admin2.settings.personalityLinkPlaceholder')}
              value={get(K.PLACEMENT_PERSONALITY_LINK, '') as string}
              onChange={(e) => set(K.PLACEMENT_PERSONALITY_LINK, e.target.value)}
            />
            <Input
              label={t('admin2.settings.placementPrice')}
              type="number"
              min={0}
              placeholder={t('admin2.settings.placementPricePlaceholder')}
              value={get(K.PLACEMENT_PRICE, 599000) as string}
              onChange={(e) => set(K.PLACEMENT_PRICE, e.target.value ? Number(e.target.value) : null)}
            />
            <Input
              label={t('admin2.settings.bonusMeetings')}
              type="number"
              min={0}
              placeholder={t('admin2.settings.bonusMeetingsPlaceholder')}
              value={get(K.PLACEMENT_BONUS, 2) as string}
              onChange={(e) => set(K.PLACEMENT_BONUS, e.target.value ? Number(e.target.value) : null)}
            />
            <Button
              size="sm"
              loading={saving === 'placement'}
              disabled={saving !== null}
              onClick={() =>
                saveSection('placement', [
                  K.PLACEMENT_POPUP,
                  K.PLACEMENT_PERSONALITY_LINK,
                  K.PLACEMENT_PRICE,
                  K.PLACEMENT_BONUS,
                ])
              }
            >
              {t('admin2.settings.savePlacement')}
            </Button>
            <SectionStatusBadge status={statuses.placement} />
          </CardContent>
        </Card>

      </div>
    </div>
  )
}

