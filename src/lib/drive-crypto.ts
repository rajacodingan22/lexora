import crypto from 'crypto'

const ALGO = 'aes-256-gcm'
function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY || process.env.GOOGLE_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef'
  // ensure 32 bytes
  const hash = crypto.createHash('sha256').update(raw).digest()
  return hash
}
export function encrypt(text: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key as any, iv)
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}
export function decrypt(b64: string): string {
  const key = getKey()
  const data = Buffer.from(b64, 'base64')
  const iv = data.subarray(0, 12)
  const tag = data.subarray(12, 28)
  const enc = data.subarray(28)
  const decipher = crypto.createDecipheriv(ALGO, key as any, iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(enc), decipher.final()])
  return dec.toString('utf8')
}
