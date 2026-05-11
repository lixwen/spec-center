import { getMongoCollections } from "@spec-center/core";
import { getAuthenticatedUserForRequest } from "../../../../../lib/session";

const POLL_INTERVAL_MS = 500;
const MAX_IDLE_MS = 300_000; // 5 min max idle before closing

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const user = await getAuthenticatedUserForRequest(request);
  if (!user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const { taskId } = await params;
  const afterParam = new URL(request.url).searchParams.get("after");
  let cursor = afterParam ? parseInt(afterParam, 10) || 0 : 0;

  const collections = await getMongoCollections();
  const task = await collections.agentTasks.findOne({ _id: taskId });
  if (!task || task.user_id !== user._id) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        let idleStart = Date.now();

        while (!request.signal.aborted) {
          const doc = await collections.agentTasks.findOne(
            { _id: taskId },
            { projection: { events: 1, status: 1, error: 1 } }
          );
          if (!doc) break;

          const newEvents = (doc.events ?? []).filter((e) => e.seq > cursor);

          if (newEvents.length > 0) {
            idleStart = Date.now();
            for (const evt of newEvents) {
              send({ ...evt.data, type: evt.type, seq: evt.seq });
              cursor = evt.seq;
            }
          }

          if (doc.status === "done" || doc.status === "error") {
            if (newEvents.length === 0) {
              if (doc.status === "error") {
                send({ type: "error", content: doc.error ?? "Unknown error" });
              }
              send({ type: "stream_end", status: doc.status });
            }
            break;
          }

          if (Date.now() - idleStart > MAX_IDLE_MS) {
            send({ type: "stream_end", status: "timeout" });
            break;
          }

          await sleep(POLL_INTERVAL_MS);
        }
      } catch (err) {
        try {
          const msg = err instanceof Error ? err.message : "Unknown error";
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", content: msg })}\n\n`));
        } catch { /* controller may be closed */ }
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}
