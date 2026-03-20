export const runtime = "nodejs";

import contractClient from "../../../src/server/contractClient";

function normalizeMasterIdentity(body) {
  const masterIdentity = body?.masterIdentity || body;
  const publicKey = masterIdentity?.publicKey;
  const commitment = masterIdentity?.commitment;

  if (!Array.isArray(publicKey) || publicKey.length < 2) {
    throw new Error("Missing masterIdentity.publicKey");
  }

  if (commitment === undefined || commitment === null) {
    throw new Error("Missing masterIdentity.commitment");
  }

  return {
    commitment: BigInt(commitment),
    publicKey: [BigInt(publicKey[0]), BigInt(publicKey[1])]
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const id33 = searchParams.get("id33");

    if (!id || !id33) {
      const identities = await contractClient.getActiveIdentities();
      return Response.json({
        ok: true,
        identities
      });
    }

    const result = await contractClient.getMasterIdentityRegistration({
      publicKey: [BigInt(id), BigInt(id33)]
    });

    return Response.json({
      ok: true,
      registration: result
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const masterIdentity = normalizeMasterIdentity(body);
    const result = await contractClient.registerMasterIdentity(masterIdentity);

    return Response.json({
      ok: true,
      registration: result
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}
