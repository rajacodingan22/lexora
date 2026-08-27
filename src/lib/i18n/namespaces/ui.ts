import type { Lang } from '../config'

const id: Record<string, string> = {}
const en: Record<string, string> = {}
const zh: Record<string, string> = {}

export const ui: Record<Lang, Record<string, string>> = { id, en, zh }
export default ui

