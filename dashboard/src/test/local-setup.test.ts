import { describe, it, expect } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  initialConfig,
  updateConfig,
  seal,
  unseal,
  publicConfig,
  writeConfig,
  readConfig,
  settingsSchema,
  permittedRequest,
  webhookSchema,
} from "../../scripts/setup-core.mjs";

const preferences = { allowedUsers: ["123456789"], timezone: "Asia/Kolkata", maxFollowUps: 4 };
describe("local setup rules", () => {
  it("keeps the master encryption key fixed when provider credentials change", () => {
    const current = initialConfig({}, preferences);
    const changed = updateConfig(
      current,
      { GEMINI_API_KEY: "test-fixture-not-a-real-credential" },
      preferences,
    );
    expect(changed.encryptionSecret === current.encryptionSecret).toBe(true);
    expect(changed.workerSecret === current.workerSecret).toBe(true);
  });
  it("never returns saved credential values or master keys in status", () => {
    const result = publicConfig(
      initialConfig({ GEMINI_API_KEY: "test-fixture-not-a-real-credential" }, preferences),
    );
    expect(Object.keys(result).sort()).toEqual(
      ["credentials", "encryptionConfigured", "settings", "webhookUrl", "workerConfigured"].sort(),
    );
    expect(
      result.credentials.find((item: { name: string }) => item.name === "GEMINI_API_KEY"),
    ).toEqual({ name: "GEMINI_API_KEY", configured: true });
    expect(JSON.stringify(result).includes("test-fixture-not-a-real-credential")).toBe(false);
  });
  it("rejects nonnumeric Telegram allowed user IDs", () => {
    expect(settingsSchema.safeParse({ ...preferences, allowedUsers: ["@someone"] }).success).toBe(
      false,
    );
    expect(settingsSchema.safeParse({ ...preferences, allowedUsers: ["123456789"] }).success).toBe(
      true,
    );
  });
  it("accepts the checklist timezone Asia/Kolkata and rejects invalid zones", () => {
    expect(settingsSchema.safeParse(preferences).success).toBe(true);
    expect(settingsSchema.safeParse({ ...preferences, timezone: "Not/A_Zone" }).success).toBe(
      false,
    );
  });
  it("preserves the explicitly chosen follow-up limit", () => {
    expect(
      updateConfig(initialConfig({}, preferences), {}, { ...preferences, maxFollowUps: 7 }).settings
        .maxFollowUps,
    ).toBe(7);
  });
  it("rejects unapproved origins and DNS-rebinding hosts", () => {
    expect(
      permittedRequest("localhost:4000", "http://localhost:8080", ["http://localhost:8080"], 4000),
    ).toBe(true);
    expect(
      permittedRequest(
        "attacker.example:4000",
        "http://localhost:8080",
        ["http://localhost:8080"],
        4000,
      ),
    ).toBe(false);
    expect(
      permittedRequest(
        "localhost:4000",
        "https://attacker.example",
        ["http://localhost:8080"],
        4000,
      ),
    ).toBe(false);
    expect(permittedRequest("localhost:4000", undefined, ["http://localhost:8080"], 4000)).toBe(
      false,
    );
  });
  it("rejects loopback webhook URLs and registration without handler confirmation", () => {
    expect(
      webhookSchema.safeParse({ url: "http://localhost:4000/webhook", handlerReady: true }).success,
    ).toBe(false);
    expect(
      webhookSchema.safeParse({ url: "https://127.0.0.1/webhook", handlerReady: true }).success,
    ).toBe(false);
    expect(
      webhookSchema.safeParse({ url: "https://handler.example/webhook", handlerReady: false })
        .success,
    ).toBe(false);
    expect(
      webhookSchema.safeParse({ url: "https://handler.example/webhook", handlerReady: true })
        .success,
    ).toBe(true);
  });
  it("rejects the wrong passphrase and modified encrypted data", () => {
    const sealed = seal(initialConfig({}, preferences), "unit-test-unlock-passphrase");
    expect(() => unseal(sealed, "incorrect-unlock-passphrase")).toThrow("Unable to unlock");
    const value = JSON.parse(sealed);
    value.body = "AAAA";
    expect(() => unseal(JSON.stringify(value), "unit-test-unlock-passphrase")).toThrow(
      "Unable to unlock",
    );
  });
  it("persists configuration to disk and reads it back with owner-only permissions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "jana-setup-test-"));
    try {
      const original = initialConfig({}, preferences);
      await writeConfig(directory, original, "unit-test-unlock-passphrase");
      const changed = updateConfig(
        await readConfig(directory, "unit-test-unlock-passphrase"),
        {},
        { ...preferences, maxFollowUps: 7 },
      );
      await writeConfig(directory, changed, "unit-test-unlock-passphrase");
      expect(
        (await readConfig(directory, "unit-test-unlock-passphrase")).settings.maxFollowUps,
      ).toBe(7);
      if (process.platform !== "win32") {
        expect((await stat(join(directory, "config.enc"))).mode & 0o777).toBe(0o600);
        expect((await stat(directory)).mode & 0o777).toBe(0o700);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
