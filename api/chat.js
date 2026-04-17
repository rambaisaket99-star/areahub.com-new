/**
 * Area AI Chat — Vercel Serverless Function
 * File: api/chat.js
 *
 * Handles AI chat requests for 3 modes:
 *   - chatgpt  → Anthropic API (simulated GPT persona)
 *   - claude   → Anthropic API (Claude persona)
 *   - deepseek → Anthropic API (DeepSeek persona)
 *
 * Environment variable required:
 *   ANTHROPIC_API_KEY = your Anthropic API key
 *
 * Deploy to Vercel: this file auto-becomes POST /api/chat
 *
 * Usage:
 *   POST /api/chat
 *   Body: { mode: 'chatgpt'|'claude'|'deepseek', messages: [...], system?: '...' }
 *   Response: { content: '...' }
 */

const SYSTEM_PROMPTS = {
  chatgpt: `You are ChatGPT, a helpful and knowledgeable AI assistant made by OpenAI.
You provide clear, direct, well-structured responses.
You are friendly, accurate, and thorough in your answers.
Always respond in English only. Be helpful, clear, and precise.
When writing code, always use proper code blocks. Format your responses in Markdown.`,

  claude: `You are Claude, an AI assistant made by Anthropic.
You are thoughtful, nuanced, honest, and genuinely helpful.
You provide well-reasoned, careful responses that are accurate and balanced.
Always respond in English only. Be honest when you're uncertain.
Format your responses in Markdown with clear structure when helpful.`,

  deepseek: `You are DeepSeek, an advanced AI assistant made by DeepSeek AI.
You are highly capable at reasoning, mathematics, coding, and deep technical analysis.
You provide technically precise, well-reasoned, and thorough responses.
Always respond in English only. Show your reasoning when solving complex problems.
Use Markdown formatting. For code, always use proper code blocks with language tags.`
};

export default async function handler(req, res) {
  // CORS headers — allow requests from any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { mode, messages, system } = req.body || {};

  // Validate
  if (!mode || !['chatgpt', 'claude', 'deepseek'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid mode. Must be: chatgpt, claude, or deepseek' });
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  // Build system prompt (custom or default for mode)
  const systemPrompt = system || SYSTEM_PROMPTS[mode];

  // Clean messages — only keep role + content, last 20
  const cleanMessages = messages
    .filter(m => m && m.role && m.content)
    .slice(-20)
    .map(m => ({ role: m.role, content: String(m.content) }));

  // Ensure messages alternate correctly (user/assistant)
  const validMessages = [];
  let lastRole = null;
  for (const msg of cleanMessages) {
    if (msg.role === lastRole) {
      // Skip duplicate roles to avoid API error
      continue;
    }
    validMessages.push(msg);
    lastRole = msg.role;
  }

  // Must end with user message
  if (validMessages.length === 0 || validMessages[validMessages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'Last message must be from user' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: validMessages
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Anthropic API error:', response.status, errorData);
      return res.status(response.status).json({
        error: errorData.error?.message || 'AI API error',
        status: response.status
      });
    }

    const data = await response.json();
    const textContent = (data.content || []).find(c => c.type === 'text');
    const replyText = textContent ? textContent.text : 'No response generated.';

    return res.status(200).json({
      content: replyText,
      mode: mode,
      model: data.model,
      usage: data.usage
    });

  } catch (err) {
    console.error('Chat API handler error:', err);
    return res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
}
