import demoService from "../../../../src/server/demoService";

export async function POST(request) {
  try {
    const body = await request.json();
    const result = await demoService.createDemoExtensionPayload("signup", body.challenge, body.serviceName);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}
