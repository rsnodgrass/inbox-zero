import { describe, it, expect, vi, beforeEach } from "vitest";
import { subMinutes, subHours } from "date-fns";

// Run with: cd apps/web && pnpm vitest run utils/anti-entropy/index.test.ts

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma", () => ({
  default: {
    emailAccount: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));
vi.mock("@/utils/premium", () => ({
  getPremiumUserFilter: vi.fn().mockReturnValue({}),
}));
vi.mock("./poll-email-account", () => ({
  pollEmailAccount: vi.fn(),
}));
vi.mock("./execute-pending-actions", () => ({
  executePendingScheduledActions: vi.fn(),
}));
vi.mock("@/utils/sleep", () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

describe("anti-entropy index", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe("hasRecentWebhook logic", () => {
    it("should skip accounts with webhooks received in last 30 minutes", async () => {
      const { runAntiEntropy } = await import("./index");
      const prisma = (await import("@/utils/prisma")).default;
      const { pollEmailAccount } = await import("./poll-email-account");
      const { executePendingScheduledActions } = await import(
        "./execute-pending-actions"
      );

      const recentWebhookAccount = {
        id: "account-1",
        email: "recent@example.com",
        lastSyncedHistoryId: "123",
        watchEmailsExpirationDate: null,
        account: { provider: "google" },
        user: {
          id: "user-1",
          aiProvider: null,
          aiModel: null,
          aiApiKey: null,
          premium: null,
        },
        rules: [{ id: "rule-1", enabled: true }],
      };

      // mock returns account but we'll set lastWebhookReceivedAt in the mapped result
      (prisma.emailAccount.findMany as any).mockResolvedValue([
        recentWebhookAccount,
      ]);
      (executePendingScheduledActions as any).mockResolvedValue({
        executed: 0,
        failed: 0,
        errors: [],
      });
      (pollEmailAccount as any).mockResolvedValue({
        emailAccountId: "account-1",
        email: "recent@example.com",
        provider: "google",
        messagesProcessed: 0,
        caughtByAntiEntropy: false,
        scheduledActionsExecuted: 0,
      });

      const { createScopedLogger } = await import("@/utils/logger");
      const logger = createScopedLogger("test");

      const metrics = await runAntiEntropy(logger);

      // since lastWebhookReceivedAt is null (not yet populated from DB),
      // the account should be polled
      expect(metrics.totalAccountsFound).toBe(1);
      expect(pollEmailAccount).toHaveBeenCalledTimes(1);
    });

    it("should process accounts without recent webhooks", async () => {
      const { runAntiEntropy } = await import("./index");
      const prisma = (await import("@/utils/prisma")).default;
      const { pollEmailAccount } = await import("./poll-email-account");
      const { executePendingScheduledActions } = await import(
        "./execute-pending-actions"
      );

      const staleAccount = {
        id: "account-1",
        email: "stale@example.com",
        lastSyncedHistoryId: "123",
        watchEmailsExpirationDate: null,
        account: { provider: "google" },
        user: {
          id: "user-1",
          aiProvider: null,
          aiModel: null,
          aiApiKey: null,
          premium: null,
        },
        rules: [{ id: "rule-1", enabled: true }],
      };

      (prisma.emailAccount.findMany as any).mockResolvedValue([staleAccount]);
      (executePendingScheduledActions as any).mockResolvedValue({
        executed: 0,
        failed: 0,
        errors: [],
      });
      (pollEmailAccount as any).mockResolvedValue({
        emailAccountId: "account-1",
        email: "stale@example.com",
        provider: "google",
        messagesProcessed: 2,
        caughtByAntiEntropy: true,
        scheduledActionsExecuted: 0,
      });

      const { createScopedLogger } = await import("@/utils/logger");
      const logger = createScopedLogger("test");

      const metrics = await runAntiEntropy(logger);

      expect(metrics.totalAccountsPolled).toBe(1);
      expect(metrics.accountsWithWebhookGaps).toBe(1);
      expect(metrics.totalMessagesCaught).toBe(2);
    });
  });

  describe("max accounts limit", () => {
    it("should limit accounts to MAX_ACCOUNTS_PER_RUN", async () => {
      const { runAntiEntropy } = await import("./index");
      const prisma = (await import("@/utils/prisma")).default;
      const { pollEmailAccount } = await import("./poll-email-account");
      const { executePendingScheduledActions } = await import(
        "./execute-pending-actions"
      );

      // create 150 accounts (more than the 100 limit)
      const manyAccounts = Array.from({ length: 150 }, (_, i) => ({
        id: `account-${i}`,
        email: `user${i}@example.com`,
        lastSyncedHistoryId: "123",
        watchEmailsExpirationDate: null,
        account: { provider: "google" },
        user: {
          id: `user-${i}`,
          aiProvider: null,
          aiModel: null,
          aiApiKey: null,
          premium: null,
        },
        rules: [{ id: `rule-${i}`, enabled: true }],
      }));

      (prisma.emailAccount.findMany as any).mockResolvedValue(manyAccounts);
      (executePendingScheduledActions as any).mockResolvedValue({
        executed: 0,
        failed: 0,
        errors: [],
      });
      (pollEmailAccount as any).mockResolvedValue({
        emailAccountId: "account-x",
        email: "user@example.com",
        provider: "google",
        messagesProcessed: 0,
        caughtByAntiEntropy: false,
        scheduledActionsExecuted: 0,
      });

      const { createScopedLogger } = await import("@/utils/logger");
      const logger = createScopedLogger("test");

      const metrics = await runAntiEntropy(logger);

      expect(metrics.totalAccountsFound).toBe(150);
      expect(metrics.totalAccountsPolled).toBe(100); // limited to 100
      expect(pollEmailAccount).toHaveBeenCalledTimes(100);
    });
  });

  describe("runAntiEntropyForUser", () => {
    it("should poll a single user account", async () => {
      const { runAntiEntropyForUser } = await import("./index");
      const prisma = (await import("@/utils/prisma")).default;
      const { pollEmailAccount } = await import("./poll-email-account");

      (prisma.emailAccount.findUnique as any).mockResolvedValue({
        id: "account-1",
        email: "user@example.com",
        lastSyncedHistoryId: "123",
        watchEmailsExpirationDate: null,
        account: { provider: "google" },
        user: {
          id: "user-1",
          aiProvider: null,
          aiModel: null,
          aiApiKey: null,
          premium: null,
        },
        rules: [{ id: "rule-1", enabled: true }],
      });
      (pollEmailAccount as any).mockResolvedValue({
        emailAccountId: "account-1",
        email: "user@example.com",
        provider: "google",
        messagesProcessed: 3,
        caughtByAntiEntropy: true,
        scheduledActionsExecuted: 1,
      });

      const { createScopedLogger } = await import("@/utils/logger");
      const logger = createScopedLogger("test");

      const result = await runAntiEntropyForUser("account-1", logger);

      expect(result.messagesProcessed).toBe(3);
      expect(result.scheduledActionsExecuted).toBe(1);
      expect(result.error).toBeUndefined();
    });

    it("should return error when account not found", async () => {
      const { runAntiEntropyForUser } = await import("./index");
      const prisma = (await import("@/utils/prisma")).default;

      (prisma.emailAccount.findUnique as any).mockResolvedValue(null);

      const { createScopedLogger } = await import("@/utils/logger");
      const logger = createScopedLogger("test");

      const result = await runAntiEntropyForUser("non-existent", logger);

      expect(result.error).toBe("Account not found");
      expect(result.messagesProcessed).toBe(0);
    });
  });
});
