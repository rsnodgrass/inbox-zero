import { ScheduledActionStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { executeScheduledAction } from "@/utils/scheduled-actions/executor";
import { createEmailProvider } from "@/utils/email/provider";
import type { Logger } from "@/utils/logger";
import { subMinutes } from "date-fns";

const GRACE_PERIOD_MINUTES = 5;
const BATCH_SIZE = 50;

interface ExecutePendingResult {
  executed: number;
  failed: number;
  errors: string[];
}

export async function executePendingScheduledActions(
  logger: Logger,
): Promise<ExecutePendingResult> {
  const log = logger.with({ module: "anti-entropy-execute" });

  const result: ExecutePendingResult = {
    executed: 0,
    failed: 0,
    errors: [],
  };

  const now = new Date();
  const gracePeriodCutoff = subMinutes(now, GRACE_PERIOD_MINUTES);

  const pendingActions = await prisma.scheduledAction.findMany({
    where: {
      status: ScheduledActionStatus.PENDING,
      OR: [
        { schedulingStatus: "FAILED" },
        {
          scheduledFor: { lte: gracePeriodCutoff },
          schedulingStatus: { not: "SCHEDULED" },
        },
      ],
    },
    include: {
      emailAccount: {
        include: {
          account: true,
        },
      },
    },
    take: BATCH_SIZE,
    orderBy: { scheduledFor: "asc" },
  });

  if (pendingActions.length === 0) {
    log.info("No pending scheduled actions to execute");
    return result;
  }

  log.info("Found pending scheduled actions", {
    count: pendingActions.length,
  });

  for (const action of pendingActions) {
    const actionLog = log.with({
      scheduledActionId: action.id,
      emailAccountId: action.emailAccountId,
      actionType: action.actionType,
    });

    try {
      const accountProvider =
        action.emailAccount?.account?.provider || "google";

      const provider = await createEmailProvider({
        emailAccountId: action.emailAccountId,
        provider: accountProvider,
        logger: actionLog,
      });

      const execResult = await executeScheduledAction(
        action,
        provider,
        actionLog,
      );

      if (execResult.success) {
        result.executed++;
        actionLog.info("Executed scheduled action via anti-entropy", {
          executedActionId: execResult.executedActionId,
        });
      } else {
        result.failed++;
        result.errors.push(
          `Failed to execute action ${action.id}: ${String(execResult.error)}`,
        );
      }
    } catch (error) {
      actionLog.error("Error executing scheduled action", { error });
      result.failed++;
      result.errors.push(
        `Error executing action ${action.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  log.info("Completed executing pending scheduled actions", {
    executed: result.executed,
    failed: result.failed,
  });

  return result;
}
