# @dealotc/sdk

The official Node.js SDK for **Deal OTC** — The Bloomberg Terminal for Institutional Crypto OTC. 

Automate your institutional onboarding, eliminate counterparty risk, and integrate the 3-Tier Walled Garden verification directly into your own applications.

## Installation
```bash
npm install @dealotc/sdk
```

## Quick Start
Initialize the SDK and automate a client's onboarding flow, from creation to document parsing and report generation.

```javascript
const { DealOTC } = require('@dealotc/sdk');

// Initialize the client
const dealotc = new DealOTC({ 
    apiKey: 'sk_live_...', 
    environment: 'production' 
});

async function onboardClient() {
    // 1. Create a new Institutional Client
    const client = await dealotc.client.create({
        name: "Apex Family Office",
        jurisdiction: "Dubai"
    });
    console.log("Client created:", client.clientId);

    // 2. Upload and Parse Compliance Documents (Mandate, PoF, UBO)
    // The SDK automatically extracts clauses, checks for red flags, and updates the Readiness Score.
    const mandateDoc = Buffer.from('...'); // Your PDF buffer
    const parseResult = await dealotc.compliance.parseDocument(
        client.clientId, 
        'mandate_letter', 
        mandateDoc
    );
    console.log("Compliance Analysis:", parseResult.analysis);

    // 3. Generate the Executive 'Program of Operations'
    const report = await dealotc.reports.generateProgramOfOperations(client.clientId);
    console.log("Final Report generated. Client Status:", report.status);
}

onboardClient();
```

## Architecture
This SDK wraps the Deal OTC infrastructure, specifically designed to abstract the complexities of manual KYC/KYB, mandate representation tracking, and compliance scoring. It relies on advanced deterministic RAG pipelines and contract clause extraction under the hood.

**Trust Architecture:** Walled Garden  
**Network Reach:** Dubai, Singapore, Zurich, Lagos  

## License
MIT