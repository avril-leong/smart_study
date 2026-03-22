// lib/__tests__/crypto.test.ts
// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { encryptKey, decryptKey } from '../crypto'

describe('encryptKey / decryptKey', () => {
  const OLD_ENV = process.env
  beforeEach(() => {
    process.env = { ...OLD_ENV, SETTINGS_ENCRYPTION_KEY: 'a'.repeat(64) }
  })
  afterEach(() => { process.env = OLD_ENV })

  it('round-trips a plaintext key', () => {
    const plaintext = 'sk-test-1234567890abcdef'
    const { encrypted, iv } = encryptKey(plaintext)
    expect(decryptKey(encrypted, iv)).toBe(plaintext)
  })

  it('produces different ciphertexts for same input (random IV)', () => {
    const plaintext = 'sk-same-key'
    const a = encryptKey(plaintext)
    const b = encryptKey(plaintext)
    expect(a.encrypted).not.toBe(b.encrypted)
    expect(a.iv).not.toBe(b.iv)
  })

  it('throws on tampered ciphertext', () => {
    const plaintext = 'sk-test'
    const { encrypted, iv } = encryptKey(plaintext)
    const tampered = (parseInt(encrypted[0], 16) ^ 1).toString(16) + encrypted.slice(1)
    expect(() => decryptKey(tampered, iv)).toThrow()
  })

  it('throws when SETTINGS_ENCRYPTION_KEY is missing', () => {
    delete process.env.SETTINGS_ENCRYPTION_KEY
    expect(() => encryptKey('anything')).toThrow('SETTINGS_ENCRYPTION_KEY')
  })
})
