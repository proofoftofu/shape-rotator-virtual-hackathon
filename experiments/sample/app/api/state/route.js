const { getDebugState } = require("../../../src/server/demoService");

exports.GET = async function GET() {
  return Response.json(getDebugState());
};
