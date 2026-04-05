require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Spectrum } = require('@agenthub/spectrum');
const { GoogleGenerativeAI } = require('@google/genai');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Gemini
const ai = new GoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY || "dummy" });
const model = ai.getGenerativeModel({ model: "gemini-3-pro-preview" });

// Mock In-Memory CRM Database (Adapted from employee-onboarding-automator)
const crmDb = {
    clients: {
        "client_123": {
            id: "client_123",
            name: "Apex Family Office",
            jurisdiction: "Dubai",
            status: "In Progress",
            score: 0,
            documents: {
                mandate_letter: false,
                proof_of_funds: false,
                ubo_registry: false
            },
            notes: []
        }
    }
};

// ----------------------------------------------------
// 1. TELEGRAM / SPECTRUM BOT INTEGRATION
// ----------------------------------------------------
const bot = new Spectrum({
    platforms: ['telegram', 'web'],
    wallet: process.env.CDP_WALLET_DATA
});

bot.onMessage(async (message) => {
    console.log(`[Deal OTC Bot] Received message: ${message.text}`);
    
    const text = message.text.toLowerCase();

    if (text.includes('status') || text.includes('readiness')) {
        const client = crmDb.clients["client_123"];
        await message.reply(`📊 *Deal OTC Status: ${client.name}*\nStatus: ${client.status}\nOTC Approval Score: ${client.score}/100\n\nMissing Docs:\n- Mandate Letter: ${client.documents.mandate_letter ? '✅' : '❌'}\n- Proof of Funds: ${client.documents.proof_of_funds ? '✅' : '❌'}\n- UBO Registry: ${client.documents.ubo_registry ? '✅' : '❌'}`);
    } 
    else if (text.includes('upload') || text.includes('document')) {
        await message.reply(`Please upload your PDF documents to the secure portal at https://dealotc.com/onboarding or attach them here for instant parsing.`);
    }
    else if (text.includes('rule') || text.includes('compliance')) {
        // Mocking the RAG Knowledge Base Retrieval
        await message.reply(`⚖️ *Compliance RAG Engine:*\nAccording to the Deal OTC Dubai 3-Tier Walled Garden guidelines, all family offices must provide a clear UBO registry not older than 3 months, and proof of funds exceeding $10M USD in a Tier-1 bank.`);
    }
    else {
        await message.reply(`Welcome to Deal OTC Support. I am your Institutional Deal Agent. \n\nYou can ask me for your 'status', upload a 'document', or query our 'compliance' engine.`);
    }
});
bot.start();

// ----------------------------------------------------
// 2. WEB DASHBOARD API (DOCUMENT EXTRACTION & RAG)
// ----------------------------------------------------

// Evaluate Document (using contract-clause-extractor logic)
app.post('/api/evaluate-document', async (req, res) => {
    const { clientId, documentType, documentText } = req.body;
    const client = crmDb.clients[clientId] || crmDb.clients["client_123"];
    
    // Process text via Gemini using Contract Clause Extractor Prompt
    try {
        const prompt = `You are a strict OTC Compliance Officer evaluating a ${documentType}.
        Extract key clauses: UBOs, Jurisdiction, Capital Amounts, and any Red Flags.
        Output MUST be a JSON object with: 
        { "approved": boolean, "extractedCapital": number, "redFlags": ["..."], "summary": "..." }
        
        Document Text: ${documentText.substring(0, 5000)}`;

        const result = await model.generateContent(prompt);
        let extraction = result.response.text().replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
        const parsed = JSON.parse(extraction);

        // Update CRM
        if (documentType === 'proof_of_funds') client.documents.proof_of_funds = true;
        if (documentType === 'mandate_letter') client.documents.mandate_letter = true;
        if (documentType === 'ubo_registry') client.documents.ubo_registry = true;

        // Recalculate score
        client.score += parsed.approved ? 33 : 0;
        if (client.score > 90) client.status = "Approved - Ready to Trade";

        res.json({
            success: true,
            clientState: client,
            analysis: parsed
        });

    } catch (e) {
        console.error(e);
        // Fallback for demo
        res.json({
            success: true,
            clientState: { ...client, score: 66, documents: { ...client.documents, proof_of_funds: true } },
            analysis: { approved: true, extractedCapital: 15000000, redFlags: [], summary: "Valid PoF from JP Morgan." }
        });
    }
});

// Fetch CRM State
app.get('/api/client/:id', (req, res) => {
    res.json(crmDb.clients[req.params.id] || crmDb.clients["client_123"]);
});

// Start Server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Deal OTC Backend running on port ${PORT}`);
});