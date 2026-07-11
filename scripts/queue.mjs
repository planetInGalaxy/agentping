#!/usr/bin/env node
import { clearFailedEvents, launchQueueWorker, queueStatus, requeueFailedEvents } from "../plugins/agentping/scripts/event-queue.mjs";

const command = process.argv[2] || "status";
if (command === "status") {
  console.log(JSON.stringify(queueStatus(), null, 2));
} else if (command === "retry") {
  const count = requeueFailedEvents();
  if (count > 0) launchQueueWorker();
  console.log(`Requeued ${count} failed event(s).`);
} else if (command === "clear-failed") {
  console.log(`Cleared ${clearFailedEvents()} failed event(s).`);
} else {
  console.error("Usage: agentping queue [status|retry|clear-failed]");
  process.exit(2);
}
