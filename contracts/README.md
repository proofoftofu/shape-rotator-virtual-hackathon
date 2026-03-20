# U2SSO Contracts

This package contains the demoable Hardhat implementation of the U2SSO master identity registry.

Primary reference:

- `forks/U2SSO/proof-of-concept/u2ssoContract/contracts/U2SSO.sol`

## What It Does

- registers master identities as append-only records
- stores an `active` flag per identity
- exposes fork-compatible getters:
  - `addID`
  - `revokeID`
  - `getIDs`
  - `getState`
  - `getIDSize`
  - `getIDIndex`
- adds `getActiveIDs` for the sample verifier
- stores the registering address as the identity owner

## Install

```bash
npm install
```

## Commands

```bash
npm run compile
npm test
npm run deploy:local
```

To run against a local Hardhat chain:

```bash
npm run node
```

## Output

The deploy script writes a deployment artifact to:

- `deployments/<network>.json`

That file includes:

- contract address
- ABI
- deployer address
- network name

## Assumptions

- The backend and extension only need master identity registration and active identity lookup for MVP.
- Child public keys, nullifiers, and sessions stay off-chain.
- Duplicate identity registration is rejected to keep the registry simple for the sample verifier.
