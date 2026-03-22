// lib/crypto.ts
// Node.js only — do NOT import in Edge runtime routes
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16

function getKey(): Buffer {
  const hex = process.env.SETTINGS_ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error('SETTINGS_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

/**
 * Encrypts plaintext with AES-256-GCM.
 * Returns hex-encoded `ciphertext+authTag` and the hex-encoded 12-byte IV.
 * The 16-byte GCM auth tag is appended to the ciphertext before hex encoding.
 */
export function encryptKey(plaintext: string): { encrypted: string; iv: string } {
  const key = getKey()
  const ivBuf = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, ivBuf)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    encrypted: Buffer.concat([encrypted, tag]).toString('hex'),
    iv: ivBuf.toString('hex'),
  }
}

/**
 * Decrypts AES-256-GCM ciphertext.
 * `encrypted` is hex-encoded `ciphertext+authTag` (last 32 hex chars = 16-byte tag).
 * Throws if authentication fails (tampered data or wrong key).
 */
export function decryptKey(encrypted: string, iv: string): string {
  const key = getKey()
  const combined = Buffer.from(encrypted, 'hex')
  const tag = combined.subarray(combined.length - TAG_BYTES)
  const ciphertext = combined.subarray(0, combined.length - TAG_BYTES)
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'))
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
