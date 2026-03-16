const { createDemoExtensionPayload } = require("../../../../src/server/demoService");

exports.POST = async function POST(request) {
  try {
    const body = await request.json();
    const result = await createDemoExtensionPayload("login", body.challenge, body.serviceName);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
};
