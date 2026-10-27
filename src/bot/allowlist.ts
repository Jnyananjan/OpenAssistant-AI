// src/bot/allowlist.ts

export class UserAllowlist {
  private allowedIds: Set<number> | null;

  constructor(allowedUsersEnv?: string) {
    if (!allowedUsersEnv || allowedUsersEnv.trim() === '') {
      this.allowedIds = null; // No allowlist restriction
    } else {
      const ids = allowedUsersEnv
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));
      this.allowedIds = new Set(ids);
    }
  }

  isAllowed(telegramUserId: number): boolean {
    if (this.allowedIds === null) {
      return true;
    }
    return this.allowedIds.has(telegramUserId);
  }
}
