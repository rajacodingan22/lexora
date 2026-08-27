export function generateCertificateNumber(): string {
  const now = new Date()
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, '')
  // Use crypto-random for unpredictability (fallback to Math.random only if crypto unavailable, e.g., old edge)
  const random = (() => {
    try {
      if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return (crypto as Crypto).randomUUID().slice(0, 8).toUpperCase().replace(/-/g, '').slice(0, 6)
      }
      if (typeof crypto !== 'undefined' && typeof (crypto as any).getRandomValues === 'function') {
        const arr = new Uint32Array(1)
        ;(crypto as any).getRandomValues(arr)
        return arr[0].toString(36).substring(0, 6).toUpperCase().padStart(6, '0')
      }
    } catch {}
    // Fallback (not cryptographically strong, but better than direct Math.random substring)
    return Math.random().toString(36).substring(2, 8).toUpperCase()
  })()
  return `EL-${yyyymmdd}-${random}`
}
