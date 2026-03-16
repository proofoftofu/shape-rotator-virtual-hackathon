import demoService from "../../../src/server/demoService";

export async function GET() {
  return Response.json(demoService.getDebugState());
}
