// tests/unit/encryption.test.ts
import { describe, it, expect } from 'vitest';
import { EncryptionService } from '../../src/security/encryption.js';

describe('EncryptionService', () => {
  const service = new EncryptionService('custom-test-secret-key-for-unit-tests');

  it('encrypts and decrypts secret keys using AES-256-GCM', () => {
    const rawApiKey = 'sk-proj-1234567890abcdefghijklmnopqrstuvwxyz';
    const payload = service.encrypt(rawApiKey);

    expect(payload.encrypted).toBeDefined();
    expect(payload.iv).toHaveLength(24); // 12 bytes = 24 hex chars
    expect(payload.authTag).toHaveLength(32); // 16 bytes = 32 hex chars
    expect(payload.encrypted).not.toContain(rawApiKey);

    const decrypted = service.decrypt(payload);
    expect(decrypted).toBe(rawApiKey);
  });

  it('fails decryption if auth tag or payload is tampered with', () => {
    const payload = service.encrypt('super-secret-api-token');
    // Flip first character to guarantee tampering regardless of random ciphertext
    const tamperedChar = payload.encrypted[0] === '0' ? '1' : '0';
    const tamperedPayload = {
      ...payload,
      encrypted: tamperedChar + payload.encrypted.slice(1),
    };

    expect(() => service.decrypt(tamperedPayload)).toThrow();
  });

  it('masks secret keys safely for user display', () => {
    expect(EncryptionService.maskKey('sk-1234567890abcdefghijk')).toBe('sk-...hijk');
    expect(EncryptionService.maskKey('AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz')).toBe('AIz...WxYz');
    expect(EncryptionService.maskKey('short')).toBe('••••••••');
    expect(EncryptionService.maskKey('')).toBe('');
  });

  it('redacts sensitive API keys from strings and logs', () => {
    const log = 'Failed request with key sk-1234567890123456789012 and AIzaSy123456789012345678901234567890123';
    const redacted = EncryptionService.redactString(log);
    expect(redacted).toContain('[REDACTED_API_KEY]');
    expect(redacted).toContain('[REDACTED_GEMINI_KEY]');
    expect(redacted).not.toContain('sk-1234567890123456789012');
  });
});
