export const runtime = "nodejs";

import demoService from "../../../src/server/demoService";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const flow = searchParams.get("flow");
    const result = await demoService.issueChallenge(flow);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}
