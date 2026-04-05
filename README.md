# Deal OTC Automation Infrastructure

**The Bloomberg Terminal for Institutional Crypto OTC.**

Deal OTC provides the institutional-grade infrastructure that exchanges, family offices, and corporate treasuries need to transact safely at scale. This repository contains the automated onboarding portal, compliance RAG engine, and SDK.

## 🚀 The Vision: Turning Weeks into Days
Institutional onboarding traditionally takes 2-4 weeks of back-and-forth emails, PDF shuffling, and manual compliance checks. 

**Our automated flow reduces this to 48 hours:**
1. **Client Submission:** Client uploads Mandate, Proof of Funds, and UBO Registry via the Terminal or Telegram Bot.
2. **AI Clause Extraction:** The Contract Extractor instantly parses jurisdictions, capital amounts, and red flags.
3. **RAG Compliance Check:** The system compares the extracted data against local laws (Dubai, Singapore, Zurich) using a deterministic vector database.
4. **Automated CRM:** The client's OTC Readiness Score updates dynamically. Deal OTC Admins get a 1-page "Program of Operations" report instantly.

## 📦 Repository Structure
* `/frontend` - The sleek, Bloomberg-inspired Web Terminal.
* `/backend` - The Node.js Express server containing the Journey Kits (RAG + Clause Extractor + Employee CRM adapted for OTC).
* `/sdk` - The `@defimessiah/dealotc-sdk` Node package for enterprise integrations.

## 💻 Live Demo
* **Terminal UI:** [https://deal-otc-automation.vercel.app](https://deal-otc-automation.vercel.app)

## 🔌 SDK Usage
Enterprise clients can automate their own Walled-Garden verification natively:

```bash
npm install @defimessiah/dealotc-sdk
```

```javascript
const { DealOTC } = require('@defimessiah/dealotc-sdk');
const dealotc = new DealOTC({ apiKey: 'sk_live_...' });

// Upload Proof of Funds for instant AI parsing
const parseResult = await dealotc.compliance.parseDocument(
    "123_APEX_FAMILY_OFFICE", 
    'proof_of_funds', 
    pdfBuffer
);

console.log(parseResult.analysis);
// -> { approved: true, extractedCapital: "$15,000,000 USD", redFlags: [] }
```

## 🛡️ Trust Architecture
3-tier Walled Garden verification eliminates counterparty risk. We act as your deal agent — no inventory risk, no conflict of interest.