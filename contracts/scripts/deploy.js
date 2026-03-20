const fs = require("node:fs");
const path = require("node:path");
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const Registry = await hre.ethers.getContractFactory("U2SSORegistry");
  const registry = await Registry.deploy();

  await registry.waitForDeployment();

  const address = await registry.getAddress();
  const artifact = await hre.artifacts.readArtifact("U2SSORegistry");
  const outputDir = path.join(__dirname, "..", "deployments");
  const outputPath = path.join(outputDir, `${hre.network.name}.json`);
  const payload = {
    abi: artifact.abi,
    address,
    deployer: deployer.address,
    network: hre.network.name
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));

  // Keep the demo consumers aligned on a single local deployment artifact path.
  if (hre.network.name === "localhost") {
    const hardhatAliasPath = path.join(outputDir, "hardhat.json");
    fs.writeFileSync(
      hardhatAliasPath,
      JSON.stringify(
        {
          ...payload,
          network: "hardhat"
        },
        null,
        2
      )
    );
  }

  console.log(`U2SSORegistry deployed to ${address}`);
  console.log(`Deployment artifact written to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
