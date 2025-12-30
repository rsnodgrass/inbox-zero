import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateWebhookDiagnostics,
  logAntiEntropyFindings,
  formatTimeSinceWebhook,
} from "./diagnostics";
import type { Logger } from "@/utils/logger";

// Run with: pnpm test utils/anti-entropy/diagnostics.test.ts

describe("diagnostics", () => {
  describe("generateWebhookDiagnostics", () => {
    it("should generate diagnostics for Google provider", () => {
      const lastWebhook = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

      const result = generateWebhookDiagnostics(
        "google",
        "test@example.com",
        5,
        lastWebhook,
      );

      expect(result.provider).toBe("google");
      expect(result.accountEmail).toBe("test@example.com");
      expect(result.missedMessageCount).toBe(5);
      expect(result.timeSinceLastWebhook).toBeGreaterThan(0);
      expect(result.suggestedFixes).toContain(
        "Check GOOGLE_PUBSUB_VERIFICATION_TOKEN is set correctly",
      );
      expect(result.suggestedFixes).toContain(
        "Run /api/watch/all to refresh the watch subscription",
      );
    });

    it("should generate diagnostics for Microsoft provider", () => {
      const lastWebhook = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago

      const result = generateWebhookDiagnostics(
        "microsoft",
        "user@outlook.com",
        3,
        lastWebhook,
      );

      expect(result.provider).toBe("microsoft");
      expect(result.accountEmail).toBe("user@outlook.com");
      expect(result.missedMessageCount).toBe(3);
      expect(result.suggestedFixes).toContain(
        "Check MICROSOFT_WEBHOOK_CLIENT_STATE is set correctly",
      );
      expect(result.suggestedFixes).toContain(
        "Run /api/outlook/watch/all to refresh the subscription",
      );
    });

    it("should handle null lastWebhookReceivedAt", () => {
      const result = generateWebhookDiagnostics(
        "google",
        "test@example.com",
        10,
        null,
      );

      expect(result.timeSinceLastWebhook).toBeNull();
      expect(result.missedMessageCount).toBe(10);
    });
  });

  describe("logAntiEntropyFindings", () => {
    const mockLogger = {
      warn: vi.fn(),
      with: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should log warning with diagnostic info", () => {
      const diagnostic = generateWebhookDiagnostics(
        "google",
        "test@example.com",
        5,
        new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
      );

      logAntiEntropyFindings(diagnostic, mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Anti-entropy caught missed emails - webhook may be misconfigured",
        expect.objectContaining({
          provider: "google",
          email: "test@example.com",
          missedCount: 5,
        }),
      );
    });

    it("should include top 3 suggestions", () => {
      const diagnostic = generateWebhookDiagnostics(
        "google",
        "test@example.com",
        5,
        new Date(),
      );

      logAntiEntropyFindings(diagnostic, mockLogger);

      const callArgs = (mockLogger.warn as any).mock.calls[0][1];
      expect(callArgs.suggestions).toHaveLength(3);
    });

    it("should handle never received webhook", () => {
      const diagnostic = generateWebhookDiagnostics(
        "microsoft",
        "user@outlook.com",
        10,
        null,
      );

      logAntiEntropyFindings(diagnostic, mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Anti-entropy caught missed emails - webhook may be misconfigured",
        expect.objectContaining({
          lastWebhook: "never",
        }),
      );
    });
  });

  describe("formatTimeSinceWebhook", () => {
    it("should return 'never' for null date", () => {
      expect(formatTimeSinceWebhook(null)).toBe("never");
    });

    it("should format recent date", () => {
      const recentDate = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      const result = formatTimeSinceWebhook(recentDate);

      expect(result).toContain("minutes ago");
    });

    it("should format older date", () => {
      const olderDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      const result = formatTimeSinceWebhook(olderDate);

      expect(result).toContain("hours ago");
    });
  });
});
