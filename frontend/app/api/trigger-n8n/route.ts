import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { clientId, newScore, missingDoc } = body;

    // The Webhook URL configured in n8n to receive events
    const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

    if (!N8N_WEBHOOK_URL) {
      console.warn("N8N_WEBHOOK_URL is not set. Skipping automation trigger.");
      return NextResponse.json({ success: true, warning: "n8n webhook disabled" });
    }

    // Ping the n8n automation flow
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'score_updated',
        clientId: clientId,
        score: newScore,
        missingDoc: missingDoc,
        timestamp: new Date().toISOString()
      }),
    });

    if (!response.ok) {
      throw new Error(`n8n responded with status: ${response.status}`);
    }

    return NextResponse.json({ success: true, message: "n8n automation triggered" });
  } catch (error) {
    console.error("n8n Trigger Error:", error);
    return NextResponse.json({ success: false, error: "Failed to trigger n8n" }, { status: 500 });
  }
}
