import type { WebhookDiagnostic } from "./types";
import type { Logger } from "@/utils/logger";
import { formatDistanceToNow } from "date-fns";

const GOOGLE_SUGGESTIONS = [
  "Check GOOGLE_PUBSUB_VERIFICATION_TOKEN is set correctly",
  "Verify PubSub subscription is active in GCP console",
  "Ensure webhook URL is accessible from GCP (not behind firewall)",
  "Check GOOGLE_PUBSUB_TOPIC_NAME matches your GCP configuration",
  "Run /api/watch/all to refresh the watch subscription",
];

const OUTLOOK_SUGGESTIONS = [
  "Check MICROSOFT_WEBHOOK_CLIENT_STATE is set correctly",
  "Subscription expires every 3 days - verify renewal cron is running",
  "Confirm Microsoft Graph can reach webhook URL (publicly accessible)",
  "Run /api/outlook/watch/all to refresh the subscription",
  "Verify MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET are valid",
];

export function generateWebhookDiagnostics(
  provider: "google" | "microsoft",
  accountEmail: string,
  missedMessageCount: number,
  lastWebhookReceivedAt: Date | null,
): WebhookDiagnostic {
  const timeSinceLastWebhook = lastWebhookReceivedAt
    ? Date.now() - lastWebhookReceivedAt.getTime()
    : null;

  const suggestedFixes =
    provider === "google" ? GOOGLE_SUGGESTIONS : OUTLOOK_SUGGESTIONS;

  return {
    provider,
    accountEmail,
    missedMessageCount,
    timeSinceLastWebhook,
    suggestedFixes,
  };
}

export function logAntiEntropyFindings(
  diagnostic: WebhookDiagnostic,
  logger: Logger,
): void {
  const timeSinceStr = diagnostic.timeSinceLastWebhook
    ? formatDistanceToNow(Date.now() - diagnostic.timeSinceLastWebhook, {
        addSuffix: true,
      })
    : "never";

  logger.warn(
    "Anti-entropy caught missed emails - webhook may be misconfigured",
    {
      provider: diagnostic.provider,
      email: diagnostic.accountEmail,
      missedCount: diagnostic.missedMessageCount,
      lastWebhook: timeSinceStr,
      suggestions: diagnostic.suggestedFixes.slice(0, 3),
    },
  );
}

export function formatTimeSinceWebhook(
  lastWebhookReceivedAt: Date | null,
): string {
  if (!lastWebhookReceivedAt) {
    return "never";
  }
  return formatDistanceToNow(lastWebhookReceivedAt, { addSuffix: true });
}
