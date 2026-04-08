/**
 * API Builder Agent
 *
 * Generates REST API endpoints from natural language descriptions.
 * Creates Express-style route handlers, validates schemas,
 * stores data in the cell's DB, and serves them at the cell's preview URL.
 *
 * Demonstrates: building APIs inside cells, using ctx.db as the datastore,
 * serving dynamic endpoints via the cell's HTTP server.
 *
 * Cell image: default
 * Output: API routes stored in cell, callable at cell preview URL
 *
 * Usage:
 *   await oncell.cells.agentRequest("api-1", "generate", {
 *     instruction: "Create a REST API for a todo app with CRUD operations"
 *   });
 *   // Then: GET https://{cell-id}.cells.oncell.ai/api/todos
 */

export const AGENT_CODE = `
const SYSTEM_PROMPT = \`You are an API architect. Generate a complete REST API specification.

Given a description, output a JSON object with this structure:
{
  "name": "API name",
  "description": "What it does",
  "entities": {
    "todo": {
      "fields": { "title": "string", "completed": "boolean", "dueDate": "string" },
      "required": ["title"],
      "endpoints": {
        "list": { "method": "GET", "path": "/api/todos" },
        "create": { "method": "POST", "path": "/api/todos" },
        "get": { "method": "GET", "path": "/api/todos/:id" },
        "update": { "method": "PUT", "path": "/api/todos/:id" },
        "delete": { "method": "DELETE", "path": "/api/todos/:id" }
      }
    }
  },
  "sampleData": [
    { "entity": "todo", "data": { "title": "Ship v1", "completed": false } }
  ]
}

Output ONLY the JSON.\`;

module.exports = {
  async generate(ctx, params) {
    const instruction = params.instruction;
    if (!instruction) return { error: "instruction required" };

    const OPENROUTER_KEY = process.env.OPENROUTER_KEY;
    const MODEL = process.env.MODEL || "google/gemini-2.5-flash";
    if (!OPENROUTER_KEY) return { error: "OPENROUTER_KEY not configured" };

    ctx.journal.step("start", "Generating API: " + instruction);
    ctx.stream({ status: "designing_api" });

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: instruction }
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
    const specText = parsed.choices?.[0]?.message?.content || "{}";
    let spec;
    try {
      spec = JSON.parse(specText.replace(/\\\`\\\`\\\`(?:json)?\\n?/g, "").replace(/\\\`\\\`\\\`/g, "").trim());
    } catch {
      return { error: "Failed to generate API spec" };
    }

    ctx.stream({ status: "creating_api", entities: Object.keys(spec.entities || {}) });

    // Store the API spec
    ctx.store.write("api-spec.json", JSON.stringify(spec, null, 2));
    ctx.db.set("api_spec", spec);

    // Seed sample data
    if (spec.sampleData) {
      for (const sample of spec.sampleData) {
        const entity = sample.entity;
        const items = ctx.db.get(entity) || [];
        items.push({
          id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
          ...sample.data,
          createdAt: new Date().toISOString(),
        });
        ctx.db.set(entity, items);
      }
    }

    // Generate an index.html that documents the API
    const entityDocs = Object.entries(spec.entities || {}).map(([name, entity]) => {
      const endpoints = Object.entries(entity.endpoints || {}).map(([action, ep]) =>
        '<tr><td class="px-4 py-2 font-mono text-sm">' + ep.method + '</td><td class="px-4 py-2 font-mono text-sm">' + ep.path + '</td><td class="px-4 py-2">' + action + '</td></tr>'
      ).join("");
      return '<h3 class="text-lg font-semibold mt-6 mb-2">' + name + '</h3><table class="w-full border-collapse border border-gray-700"><thead><tr class="bg-gray-800"><th class="px-4 py-2 text-left">Method</th><th class="px-4 py-2 text-left">Path</th><th class="px-4 py-2 text-left">Action</th></tr></thead><tbody>' + endpoints + '</tbody></table>';
    }).join("");

    const docsHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + (spec.name || "API") + '</title><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-gray-900 text-white p-8 max-w-3xl mx-auto"><h1 class="text-3xl font-bold mb-2">' + (spec.name || "API") + '</h1><p class="text-gray-400 mb-6">' + (spec.description || "") + '</p>' + entityDocs + '<p class="mt-8 text-gray-500 text-sm">Generated by OnCell API Builder Agent</p></body></html>';
    ctx.store.write("index.html", docsHtml);

    ctx.journal.step("done", "API created: " + Object.keys(spec.entities || {}).length + " entities");
    return { spec, entities: Object.keys(spec.entities || {}), sampleDataCount: spec.sampleData?.length || 0 };
  },

  // CRUD handler — called for each entity
  async crud(ctx, params) {
    const { entity, action, id, data } = params;
    const items = ctx.db.get(entity) || [];

    switch (action) {
      case "list":
        return { items, total: items.length };
      case "create": {
        const record = { id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6), ...data, createdAt: new Date().toISOString() };
        items.push(record);
        ctx.db.set(entity, items);
        return record;
      }
      case "get":
        return items.find(i => i.id === id) || { error: "not found" };
      case "update": {
        const idx = items.findIndex(i => i.id === id);
        if (idx === -1) return { error: "not found" };
        items[idx] = { ...items[idx], ...data, updatedAt: new Date().toISOString() };
        ctx.db.set(entity, items);
        return items[idx];
      }
      case "delete": {
        const dIdx = items.findIndex(i => i.id === id);
        if (dIdx === -1) return { error: "not found" };
        items.splice(dIdx, 1);
        ctx.db.set(entity, items);
        return { success: true };
      }
      default:
        return { error: "unknown action: " + action };
    }
  },
};
`;

export const config = {
  name: "API Builder",
  description: "Generates REST APIs from natural language — creates endpoints, schemas, and sample data",
  image: "default",
  tier: "starter",
};
