import { getRun } from "@/lib/run-store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const run = getRun(runId);
  if (!run) {
    return Response.json({ error: "Workflow run not found." }, { status: 404 });
  }

  return Response.json(run, {
    headers: { "Cache-Control": "no-store" },
  });
}
