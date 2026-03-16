export const runtime = "nodejs";

import demoService from "../../../src/server/demoService";

export async function POST(request) {
  try {
    const body = await request.json();
    console.log("[u2sso-sample][route] POST /api/signup received", {
      challengeId: body.challengeId,
      serviceName: body.serviceName,
      spkPublicKey: body.registrationPayload?.spkPublicKey
    });
    const result = await demoService.registerAccount(body);
    console.log("[u2sso-sample][route] POST /api/signup success", {
      spkPublicKey: result.spkPublicKey
    });
    return Response.json({
      account: result,
      ok: true
    });
  } catch (error) {
    console.error("[u2sso-sample][route] POST /api/signup failed", error);
    return Response.json({ error: error.message }, { status: 400 });
  }
}
