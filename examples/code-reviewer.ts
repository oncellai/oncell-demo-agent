/**
 * Code Reviewer Agent
 *
 * Accepts a GitHub repo URL or pasted code, reviews it for bugs,
 * security issues, performance, and best practices. Returns structured feedback.
 *
 * Demonstrates: ctx.store for persisting reviews, ctx.db for tracking stats,
 * ctx.search for finding similar past reviews.
 *
 * Cell image: default
 * Output: Review stored in cell DB, streamed back as structured JSON
 *
 * Usage:
 *   await oncell.cells.agentRequest("reviewer-1", "review", {
 *     code: "function add(a, b) { return a + b; }",
 *     language: "javascript"
 *   });
 */

export const AGENT_CODE = `
const SYSTEM_PROMPT = \`You are a senior code reviewer. Analyze code for:
1. Bugs and logic errors
2. Security vulnerabilities (SQL injection, XSS, etc.)
3. Performance issues
4. Best practice violations
5. Readability and maintainability

Return a JSON object with this exact structure:
{
  "score": 0-100,
  "summary": "One sentence summary",
  "issues": [
    { "severity": "critical|warning|info", "line": 5, "message": "Description", "fix": "Suggested fix" }
  ],
  "strengths": ["Good things about the code"],
  "suggestions": ["Improvement ideas"]
}

Output ONLY the JSON — no markdown, no explanation.\`;

module.exports = {
  async review(ctx, params) {
    const { code, language, filename } = params;
    if (!code) return { error: "code required" };

    const OPENROUTER_KEY = process.env.OPENROUTER_KEY;
    const MODEL = process.env.MODEL || "google/gemini-2.5-flash";
    if (!OPENROUTER_KEY) return { error: "OPENROUTER_KEY not configured" };

    ctx.journal.step("start", "Reviewing " + (filename || language || "code"));
    ctx.stream({ status: "reviewing" });

    // Check for similar past reviews
    const similar = ctx.search.query(code.substring(0, 200));
    if (similar.length > 0) {
      ctx.stream({ status: "found_similar", count: similar.length });
    }

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: (language ? "Language: " + language + "\\n" : "") + "Code to review:\\n\\n" + code }
    ];

    const https = require("https");
    const response = await new Promise((resolve, reject) => {
      let result = "";
      const payload = JSON.stringify({ model: MODEL, messages, temperature: 0.1 });
      const req = https.request({
        hostname: "openrouter.ai",
        path: "/api/v1/chat/completions",
        method: "POST",
        headers: {
          "Authorization": "Bearer " + OPENROUTER_KEY,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      }, (res) => {
        res.on("data", (chunk) => { result += chunk.toString(); });
        res.on("end", () => resolve(result));
        res.on("error", reject);
      });
      req.on("error", reject);
      req.write(payload);
      req.end();
    });

    const parsed = JSON.parse(response);
    const reviewText = parsed.choices?.[0]?.message?.content || "{}";
    let review;
    try {
      review = JSON.parse(reviewText.replace(/\\\`\\\`\\\`(?:json)?\\n?/g, "").replace(/\\\`\\\`\\\`/g, "").trim());
    } catch {
      review = { score: 0, summary: "Failed to parse review", issues: [], strengths: [], suggestions: [] };
    }

    // Store review
    const reviewId = Date.now().toString(36);
    const reviewRecord = {
      id: reviewId,
      filename: filename || "unknown",
      language: language || "unknown",
      score: review.score,
      issueCount: review.issues?.length || 0,
      timestamp: new Date().toISOString(),
    };

    ctx.store.write("reviews/" + reviewId + ".json", JSON.stringify(review, null, 2));

    // Track stats
    const stats = ctx.db.get("stats") || { totalReviews: 0, avgScore: 0, totalIssues: 0 };
    stats.totalReviews++;
    stats.totalIssues += review.issues?.length || 0;
    stats.avgScore = Math.round(((stats.avgScore * (stats.totalReviews - 1)) + review.score) / stats.totalReviews);
    ctx.db.set("stats", stats);

    const reviews = ctx.db.get("reviews") || [];
    reviews.push(reviewRecord);
    ctx.db.set("reviews", reviews);

    ctx.journal.step("done", "Score: " + review.score + "/100, " + (review.issues?.length || 0) + " issues found");

    return { review, reviewId, stats };
  },

  async getStats(ctx) {
    return {
      stats: ctx.db.get("stats") || { totalReviews: 0, avgScore: 0, totalIssues: 0 },
      recentReviews: (ctx.db.get("reviews") || []).slice(-10),
    };
  },
};
`;

export const config = {
  name: "Code Reviewer",
  description: "AI-powered code review with bug detection, security analysis, and scoring",
  image: "default",
  tier: "starter",
};
