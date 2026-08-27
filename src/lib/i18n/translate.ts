import type { Lang } from './config'

export type Messages = Record<string, string>

export type TranslateVars = Record<string, string | number>

export function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) return template
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    const value = vars[name]
    return value === undefined || value === null ? match : String(value)
  })
}

export function lookup(messages: Messages, key: string, vars?: TranslateVars): string {
  const raw = messages[key]
  if (raw === undefined) return key
  return interpolate(raw, vars)
}

export function makeT(messages: Messages, fallback: Messages) {
  return (key: string, vars?: TranslateVars): string => {
    const raw = messages[key]
    if (raw !== undefined) return interpolate(raw, vars)
    const fallbackRaw = fallback[key]
    if (fallbackRaw !== undefined) return interpolate(fallbackRaw, vars)
    return key
  }
}

export type TFunc = ReturnType<typeof makeT>
export type { Lang }
