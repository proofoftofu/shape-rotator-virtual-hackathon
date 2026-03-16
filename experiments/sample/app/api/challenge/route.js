const { issueChallenge } = require("../../../src/server/demoService");

exports.GET = async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const flow = searchParams.get("flow");
    const result = await issueChallenge(flow);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
};
