import demoService from "../../../src/server/demoService";

export async function POST(request) {
  try {
    const body = await request.json();
    console.log("[u2sso-sample][route] POST /api/login received", {
      challengeId: body.challengeId,
      serviceName: body.serviceName,
      username: body.username
    });
    const result = await demoService.loginAccount(body);
    console.log("[u2sso-sample][route] POST /api/login success", {
      username: result.username,
      sessionToken: result.sessionToken
    });
    return Response.json({
      ok: true,
      session: result
    });
  } catch (error) {
    console.error("[u2sso-sample][route] POST /api/login failed", error);
    return Response.json({ error: error.message }, { status: 400 });
  }
}
