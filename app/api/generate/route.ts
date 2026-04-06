import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "",
});

const SYSTEM_PROMPT = `You are an expert Next.js developer. You generate complete, working React components using TypeScript and Tailwind CSS.

Rules:
- Output ONLY valid TSX code — no markdown fences, no explanation, no commentary
- Use "use client" directive when the component needs interactivity (useState, onClick, etc.)
- Use Tailwind CSS for all styling — no CSS files
- Make it visually polished with proper spacing, colors, typography, and responsive design
- Include all necessary imports at the top
- Export default the main component
- The component must be a complete, self-contained page
- Do NOT import from local files — everything in one file
- Use modern React patterns (hooks, conditional rendering)`;

export async function POST(req: Request) {
  const { instruction, currentCode } = await req.json();

  if (!instruction) {
    return Response.json({ error: "instruction required" }, { status: 400 });
  }

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  if (currentCode) {
    messages.push({
      role: "user",
      content: `Here is the current code:\n\n${currentCode}\n\nApply this change: ${instruction}`,
    });
  } else {
    messages.push({
      role: "user",
      content: `Generate a Next.js page component for: ${instruction}`,
    });
  }

  const stream = await openai.chat.completions.create({
    model: process.env.MODEL || "google/gemini-2.5-flash",
    messages,
    stream: true,
    temperature: 0.2,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || "";
        if (text) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
        }
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
