'use client'

import { useEffect, useState, useCallback } from 'react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/client'
import { createClient } from '@/lib/supabase-client'
import { formatDateOnly, pickName } from '@/lib/utils'
import type { Lang } from '@/lib/i18n/config'
import FilePreviewModal from '@/components/shared/file-preview-modal'
import {
  Award, Download, Shield, X, Loader2, Printer
} from 'lucide-react'
import type { Certificate, Course, LanguageLevel } from '@/types'

interface CertificateWithCourse extends Certificate {
  courses?: Pick<Course, 'title' | 'level_id' | 'language_code'> & {
    level?: Pick<LanguageLevel, 'name' | 'code'>
  }
}

function getTitle(t: { id?: string; en?: string } | string | null | undefined, lang: Lang = 'id'): string {
  if (!t) return ''
  return pickName(lang, t)
}

function getLevelName(level: { name?: { id?: string; en?: string }; code?: string } | null | undefined, lang: Lang = 'id'): string {
  if (!level) return ''
  const name = level.name
  if (name) return pickName(lang, name)
  return level.code || ''
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function generateQrSvg(code: string | null | undefined, size: number = 64): string {
  const cells = 11
  const hash = (code || 'N/A').split('').reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0), 0)
  const modules: boolean[] = []

  for (let i = 0; i < cells * cells; i++) {
    const x = i % cells
    const y = Math.floor(i / cells)

    const inFinder = (x < 3 && y < 3) || (x >= cells - 3 && y < 3) || (x < 3 && y >= cells - 3)
    if (inFinder) {
      const dx = x >= cells - 3 ? x - (cells - 3) : x
      const dy = y >= cells - 3 ? y - (cells - 3) : y
      const inCenter = dx >= 1 && dx <= 1 && dy >= 1 && dy <= 1
      const inRing = dx === 0 || dx === 2 || dy === 0 || dy === 2
      modules.push(inCenter || inRing)
    } else if ((x === cells - 1 && y === cells - 1) || (x === cells - 2 && y === cells - 1) || (x === cells - 1 && y === cells - 2)) {
      modules.push(true)
    } else if (x === cells - 3 && y >= cells - 3) {
      modules.push(y === cells - 3 || y === cells - 1 || x === cells - 3)
    } else {
      modules.push((hash * (i + 1) * 7 + i * 13) % 11 > 5)
    }
  }

  const rects = modules.map((dark, i) => {
    if (!dark) return ''
    const x = i % cells
    const y = Math.floor(i / cells)
    return `<rect x="${x}" y="${y}" width="1" height="1" fill="#b8860b"/>`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${cells} ${cells}">
    <rect width="${cells}" height="${cells}" fill="#ffffff"/>
    ${rects}
  </svg>`
}

function getStatusVariant(status: string): 'success' | 'warning' | 'default' | 'outline' {
  if (status === 'generated') return 'warning'
  if (status === 'downloaded') return 'success'
  if (status === 'issued') return 'success'
  return 'outline'
}

function getStatusLabel(status: string): string {
  if (status === 'generated') return 'Generated'
  if (status === 'downloaded') return 'Downloaded'
  if (status === 'issued') return 'Issued'
  return status
}

export default function CertificatesPage() {
  const { user } = useAuth()
  const { lang } = useI18n()
  const locale = lang === 'en' ? 'en-US' : lang === 'zh' ? 'zh-CN' : 'id-ID'
  const supabase = createClient()

  const [certificates, setCertificates] = useState<CertificateWithCourse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCert, setSelectedCert] = useState<CertificateWithCourse | null>(null)
  const [filePreview, setFilePreview] = useState<{ url: string; title: string } | null>(null)
  const [downloading, setDownloading] = useState(false)

  const fetchCertificates = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)

    try {
      const { data, error: err } = await supabase
        .from('certificates')
        .select('*, courses(title, level_id, language_code, level:language_levels(name, code))')
        .eq('user_id', user.id)
        .order('issue_date', { ascending: false })

      if (err) {
        setError(err.message)
      } else {
        setCertificates((data as unknown as CertificateWithCourse[]) || [])
      }
    } catch (err) {
      console.error('Failed to fetch certificates:', err)
      setError('Failed to load certificates')
    }
    setLoading(false)
  }, [user, supabase])

  useEffect(() => {
    fetchCertificates()
  }, [fetchCertificates])

  async function downloadUploadedFile(url: string, cert: CertificateWithCourse) {
    const ext = url.split('?')[0].split('.').pop()?.toLowerCase() || 'pdf'
    const filename = `certificate-${getTitle(cert.courses?.title, lang).replace(/\s+/g, '-') || cert.id}-${cert.certificate_code || ''}.${ext}`
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objectUrl)
    } catch {
      window.open(url, '_blank')
    }
  }

  async function downloadCertificate(cert: CertificateWithCourse) {
    setDownloading(true)
    if (cert.pdf_url) {
      await downloadUploadedFile(cert.pdf_url, cert)
      setDownloading(false)
      return
    }
    const svgContent = generateQrSvg(cert.certificate_code, 90)
    const studentName = escapeHtml(user?.display_name || 'Student')
    const courseName = escapeHtml(getTitle(cert.courses?.title, lang))
    const levelName = escapeHtml(getLevelName(cert.courses?.level, lang))
    const dateStr = formatDateOnly(cert.issue_date, locale)
    const grade = cert.final_grade

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Certificate - ${courseName}</title>
  <style>
    @page { size: landscape; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      background: #f5f0e8;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; padding: 24px;
    }
    @media print {
      body { padding: 0; background: white; }
      .cert-container { box-shadow: none; }
    }
    .cert-container {
      width: 1000px; min-height: 707px;
      background: linear-gradient(135deg, #fdfaf2 0%, #f5ebd8 100%);
      border: 10px solid;
      border-image: linear-gradient(135deg, #d4af37, #b8860b, #d4af37, #b8860b) 1;
      padding: 6px;
      position: relative;
      box-shadow: 0 8px 40px rgba(0,0,0,0.12);
    }
    .cert-border-inner {
      border: 2px solid #b8860b;
      height: 100%;
      padding: 40px 48px;
      display: flex; flex-direction: column; align-items: center;
      position: relative; overflow: hidden;
    }
    .cert-border-inner::before {
      content: '';
      position: absolute; inset: 12px;
      border: 1px solid #d4af37;
      pointer-events: none;
    }
    .cert-watermark {
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%, -50%) rotate(-30deg);
      font-size: 140px; color: #d4af37; opacity: 0.06;
      font-family: 'Georgia', serif; font-weight: bold;
      pointer-events: none; letter-spacing: 12px;
    }
    .cert-badge { font-size: 52px; margin-bottom: 8px; z-index: 1; }
    .cert-seal {
      width: 80px; height: 80px; border-radius: 50%;
      border: 3px solid #b8860b;
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 12px; background: linear-gradient(135deg, #fdfaf2, #f0e6d3);
      position: relative; z-index: 1;
    }
    .cert-seal-inner {
      width: 60px; height: 60px; border-radius: 50%;
      border: 2px solid #d4af37;
      display: flex; align-items: center; justify-content: center;
      font-size: 28px;
    }
    h1 {
      font-size: 34px; color: #8b6914; letter-spacing: 5px;
      text-transform: uppercase; font-weight: 700; margin-bottom: 4px;
      z-index: 1;
    }
    .cert-subtitle {
      font-size: 13px; color: #a0822a; letter-spacing: 3px;
      margin-bottom: 20px; text-transform: uppercase; z-index: 1;
    }
    .cert-line {
      width: 55%; height: 1px;
      background: linear-gradient(to right, transparent, #d4af37, transparent);
      margin: 14px auto; z-index: 1;
    }
    .cert-label { font-size: 13px; color: #6b5b3e; margin-bottom: 4px; z-index: 1; }
    .cert-name {
      font-size: 34px; font-weight: 700; color: #2c1810;
      margin-bottom: 6px; font-family: 'Georgia', serif; z-index: 1;
    }
    .cert-course { font-size: 18px; color: #4a3728; margin-bottom: 4px; z-index: 1; }
    .cert-level { font-size: 13px; color: #6b5b3e; margin-bottom: 20px; z-index: 1; }
    .cert-details {
      display: flex; gap: 48px; justify-content: center;
      font-size: 12px; color: #6b5b3e; margin-bottom: 20px; z-index: 1;
    }
    .cert-details span { display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .cert-details strong { color: #2c1810; font-size: 14px; }
    .cert-footer {
      margin-top: auto; width: 100%;
      display: flex; align-items: flex-end; justify-content: space-between;
      z-index: 1; padding-top: 8px;
    }
    .cert-footer-left { font-size: 10px; color: #a0822a; text-align: left; }
    .cert-footer-right { display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .cert-number { font-family: monospace; font-size: 11px; color: #8b6914; }
    .qr-wrap {
      width: 72px; height: 72px;
      display: flex; align-items: center; justify-content: center;
      border: 1px solid #d4af37; border-radius: 4px;
      background: white; padding: 2px;
    }
    .qr-wrap svg { display: block; }
    .verify-text { font-size: 8px; color: #8b6914; text-align: center; line-height: 1.3; }
    .signature-area {
      display: flex; gap: 60px; justify-content: center; margin-bottom: 4px; z-index: 1;
    }
    .signature-item { text-align: center; }
    .signature-line { width: 140px; height: 1px; background: #b8860b; margin: 4px 0 2px; }
    .signature-label { font-size: 10px; color: #6b5b3e; }
  </style>
</head>
<body>
  <div class="cert-container">
    <div class="cert-border-inner">
      <div class="cert-watermark">LEXORA ACADEMY</div>

      <div class="cert-seal">
        <div class="cert-seal-inner">&#127891;</div>
      </div>
      <div class="cert-badge">&#127942;</div>
      <h1>Certificate of Completion</h1>
      <div class="cert-subtitle">Lexora Academy</div>
      <div class="cert-line"></div>

      <p class="cert-label">This certifies that</p>
      <p class="cert-name">${studentName}</p>
      <p class="cert-label">has successfully completed</p>
      <p class="cert-course">${courseName}</p>
      <p class="cert-level">Level: ${levelName}</p>

      <div class="cert-line"></div>

      <div class="cert-details">
        <span>Date <strong>${dateStr}</strong></span>
        <span>Grade <strong>${grade}%</strong></span>
        <span>Duration <strong>${cert.courses?.language_code?.toUpperCase() || ''}</strong></span>
      </div>

      <div class="signature-area">
        <div class="signature-item">
          <div class="signature-line"></div>
          <div class="signature-label">Academic Director</div>
        </div>
        <div class="signature-item">
          <div class="signature-line"></div>
          <div class="signature-label">Instructor</div>
        </div>
      </div>

      <div class="cert-line" style="margin-bottom: 4px;"></div>

      <div class="cert-footer">
        <div class="cert-footer-left">
          Certificate No: <span class="cert-number">${cert.certificate_code}</span>
        </div>
        <div class="cert-footer-right">
          <div class="qr-wrap">${svgContent}</div>
          <div class="verify-text">Verify at<br/>lexora.com/verify</div>
        </div>
      </div>
    </div>
  </div>
  <script>window.onload = function() { window.print(); window.close(); }</script>
</body>
</html>`

    const win = window.open('', '_blank')
    if (win) {
      win.document.write(html)
      win.document.close()
    }
    setDownloading(false)
  }

  return (
    <section className="space-y-6">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Certificates</h1>
          <p className="text-on-surface-variant">Download and verify your certificates</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
          </div>
        ) : error ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-red-400">{error}</p>
              <Button className="mt-4" variant="outline" onClick={fetchCertificates}>
                Try Again
              </Button>
            </CardContent>
          </Card>
        ) : certificates.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Award className="mx-auto h-12 w-12 text-muted mb-4" />
              <h3 className="font-semibold text-on-surface">You haven&apos;t earned any certificates yet</h3>
              <p className="text-sm text-on-surface-variant mt-1">
                Complete a course with a passing grade to earn your certificate
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {certificates.map((cert) => (
              <Card key={cert.id} className="relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-transparent" />
                <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600">
                      <Award className="h-7 w-7 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-on-surface">
                        {getTitle(cert.courses?.title, lang)}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                        {cert.courses?.level && (
                          <Badge variant="outline">Level: {getLevelName(cert.courses.level, lang)}</Badge>
                        )}
                        <span>Grade: {cert.final_grade}%</span>
                        <span>Issued: {formatDateOnly(cert.issue_date, locale)}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-1 text-[10px] text-muted">
                        <Shield className="h-3 w-3 text-emerald-400" />
                        Code: {cert.certificate_code}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={getStatusVariant(cert.status)}>
                      {getStatusLabel(cert.status)}
                    </Badge>
                    <Button size="sm" onClick={() => { if (cert.pdf_url) setFilePreview({ url: cert.pdf_url, title: getTitle(cert.courses?.title, lang) || 'Certificate' }); else setSelectedCert(cert) }}>
                      <Download className="mr-1 h-3 w-3" /> PDF
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {selectedCert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-3xl rounded-2xl bg-surface border border-border shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-lg font-semibold text-on-surface">Certificate Preview</h2>
              <Button variant="ghost" size="sm" onClick={() => setSelectedCert(null)}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div id="certificate-preview-content" className="p-6 sm:p-10">
              <CertificateCard cert={selectedCert} user={user} />
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
              <Button variant="ghost" onClick={() => setSelectedCert(null)}>
                Close
              </Button>
              <Button
                onClick={() => downloadCertificate(selectedCert)}
                disabled={downloading}
              >
                {downloading ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Printer className="mr-1 h-4 w-4" />
                )}
                Download & Print Certificate
              </Button>
            </div>
          </div>
        </div>
      )}
      {filePreview && (
        <FilePreviewModal
          url={filePreview.url}
          title={filePreview.title}
          onClose={() => setFilePreview(null)}
        />
      )}
    </section>
  )
}

