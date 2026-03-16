import demoService from "../../../src/server/demoService";

export async function POST(request) {
  try {
    const body = await request.json();
    const result = await demoService.registerAccount(body);
    return Response.json({
      account: result,
      ok: true
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}
