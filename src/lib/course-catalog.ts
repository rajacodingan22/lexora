export type CatalogTier = 'basic' | 'advance' | 'expert'
export type CatalogTrack = 'fast_track' | 'regular' | 'intensive'

export interface CatalogDetailItem {
  title: string
  description?: string
  required?: boolean
}

export interface CatalogCertificate {
  title: string
  description?: string
  issuer?: string
}

export interface CourseCatalogDetails {
  topics?: CatalogDetailItem[]
  projects?: CatalogDetailItem[]
  certificates?: CatalogCertificate[]
}

export function normalizeTier(value: string | null | undefined): CatalogTier | null {
  const normalized = value?.toLowerCase().replace(/[\s-]+/g, '_')
  if (normalized === 'basic' || normalized === 'a1' || normalized === 'a2') return 'basic'
  if (normalized === 'advance' || normalized === 'advanced' || normalized === 'b1' || normalized === 'b2') return 'advance'
  if (normalized === 'expert' || normalized === 'c1' || normalized === 'c2') return 'expert'
  return null
}

export function normalizeTrack(value: string | null | undefined): CatalogTrack {
  const normalized = value?.toLowerCase().replace(/[\s-]+/g, '_')
  if (normalized === 'fast_track' || normalized === 'fast') return 'fast_track'
  if (normalized === 'intensive') return 'intensive'
  return 'regular'
}

export function tierLabelKey(value: string | null | undefined): string {
  const tier = normalizeTier(value)
  return tier ? `common.tier.${tier}` : 'common.tier.unknown'
}

export function trackLabelKey(value: string | null | undefined): string {
  return `common.track.${normalizeTrack(value)}`
}

export function parseCatalogItems(value: string, includeRequired = false): CatalogDetailItem[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title, description] = line.split('|').map((part) => part.trim())
      return includeRequired
        ? { title, description, required: true }
        : { title, description }
    })
}

export function parseCatalogCertificates(value: string): CatalogCertificate[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title, description, issuer] = line.split('|').map((part) => part.trim())
      return { title, description, issuer }
    })
}

export function catalogDetailsToForm(details: unknown): {
  topics_text: string
  projects_text: string
  certificates_text: string
} {
  const data = (details && typeof details === 'object' ? details : {}) as CourseCatalogDetails
  const itemLine = (item: CatalogDetailItem) => [item.title, item.description].filter(Boolean).join(' | ')
  const certificateLine = (item: CatalogCertificate) => [item.title, item.description, item.issuer].filter(Boolean).join(' | ')
  return {
    topics_text: (data.topics || []).map(itemLine).join('\n'),
    projects_text: (data.projects || []).map(itemLine).join('\n'),
    certificates_text: (data.certificates || []).map(certificateLine).join('\n'),
  }
}

export function catalogFormToDetails(topicsText: string, projectsText: string, certificatesText: string): CourseCatalogDetails {
  return {
    topics: parseCatalogItems(topicsText),
    projects: parseCatalogItems(projectsText, true),
    certificates: parseCatalogCertificates(certificatesText),
  }
}

export function mergeCatalogDetails(courseDetails: unknown, programDetails: unknown): CourseCatalogDetails {
  const course = (courseDetails && typeof courseDetails === 'object' ? courseDetails : {}) as CourseCatalogDetails
  const program = (programDetails && typeof programDetails === 'object' ? programDetails : {}) as CourseCatalogDetails
  return {
    topics: course.topics?.length ? course.topics : program.topics || [],
    projects: course.projects?.length ? course.projects : program.projects || [],
    certificates: course.certificates?.length ? course.certificates : program.certificates || [],
  }
}
