export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  return Response.json(
    { error: "Report re-analysis has been removed. Create a new audit to generate new findings." },
    { status: 410 },
  );
}
