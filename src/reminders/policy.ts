// src/reminders/policy.ts

export interface ReminderPolicy {
  getNextFollowUpDelayMinutes(followUpCount: number): number | null;
  getMaxFollowUps(): number;
  isMaxReached(followUpCount: number, maxFollowUps?: number): boolean;
}

export class DefaultReminderPolicy implements ReminderPolicy {
  private readonly maxFollowUps: number;

  constructor(maxFollowUps: number = 8) {
    this.maxFollowUps = maxFollowUps;
  }

  /**
   * Returns follow-up delay in minutes based on how many follow-ups have been sent.
   * followUpCount = 0 (about to send 1st follow-up) -> 10 minutes
   * followUpCount = 1 (about to send 2nd follow-up) -> 30 minutes
   * followUpCount >= 2 -> 60 minutes
   * If max reached -> null
   */
  getNextFollowUpDelayMinutes(followUpCount: number): number | null {
    if (followUpCount >= this.maxFollowUps) {
      return null;
    }

    if (followUpCount === 0) {
      return 10;
    }
    if (followUpCount === 1) {
      return 30;
    }
    return 60;
  }

  getMaxFollowUps(): number {
    return this.maxFollowUps;
  }

  isMaxReached(followUpCount: number, maxFollowUps?: number): boolean {
    const limit = maxFollowUps ?? this.maxFollowUps;
    return followUpCount >= limit;
  }
}
