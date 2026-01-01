import { describe, it, expect, vi, beforeEach } from "vitest";
import { ScheduledActionStatus, ActionType } from "@/generated/prisma/enums";
import { executePendingScheduledActions } from "./execute-pending-actions";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";

// Run with: cd apps/web && pnpm vitest run utils/anti-entropy/execute-pending-actions.test.ts

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn().mockResolvedValue({
    getMessage: vi.fn().mockResolvedValue({
      id: "msg-123",
      threadId: "thread-123",
      headers: {},
      textPlain: "test",
      textHtml: "<p>test</p>",
      attachments: [],
      internalDate: "1234567890",
      snippet: "",
      historyId: "",
      inline: [],
      isReplyInThread: false,
      subject: "Test",
      date: "2024-01-01T00:00:00Z",
    }),
  }),
}));
vi.mock("@/utils/scheduled-actions/executor", () => ({
  executeScheduledAction: vi.fn(),
}));

const logger = createScopedLogger("test");

describe("execute-pending-actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("executePendingScheduledActions", () => {
    it("should return empty result when no pending actions", async () => {
      prisma.scheduledAction.findMany.mockResolvedValue([]);

      const result = await executePendingScheduledActions(logger);

      expect(result.executed).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it("should execute pending actions with FAILED scheduling status", async () => {
      const mockAction = {
        id: "action-1",
        actionType: ActionType.ARCHIVE,
        emailAccountId: "account-1",
        messageId: "msg-1",
        threadId: "thread-1",
        scheduledFor: new Date(),
        status: ScheduledActionStatus.PENDING,
        schedulingStatus: "FAILED",
        emailAccount: {
          account: { provider: "google" },
        },
      };

      prisma.scheduledAction.findMany.mockResolvedValue([mockAction] as any);

      const { executeScheduledAction } = await import(
        "@/utils/scheduled-actions/executor"
      );
      (executeScheduledAction as any).mockResolvedValue({
        success: true,
        executedActionId: "executed-1",
      });

      const result = await executePendingScheduledActions(logger);

      expect(result.executed).toBe(1);
      expect(result.failed).toBe(0);
      expect(executeScheduledAction).toHaveBeenCalledTimes(1);
    });

    it("should handle execution failures gracefully", async () => {
      const mockAction = {
        id: "action-1",
        actionType: ActionType.ARCHIVE,
        emailAccountId: "account-1",
        messageId: "msg-1",
        threadId: "thread-1",
        scheduledFor: new Date(),
        status: ScheduledActionStatus.PENDING,
        schedulingStatus: "FAILED",
        emailAccount: {
          account: { provider: "google" },
        },
      };

      prisma.scheduledAction.findMany.mockResolvedValue([mockAction] as any);

      const { executeScheduledAction } = await import(
        "@/utils/scheduled-actions/executor"
      );
      (executeScheduledAction as any).mockResolvedValue({
        success: false,
        error: "Action failed",
      });

      const result = await executePendingScheduledActions(logger);

      expect(result.executed).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("action-1");
    });

    it("should handle thrown errors during execution", async () => {
      const mockAction = {
        id: "action-1",
        actionType: ActionType.ARCHIVE,
        emailAccountId: "account-1",
        messageId: "msg-1",
        threadId: "thread-1",
        scheduledFor: new Date(),
        status: ScheduledActionStatus.PENDING,
        schedulingStatus: "FAILED",
        emailAccount: {
          account: { provider: "google" },
        },
      };

      prisma.scheduledAction.findMany.mockResolvedValue([mockAction] as any);

      const { executeScheduledAction } = await import(
        "@/utils/scheduled-actions/executor"
      );
      (executeScheduledAction as any).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const result = await executePendingScheduledActions(logger);

      expect(result.executed).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toContain("Unexpected error");
    });

    it("should process multiple actions", async () => {
      const mockActions = [
        {
          id: "action-1",
          actionType: ActionType.ARCHIVE,
          emailAccountId: "account-1",
          messageId: "msg-1",
          threadId: "thread-1",
          scheduledFor: new Date(),
          status: ScheduledActionStatus.PENDING,
          schedulingStatus: "FAILED",
          emailAccount: { account: { provider: "google" } },
        },
        {
          id: "action-2",
          actionType: ActionType.LABEL,
          emailAccountId: "account-2",
          messageId: "msg-2",
          threadId: "thread-2",
          scheduledFor: new Date(),
          status: ScheduledActionStatus.PENDING,
          schedulingStatus: "FAILED",
          emailAccount: { account: { provider: "microsoft" } },
        },
      ];

      prisma.scheduledAction.findMany.mockResolvedValue(mockActions as any);

      const { executeScheduledAction } = await import(
        "@/utils/scheduled-actions/executor"
      );
      (executeScheduledAction as any)
        .mockResolvedValueOnce({ success: true, executedActionId: "exec-1" })
        .mockResolvedValueOnce({ success: true, executedActionId: "exec-2" });

      const result = await executePendingScheduledActions(logger);

      expect(result.executed).toBe(2);
      expect(result.failed).toBe(0);
    });

    it("should default to google provider when account provider is null", async () => {
      const mockAction = {
        id: "action-1",
        actionType: ActionType.ARCHIVE,
        emailAccountId: "account-1",
        messageId: "msg-1",
        threadId: "thread-1",
        scheduledFor: new Date(),
        status: ScheduledActionStatus.PENDING,
        schedulingStatus: "FAILED",
        emailAccount: {
          account: { provider: null },
        },
      };

      prisma.scheduledAction.findMany.mockResolvedValue([mockAction] as any);

      const { executeScheduledAction } = await import(
        "@/utils/scheduled-actions/executor"
      );
      const { createEmailProvider } = await import("@/utils/email/provider");
      (executeScheduledAction as any).mockResolvedValue({ success: true });

      await executePendingScheduledActions(logger);

      expect(createEmailProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "google",
        }),
      );
    });
  });
});
