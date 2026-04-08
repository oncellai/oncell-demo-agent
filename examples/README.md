# OnCell Coding Agent Examples

Each example is a self-contained coding agent that runs inside an OnCell cell. They demonstrate different patterns for building AI agents on the platform.

## Agents

| # | Agent | What it does | Cell Image | Demo |
|---|-------|-------------|------------|------|
| 1 | [HTML Generator](./html-generator.ts) | Generates single-page HTML apps from natural language | `default` | [Live](https://oncell-demo.vercel.app) |
| 2 | [React App Generator](./react-app-generator.ts) | Multi-file Next.js/React apps with components | `nextjs` | — |
| 3 | [Code Reviewer](./code-reviewer.ts) | AI code review with scoring, bug detection, security analysis | `default` | — |
| 4 | [API Builder](./api-builder.ts) | Generates REST APIs with CRUD, schemas, sample data | `default` | — |
| 5 | [AWS Infra Generator](./aws-infra-generator.ts) | Production-ready CDK stacks with golden path best practices | `default` | — |

## Coming Soon

| # | Agent | Description |
|---|-------|-------------|
| 6 | Landing Page Builder | Conversion-optimized landing pages with A/B variants |
| 7 | CLI Tool Generator | Generates Go/Python CLI tools from descriptions |
| 8 | Data Pipeline Builder | ETL pipelines with Airflow/Step Functions |
| 9 | Mobile App Generator | React Native/Expo apps from wireframes |
| 10 | Documentation Writer | Generates docs from codebases (README, API docs, guides) |
| 11 | Test Generator | Creates unit/integration tests from existing code |
| 12 | Database Schema Designer | Generates SQL schemas and migrations from descriptions |
| 13 | Kubernetes Manifests | K8s YAML from app descriptions |
| 14 | Chrome Extension Builder | Browser extensions from feature descriptions |
| 15 | Email Template Generator | Responsive email templates with MJML |

## How to Use

```typescript
import { OnCell } from "@oncell/sdk";
import { AGENT_CODE, config } from "./examples/html-generator";

const oncell = new OnCell({ apiKey: "oncell_sk_..." });

// Create a cell with the agent
const cell = await oncell.cells.create({
  customerId: "my-project",
  image: config.image,
  agent: AGENT_CODE,
  secrets: { OPENROUTER_KEY: "sk-or-..." },
});

// Send a request
const result = await oncell.cells.agentRequest("my-project", "generate", {
  instruction: "Build a todo app"
});

// Preview
console.log(cell.previewUrl);
```

## Agent Patterns

### 1. Single-file output (HTML Generator)
Agent generates one file → `ctx.store.write("index.html", code)` → served at preview URL.

### 2. Multi-file output (React App, AWS Infra)
Agent generates multiple files using `---FILE/---ENDFILE` delimiters → parsed and written individually.

### 3. Structured analysis (Code Reviewer)
Agent returns structured JSON → stored in `ctx.db` for aggregation → no file output.

### 4. CRUD + Code (API Builder)
Agent generates API spec → seeds sample data in `ctx.db` → creates documentation page.

### 5. Infrastructure (AWS Infra)
Agent generates CDK stacks → writes to `lib/stacks/` → generates architecture diagram as preview.
