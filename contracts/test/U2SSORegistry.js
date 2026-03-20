const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("U2SSORegistry", function () {
  async function deployRegistry() {
    const [owner, alice, bob] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("U2SSORegistry");
    const registry = await Registry.deploy();
    await registry.waitForDeployment();

    return { registry, owner, alice, bob };
  }

  it("registers identities and exposes fork-compatible getters", async function () {
    const { registry, alice } = await deployRegistry();

    await expect(registry.connect(alice).addID(111n, 222n, 333n))
      .to.emit(registry, "IdentityRegistered")
      .withArgs(0n, 111n, 222n, alice.address);

    expect(await registry.getIDSize()).to.equal(1n);
    expect(await registry.getIDIndex(111n, 222n)).to.equal(0n);
    expect(await registry.getIDs(0)).to.deep.equal([111n, 222n]);
    expect(await registry.getState(0)).to.equal(true);
    expect((await registry.getIdentity(0)).commitment).to.equal(333n);
  });

  it("returns active identities only", async function () {
    const { registry, alice, bob } = await deployRegistry();

    await registry.connect(alice).addID(111n, 222n, 333n);
    await registry.connect(bob).addID(333n, 444n, 555n);
    await registry.connect(alice).revokeID(0);

    const [ids, id33s] = await registry.getActiveIDs();

    expect(ids).to.deep.equal([333n]);
    expect(id33s).to.deep.equal([444n]);
  });

  it("stores the registering address as the identity owner and allows owner revoke", async function () {
    const { registry, alice } = await deployRegistry();

    await registry.connect(alice).addID(111n, 222n, 333n);
    const identity = await registry.getIdentity(0);

    expect(identity.recordOwner).to.equal(alice.address);
    expect(identity.active).to.equal(true);
    expect(identity.commitment).to.equal(333n);

    await expect(registry.connect(alice).revokeID(0))
      .to.emit(registry, "IdentityRevoked")
      .withArgs(0n, alice.address);

    expect(await registry.getState(0)).to.equal(false);
  });

  it("allows contract owner to revoke an identity", async function () {
    const { registry, owner, alice } = await deployRegistry();

    await registry.connect(alice).addID(111n, 222n, 333n);

    await expect(registry.connect(owner).revokeID(0))
      .to.emit(registry, "IdentityRevoked")
      .withArgs(0n, owner.address);

    expect(await registry.getState(0)).to.equal(false);
  });

  it("rejects duplicate identity registration", async function () {
    const { registry, alice } = await deployRegistry();

    await registry.connect(alice).addID(111n, 222n, 333n);
    await expect(registry.connect(alice).addID(111n, 222n, 333n))
      .to.be.revertedWithCustomError(registry, "IdentityAlreadyRegistered");
  });

  it("rejects revoke by unrelated caller", async function () {
    const { registry, alice, bob } = await deployRegistry();

    await registry.connect(alice).addID(111n, 222n, 333n);
    await expect(registry.connect(bob).revokeID(0))
      .to.be.revertedWithCustomError(registry, "NotIdentityOwner");
  });
});
