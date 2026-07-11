import { enqueueCompletionEvent, launchQueueWorker } from "./event-queue.mjs";
import { drainCompletionQueue } from "./queue-worker.mjs";

export async function submitCompletionEvent(input) {
  const queued = enqueueCompletionEvent(input);
  if (process.env.AGENTPING_QUEUE_SYNC === "1") {
    await drainCompletionQueue();
  } else {
    launchQueueWorker();
  }
  return queued.event;
}
