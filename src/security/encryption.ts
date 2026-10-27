// src/security/encryption.ts
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

export interface EncryptedPayload {
  encrypted: string;
  iv: string;
  authTag: string;
}

export class EncryptionService {
  private readonly key: Buffer;

  constructor(secretKey?: string) {
    const rawSecret = secretKey || process.env.ENCRYPTION_SECRET || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('ENCRYPTION_SECRET must be set in production'); })() : 'open-reminder-default-dev-key-32b!');
    // Derive a fixed 32-byte (256-bit) key using SHA-256
    this.key = createHash('sha256').update(rawSecret).digest();
  }

  encrypt(plainText: string): EncryptedPayload {
    const iv = randomBytes(12); // 96-bit IV recommended for AES-GCM
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  }

  decrypt(payload: EncryptedPayload): string {
    const iv = Buffer.from(payload.iv, 'hex');
    const authTag = Buffer.from(payload.authTag, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(payload.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  static maskKey(key: string): string {
    if (!key) return '';
    const trimmed = key.trim();
    if (trimmed.length <= 8) return '••••••••';
    const prefix = trimmed.slice(0, 3);
    const suffix = trimmed.slice(-4);
    return `${prefix}...${suffix}`;
  }

  static redactString(text: string): string {
    if (!text) return '';
    // Redact standard sk-... or AIza... or gsk-... patterns
    return text
      .replace(/sk-[a-zA-Z0-9_\-]{20,}/g, '[REDACTED_API_KEY]')
      .replace(/AIza[0-9A-Za-z\-_]{35}/g, '[REDACTED_GEMINI_KEY]')
      .replace(/xai-[a-zA-Z0-9_\-]{20,}/g, '[REDACTED_XAI_KEY]')
      .replace(/sm-[a-zA-Z0-9_\-]{20,}/g, '[REDACTED_SUPERMEMORY_KEY]');
  }
}
