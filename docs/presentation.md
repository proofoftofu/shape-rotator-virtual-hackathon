---
marp: true
title: U2SSO Pass
theme: default
paginate: true
---

# U2SSO Pass
### Chrome-extension-based identity demo inspired by Anonymous Self-Credentials & SSO

---

# What It Is

U2SSO Pass is a practical identity demo built on the sample U2SSO flow.

It is designed to make the protocol easier to try and understand in a product-like experience.

---

# What’s Included

- Contract registry for master identity registration
- Chrome extension for generating identity-related payloads
- Authentication pages for sign up and sign in

---

# How It Works

1. A user creates a **master identity**
2. The master identity is **registered on-chain**
3. A **child credential** is created for each service
4. A **zero-knowledge proof** connects the child credential to the master identity
5. The user can authenticate **anonymously**

---

# Sybil Protection

- A **nullifier** is derived from the service and the master identity
- The nullifier is service-specific
- This prevents repeated use of the same identity for the same service
- The result is privacy-preserving authentication with Sybil resistance

---

# Why It Matters

U2SSO Pass shows how anonymous self-credentials can become usable for real users:

- privacy is preserved
- each service gets a separate credential
- duplicate abuse is prevented
- the experience stays close to normal sign up and sign in

