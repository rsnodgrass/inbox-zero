import { NextResponse } from "next/server";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { withError } from "@/utils/middleware";
import { runAntiEntropy } from "@/utils/anti-entropy";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export const GET = withError("anti-entropy/poll", async (request) => {
  if (!hasCronSecret(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  return runAntiEntropyEndpoint(request.logger);
});

export const POST = withError("anti-entropy/poll", async (request) => {
  if (!(await hasPostCronSecret(request))) {
    return new Response("Unauthorized", { status: 401 });
  }

  return runAntiEntropyEndpoint(request.logger);
});

async function runAntiEntropyEndpoint(logger: Logger) {
  if (!env.ANTI_ENTROPY_ENABLED) {
    logger.info("Anti-entropy is disabled");
    return NextResponse.json({
      success: true,
      disabled: true,
      message: "Anti-entropy is disabled via ANTI_ENTROPY_ENABLED env var",
    });
  }

  try {
    const metrics = await runAntiEntropy(logger);

    return NextResponse.json({
      success: true,
      metrics,
    });
  } catch (error) {
    logger.error("Anti-entropy poll failed", { error });
    throw error;
  }
}
