// src/bot/allowlist.ts

export class UserAllowlist {
  private allowedIds: Set<number> | null;

  constructor(allowedUsersEnv?: string) {
    if (!allowedUsersEnv || allowedUsersEnv.trim() === '') {
      this.allowedIds = null; // No allowlist restriction
    } else {
      const cleaned = allowedUsersEnv.replace(/[\[\]"']/g, '').trim();
      const ids = cleaned
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));
      this.allowedIds = ids.length > 0 ? new Set(ids) : null;
    }
  }

  isAllowed(telegramUserId: number): boolean {
    if (this.allowedIds === null) {
      return true;
    }
    return this.allowedIds.has(telegramUserId);
  }
}
