// tests/unit/policy.test.ts
import { describe, it, expect } from 'vitest';
import { DefaultReminderPolicy } from '../../src/reminders/policy.js';

describe('Reminder Policy', () => {
  const policy = new DefaultReminderPolicy(8);

  it('provides 10 minutes for the first follow-up (after initial send at followUpCount 0)', () => {
    expect(policy.getNextFollowUpDelayMinutes(0)).toBe(10);
  });

  it('provides 30 minutes for the second follow-up (followUpCount 1)', () => {
    expect(policy.getNextFollowUpDelayMinutes(1)).toBe(30);
  });

  it('provides 60 minutes for subsequent follow-ups (followUpCount 2 through 7)', () => {
    expect(policy.getNextFollowUpDelayMinutes(2)).toBe(60);
    expect(policy.getNextFollowUpDelayMinutes(5)).toBe(60);
    expect(policy.getNextFollowUpDelayMinutes(7)).toBe(60);
  });

  it('returns null and reports max reached when limit (8) is reached', () => {
    expect(policy.getNextFollowUpDelayMinutes(8)).toBeNull();
    expect(policy.isMaxReached(8)).toBe(true);
    expect(policy.isMaxReached(9)).toBe(true);
    expect(policy.isMaxReached(7)).toBe(false);
  });

  it('supports custom configurable max follow-ups', () => {
    const customPolicy = new DefaultReminderPolicy(3);
    expect(customPolicy.isMaxReached(3)).toBe(true);
    expect(customPolicy.getNextFollowUpDelayMinutes(3)).toBeNull();
  });
});
