// tests/unit/allowlist.test.ts
import { describe, it, expect } from 'vitest';
import { UserAllowlist } from '../../src/bot/allowlist.js';

describe('UserAllowlist', () => {
  it('allows all users when allowlist environment string is empty or undefined', () => {
    const openList = new UserAllowlist();
    expect(openList.isAllowed(12345)).toBe(true);
    expect(openList.isAllowed(99999)).toBe(true);

    const emptyList = new UserAllowlist('  ');
    expect(emptyList.isAllowed(12345)).toBe(true);
  });

  it('restricts access to explicitly allowed IDs when configured', () => {
    const restrictedList = new UserAllowlist('12345, 67890');
    expect(restrictedList.isAllowed(12345)).toBe(true);
    expect(restrictedList.isAllowed(67890)).toBe(true);
    expect(restrictedList.isAllowed(99999)).toBe(false);
  });
});
