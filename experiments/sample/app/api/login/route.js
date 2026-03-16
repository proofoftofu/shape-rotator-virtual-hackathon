import demoService from "../../../src/server/demoService";

export async function POST(request) {
  try {
    const body = await request.json();
    const result = await demoService.loginAccount(body);
    return Response.json({
      ok: true,
      session: result
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}
