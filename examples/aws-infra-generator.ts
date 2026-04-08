/**
 * AWS Infrastructure Generator Agent
 *
 * Generates production-ready AWS CDK stacks from natural language.
 * Follows AWS Well-Architected golden paths: VPC, ECS/Fargate, RDS, S3, CloudFront, etc.
 * Outputs TypeScript CDK code with best practices baked in.
 *
 * Demonstrates: multi-file generation, infrastructure-as-code,
 * opinionated golden paths vs custom architecture.
 *
 * Cell image: default
 * Output: CDK TypeScript files (bin/, lib/stacks/, package.json, cdk.json)
 *
 * Usage:
 *   await oncell.cells.agentRequest("infra-1", "generate", {
 *     instruction: "Create a production-ready web app stack with ECS Fargate, RDS Postgres, and CloudFront CDN"
 *   });
 */

export const AGENT_CODE = `
const SYSTEM_PROMPT = \`You are an expert AWS Solutions Architect. Generate production-ready AWS CDK v2 (TypeScript) infrastructure code.

GOLDEN PATHS (use these by default unless the user specifies otherwise):
- Web apps: CloudFront → ALB → ECS Fargate → RDS Aurora Serverless v2
- APIs: API Gateway → Lambda → DynamoDB
- Static sites: S3 → CloudFront → Route 53
- Background jobs: EventBridge → SQS → Lambda
- ML/AI: SageMaker endpoints or Lambda with Bedrock

RULES:
- Always use CDK v2 (aws-cdk-lib)
- Every stack must have proper tags, removal policies, and monitoring
- Use least-privilege IAM policies
- Enable encryption at rest (KMS) for all data stores
- Use private subnets for databases, public for ALB/CloudFront only
- No NAT Gateway by default (use VPC endpoints instead to save $45/mo)
- Include health checks and auto-scaling
- Add CloudWatch alarms for critical metrics
- Use Secrets Manager for passwords, never hardcode

RESPONSE FORMAT:
Output each file using delimiters:

---FILE bin/app.ts---
#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
// ... code
---ENDFILE---

---FILE lib/stacks/network.ts---
import * as cdk from 'aws-cdk-lib';
// ... code
---ENDFILE---

First write a brief architecture summary (2-3 sentences), then the files, then "Summary: ..."
\`;

module.exports = {
  async generate(ctx, params) {
    const instruction = params.instruction;
    if (!instruction) return { error: "instruction required" };

    const OPENROUTER_KEY = process.env.OPENROUTER_KEY;
    const MODEL = process.env.MODEL || "google/gemini-2.5-flash";
    if (!OPENROUTER_KEY) return { error: "OPENROUTER_KEY not configured" };

    ctx.journal.step("start", "Generating AWS infra: " + instruction);
    ctx.stream({ status: "designing_architecture" });

    // Load existing files for context
    const existingFiles = ctx.store.list();
    let codeContext = "";
    for (const f of existingFiles.slice(0, 10)) {
      const content = ctx.store.read(f);
      if (content && content.length < 5000) {
        codeContext += "\\n--- " + f + " ---\\n" + content + "\\n";
      }
    }

    const history = ctx.db.get("conversation") || [];
    const messages = [{ role: "system", content: SYSTEM_PROMPT }];
    for (const msg of history.slice(-4)) messages.push(msg);

    let userMsg = instruction;
    if (codeContext) userMsg = "Existing infrastructure:\\n" + codeContext + "\\n\\nNew requirement: " + instruction;
    messages.push({ role: "user", content: userMsg });

    ctx.stream({ status: "calling_llm", model: MODEL });

    const https = require("https");
    const fullResponse = await new Promise((resolve, reject) => {
      let result = "";
      let buf = "";
      const payload = JSON.stringify({ model: MODEL, messages, temperature: 0.2, stream: true });
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
        res.on("data", (chunk) => {
          buf += chunk.toString();
          const lines = buf.split("\\n");
          buf = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ") || line.trim() === "data: [DONE]") continue;
            try {
              const parsed = JSON.parse(line.slice(6));
              const text = parsed.choices?.[0]?.delta?.content;
              if (text) { result += text; ctx.stream({ text }); }
            } catch {}
          }
        });
        res.on("end", () => resolve(result));
        res.on("error", reject);
      });
      req.on("error", reject);
      req.write(payload);
      req.end();
    });

    // Parse files
    const fileRegex = /---FILE\\s+(.+?)---([\\s\\S]*?)---ENDFILE---/g;
    let match;
    const writtenFiles = [];

    while ((match = fileRegex.exec(fullResponse)) !== null) {
      const path = match[1].trim();
      const content = match[2].trim();
      if (path && content) {
        ctx.store.write(path, content);
        writtenFiles.push(path);
        ctx.stream({ event: "file-written", path, lines: content.split("\\n").length });
        ctx.journal.step("write", "Wrote " + path);
      }
    }

    // Generate architecture diagram as index.html
    const archHtml = generateArchDiagram(fullResponse.split("---FILE")[0].trim(), writtenFiles);
    ctx.store.write("index.html", archHtml);

    history.push({ role: "user", content: instruction });
    history.push({ role: "assistant", content: fullResponse.split("---FILE")[0].trim() });
    ctx.db.set("conversation", history);

    ctx.journal.step("done", "Generated " + writtenFiles.length + " CDK files");
    return { files: writtenFiles, count: writtenFiles.length };
  },

  async deploy(ctx, params) {
    // Future: run cdk deploy inside the cell
    return { error: "Deploy not yet implemented. Download files and run: npx cdk deploy" };
  },
};

function generateArchDiagram(summary, files) {
  const fileList = files.map(f => '<li class="py-1 font-mono text-sm text-emerald-400">' + f + '</li>').join("");
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>AWS Infrastructure</title><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-gray-900 text-white p-8 max-w-3xl mx-auto"><div class="mb-8"><h1 class="text-3xl font-bold mb-4">AWS Infrastructure</h1><p class="text-gray-400 leading-relaxed">' + (summary || "Infrastructure generated") + '</p></div><div class="bg-gray-800 rounded-lg p-6 border border-gray-700"><h2 class="text-lg font-semibold mb-3">Generated Files</h2><ul class="space-y-1">' + fileList + '</ul></div><div class="mt-6 p-4 bg-blue-900/30 border border-blue-700/50 rounded-lg"><p class="text-sm text-blue-300">To deploy: <code class="bg-blue-900/50 px-2 py-1 rounded">npm install && npx cdk deploy --all</code></p></div><p class="mt-8 text-gray-600 text-sm">Generated by OnCell AWS Infra Agent</p></body></html>';
}
`;

export const config = {
  name: "AWS Infrastructure Generator",
  description: "Generates production-ready AWS CDK stacks with golden path best practices",
  image: "default",
  tier: "starter",
};
