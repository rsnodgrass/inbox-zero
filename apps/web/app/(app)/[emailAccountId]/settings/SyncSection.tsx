"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { FormSection, FormSectionLeft } from "@/components/Form";
import { toastSuccess, toastError } from "@/components/Toast";
import { RefreshCwIcon } from "lucide-react";
import type { SyncResponse } from "@/app/api/user/sync/route";

export function SyncSection() {
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResponse | null>(null);

  const handleSync = useCallback(async () => {
    setIsLoading(true);
    setLastResult(null);

    try {
      const response = await fetch("/api/user/sync", {
        method: "POST",
      });

      const result: SyncResponse = await response.json();
      setLastResult(result);

      if (result.success) {
        if (result.messagesProcessed > 0) {
          toastSuccess({
            description: `Synced ${result.messagesProcessed} new email${result.messagesProcessed === 1 ? "" : "s"}`,
          });
        } else {
          toastSuccess({
            description: "All caught up - no new emails to process",
          });
        }
      } else {
        toastError({
          title: "Sync failed",
          description: result.error || "Unknown error",
        });
      }
    } catch (error) {
      toastError({
        title: "Sync failed",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <FormSection>
      <FormSectionLeft
        title="Email Sync"
        description="Manually sync your inbox to catch any missed emails. This is useful if webhooks are not configured or if you want to ensure all emails are processed."
      />

      <div className="flex flex-col gap-3">
        <Button
          onClick={handleSync}
          disabled={isLoading}
          variant="outline"
          className="w-fit"
        >
          <RefreshCwIcon
            className={`mr-2 size-4 ${isLoading ? "animate-spin" : ""}`}
          />
          {isLoading ? "Syncing..." : "Sync Now"}
        </Button>
        {lastResult && (
          <p className="text-sm text-muted-foreground">
            {lastResult.success
              ? lastResult.messagesProcessed > 0
                ? `Processed ${lastResult.messagesProcessed} email${lastResult.messagesProcessed === 1 ? "" : "s"}`
                : "All caught up"
              : `Error: ${lastResult.error}`}
          </p>
        )}
      </div>
    </FormSection>
  );
}
