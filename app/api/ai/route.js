import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { messages, context } = await req.json();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: `You are OilTrack Pro AI assistant for a mobile oil change business servicing farm and heavy equipment. You help with: looking up filter specs and part numbers, generating parts orders, answering questions about equipment and service history, reading invoice data, and summarizing service records. Be concise and practical — the user is a field tech. Use part numbers when you have them. Current database:\n${context}`,
        messages,
      }),
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 });
  }
}
