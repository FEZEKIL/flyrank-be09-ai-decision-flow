# Branchline — AI decision flows

A visual workflow builder for creating yes/no AI decisions. Edit and connect nodes on the React Flow canvas, then execute the selected path with Inngest and OpenRouter. Workflows are saved to browser storage and can be exported or imported as JSON.

## Requirements

- Node.js 20+
- npm
- An OpenRouter API key for AI-powered runs

## Setup

```bash
npm install
Copy-Item .env.example .env.local
```

Add your OpenRouter API key to `.env.local`:

```env
OPENROUTER_API_KEY=replace_with_your_own_key
OPENROUTER_MODEL=openrouter/free
OPENROUTER_SITE_URL=http://localhost:3000
OPENROUTER_SITE_NAME=FlyRank BE-09 AI Decision Flow
```

Replace the key placeholder with a key from [OpenRouter API Keys](https://openrouter.ai/settings/keys). The API key stays server-side; do not prefix it with `NEXT_PUBLIC_`. The model, site URL, and site name are optional and default to the values shown above.

Start the Next.js app and the Inngest development server in separate terminals:

```bash
npm run dev
```

```bash
npm run inngest:dev
```

Open [http://localhost:3000](http://localhost:3000). The Inngest development server discovers the functions at `/api/inngest`. Configure an OpenRouter key to run the sample flow; the editor and local workflow features work without one.

## Using the builder

- Edit a decision’s prompt by selecting it and changing **Decision prompt** in the inspector.
- Add decision and outcome nodes, then drag from the green **YES** or red **NO** port to a node’s input.
- Choose a decision node and use **Set as starting decision** to change the entry point.
- Enter a message in **Test your flow** and select **Run workflow**. Each decision calls OpenRouter from a named Inngest step and follows only the exact `YES` or `NO` response. An unconnected selected branch ends the workflow.
- Workflows are automatically saved in this browser. Use **Import** and **Export JSON** to move them between browsers.

## Architecture

- `src/components/workflow-editor.tsx` — React Flow canvas, node inspector, local persistence, import/export, and execution UI.
- `src/lib/workflow.ts` — shared workflow and run schemas plus the example flow.
- `src/app/api/workflows/run/route.ts` — validates the graph and sends a run event to Inngest.
- `src/app/api/inngest/route.ts` — Inngest Next.js adapter and function registration.
- `src/inngest/functions.ts` — traverses the graph, makes strict YES/NO OpenRouter decisions, and records each step.
- `src/app/api/runs/[runId]/route.ts` — serves execution status to the editor.

The sample execution-status store is process-local for the single-server development setup; restart the app to clear run history. For a multi-instance or production deployment, replace it with shared durable storage. Inngest itself still records and manages the function’s durable steps.

## Validation

```bash
npm run lint
npm run build
```
