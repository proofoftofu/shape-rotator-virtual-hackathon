const { registerAccount } = require("../../../src/server/demoService");

exports.POST = async function POST(request) {
  try {
    const body = await request.json();
    const result = await registerAccount(body);
    return Response.json({
      account: result,
      ok: true
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
};