function CertificateCard({
  cert,
  user,
}: {
  cert: CertificateWithCourse
  user: { display_name?: string | null } | null
}) {
  const { t, lang } = useI18n()
  const locale = lang === 'en' ? 'en-US' : lang === 'zh' ? 'zh-CN' : 'id-ID'
  const svgContent = generateQrSvg(cert.certificate_code, 80)
  const _encodedSvg = svgContent
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/#/g, '%23')

  return (
    <div
      id="certificate-display"
      className="certificate-print rounded-xl bg-gradient-to-br from-amber-50 via-white to-amber-50 p-8 sm:p-12 text-center relative overflow-hidden border-4 border-amber-600/60"
    >
      <style>{`
        .certificate-print {
          --gold: #b8860b;
          --gold-light: #d4af37;
          --gold-dark: #8b6914;
        }
        @media print {
          body { background: white; margin: 0; padding: 0; }
          .certificate-print {
            border: 6px solid var(--gold) !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            page-break-inside: avoid;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .certificate-print * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'radial-gradient(circle at 25% 25%, #d4af37 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

      <div className="absolute inset-6 rounded-lg border border-amber-300/40 pointer-events-none" />

      <div className="relative">
        <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full border-2 border-amber-600/40 bg-gradient-to-br from-amber-50 to-amber-100">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-amber-400/60 text-3xl">
            &#127891;
          </div>
        </div>

        <div className="text-5xl mb-3">&#127942;</div>

        <h2 className="text-3xl font-bold tracking-[0.15em] text-amber-800 uppercase">
          Certificate of Completion
        </h2>
        <p className="text-xs tracking-[0.2em] text-amber-600 uppercase mt-1">
          Lexora Academy
        </p>

        <div className="mx-auto my-5 h-px w-3/5 bg-gradient-to-r from-transparent via-amber-400 to-transparent" />

        <p className="text-xs text-amber-700/60">This certifies that</p>
        <p className="text-3xl font-bold text-gray-900 mt-1 font-serif">
          {user?.display_name || 'Student'}
        </p>
        <p className="text-xs text-amber-700/60 mt-4">has successfully completed</p>
        <p className="text-lg font-semibold text-gray-800 mt-1">
          {getTitle(cert.courses?.title, lang)}
        </p>
        <p className="text-xs text-amber-700 mt-1">
          Level: {getLevelName(cert.courses?.level, lang)}
        </p>

        <div className="mx-auto my-5 h-px w-3/5 bg-gradient-to-r from-transparent via-amber-400 to-transparent" />

        <div className="flex justify-center gap-10 text-xs text-amber-700/60">
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[9px] uppercase tracking-widest">Date</span>
            <span className="font-semibold text-gray-800 text-sm">
              {formatDateOnly(cert.issue_date, locale)}
            </span>
          </div>
          <div className="w-px bg-amber-300/50" />
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[9px] uppercase tracking-widest">Grade</span>
            <span className="font-semibold text-gray-800 text-sm">{cert.final_grade}%</span>
          </div>
          <div className="w-px bg-amber-300/50" />
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[9px] uppercase tracking-widest">Status</span>
            <Badge variant={getStatusVariant(cert.status)} className="mt-0.5 text-[10px]">
              {getStatusLabel(cert.status)}
            </Badge>
          </div>
        </div>

        <div className="flex justify-center gap-8 sm:gap-12 mt-5 mb-4">
          <div className="text-center">
            <div className="mx-auto h-px w-28 bg-amber-500/60 mb-1" />
            <p className="text-[9px] text-amber-700/50">Academic Director</p>
          </div>
          <div className="text-center">
            <div className="mx-auto h-px w-28 bg-amber-500/60 mb-1" />
            <p className="text-[9px] text-amber-700/50">Instructor</p>
          </div>
        </div>

        <div className="mx-auto my-4 h-px w-3/5 bg-gradient-to-r from-transparent via-amber-400 to-transparent" />

        <div className="flex items-end justify-between mt-4">
          <div className="text-left">
            <p className="text-[9px] text-amber-600/60">Certificate No:</p>
            <p className="font-mono text-xs font-medium text-amber-700">
              {cert.certificate_code}
            </p>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div
              className="h-16 w-16 rounded border border-amber-400/40 bg-white p-0.5 flex items-center justify-center"
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
            <p className="text-[7px] text-amber-600/60 leading-tight text-center">
              Verify at<br />lexora.com/verify
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
