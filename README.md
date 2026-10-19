# NeuralVerge MCP Server

An [MCP](https://modelcontextprotocol.io) (Model Context Protocol) server that wraps the full [NeuralVerge](https://docs.neuralverge.ai) API — AI Research, Search, AI Extract, and all Data Sources (LinkedIn, Crunchbase, email/phone enrichment, e-commerce marketplaces, product reviews, company registries, startup & funding data) — as MCP tools, so any MCP-compatible client (Claude Desktop, Claude Code, Cursor, ChatGPT/GPT clients with MCP support, and others) can call it directly.

This is an independent, unofficial wrapper around the NeuralVerge API. It is not affiliated with or endorsed by NeuralVerge.

## Getting an API key

Before installing, you need a NeuralVerge account and an API key:

1. Sign up at [app.neuralverge.ai](https://app.neuralverge.ai) (or via [neuralverge.ai](https://neuralverge.ai) → "Get started").
2. Choose a plan (see [Pricing](#pricing) below) — this determines your monthly points allowance.
3. Generate an API key from your account/API settings in the app.
4. Use that key as `NEURALVERGE_API_KEY` in the [Configuration](#configuration) step further down.

## MCP server overview

NeuralVerge exposes its API as a remote [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server, so any MCP-compatible client — Claude, ChatGPT, Cursor, or a custom agent — can call Search, AI Extract, and every Data Source (including marketplaces and product reviews) directly as tools, without writing any HTTP integration code. See the official page: [docs.neuralverge.ai/mcp-server](https://docs.neuralverge.ai/mcp-server).

This repository is a **self-hosted equivalent** of that server: same tool names, same input schemas, same behavior, and it can run either as a local stdio process or as a Streamable HTTP server. Two differences from the hosted server:

- This server additionally exposes the two AI Research tools (`run_research`, `get_session_status`). The hosted server leaves them out because a research run is asynchronous, while an MCP tool normally returns its result inside the call. Here they work as a start-then-poll pair.
- Total tool count: **344** here (342 hosted-style tools + 2 AI Research tools).

> **About the "251 tools" figure.** The hosted docs page says the server exposes 251 tools, but the tables on that same page list **342** tools (`run_search`, `run_extract` and every Data Source endpoint) — the OpenAPI spec has 344 endpoints in total, i.e. those 342 plus `run_research` and `get_session_status`. The 251 in the prose is outdated; this server exposes all of them.

### Quickstart

1. **Get an API key.** In the NeuralVerge dashboard open **Settings → API**, click **Create API Key**, and copy the key. Keep it private — it is the only thing that authenticates the connection.
2. **Point your client at a server.** Either use NeuralVerge's hosted endpoint, or run this repository (see [Installation](#installation) and [Transports & client compatibility](#transports--client-compatibility)).

   Hosted endpoint, Claude Code:

   ```bash
   claude mcp add --transport http neuralverge \
     https://api.neuralverge.ai/functions/v1/mcp-server \
     --header "Authorization: Bearer YOUR_API_KEY"
   ```

   Hosted endpoint, Cursor and other JSON clients:

   ```json
   {
     "mcpServers": {
       "neuralverge": {
         "url": "https://api.neuralverge.ai/functions/v1/mcp-server",
         "headers": {
           "Authorization": "Bearer YOUR_API_KEY"
         }
       }
     }
   }
   ```

   This repository, Claude Code (local stdio):

   ```bash
   claude mcp add neuralverge -e NEURALVERGE_API_KEY=YOUR_API_KEY -- node /absolute/path/to/MCP/dist/index.js
   ```

3. **Let the agent call tools.** Start a new conversation and ask for something that needs data, for example: *"Find the registered address of Škoda Auto in the Czech company registry."* The agent picks the right tool, calls it mid-task, and answers from the result.

### Hosted endpoint

```
https://api.neuralverge.ai/functions/v1/mcp-server
```

The hosted server speaks MCP's **Streamable HTTP** transport and is stateless — each request is handled independently, with no session to keep alive between calls. Requests must include:

```
Accept: application/json, text/event-stream
```

### Authentication

Send your API key as a bearer token — the same key the REST API uses: `Authorization: Bearer YOUR_API_KEY`. Create a key under **Settings → API** in the dashboard (see [docs.neuralverge.ai/authentication](https://docs.neuralverge.ai/authentication)). On the hosted endpoint, a request with a missing or invalid key is rejected with `401 Unauthorized` before any tool runs. When you run this repository instead, the key is passed to the server process as `NEURALVERGE_API_KEY` (see [Configuration](#configuration)).

### Tool count

`tools/list` returns every tool in one response — roughly 150 KB of JSON for the hosted tool set, a bit more here. Two things follow from that:

- A model pays for those definitions in context on every conversation that has the server attached.
- Clients that limit the number of active tools will load only some of them, and the rest will be invisible to the model.

If you only need a few sources, attach the server to a client that lets you pick tools, or proxy it and expose the subset you use.

### Synchronous results

Every tool except `run_research` returns its result directly in the tool response — there is no session to poll. A scrape that hits its time budget returns `partial: true` with the records collected so far, so a long run degrades to a shorter result instead of failing.

### Connecting an MCP client

- **Claude Code, Cursor and other JSON-config clients** — see the [Quickstart](#quickstart) above.
- **Generic remote HTTP client (ChatGPT, etc.)** — add a remote MCP connector pointing at the hosted endpoint above (or at your own deployment of this server in HTTP mode, see [Streamable HTTP](#streamable-http-chatgpt--remote-clients)), with an `Authorization: Bearer YOUR_API_KEY` header. Any client that speaks MCP's Streamable HTTP transport works.
- **MCP Inspector** — run `npx @modelcontextprotocol/inspector`, connect to `https://api.neuralverge.ai/functions/v1/mcp-server` in **HTTP** mode, and set the `Authorization` header to explore and test tools interactively.

### Example request

```bash
curl -X POST "https://api.neuralverge.ai/functions/v1/mcp-server" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "run_email_validation",
      "arguments": { "email": "john@example.com" }
    }
  }'
```

### Errors

Once a request is authenticated, errors from an individual tool call (invalid parameters, `402 Payment Required` for usage limits, upstream failures, and so on) are returned inside the MCP tool result with `isError: true` rather than as an HTTP failure — this lets the calling model see and react to the error instead of the whole request failing. The underlying status codes are the same ones described in [Errors & Rate Limits](https://docs.neuralverge.ai/errors-and-rate-limits) and in [Error handling](#error-handling) below.

## Tools

The server exposes **every endpoint of the NeuralVerge API as a 1:1 MCP tool — 344 tools in total**. The tool list is generated from the official [OpenAPI spec](https://docs.neuralverge.ai/openapi.json), so input schemas (types, enums, min/max, required fields) match the REST API exactly. The full catalog with parameters is in [docs/TOOLS.md](docs/TOOLS.md).

`run_research` is asynchronous — it returns a `session_id` immediately; call `get_session_status` every 2–5 seconds until `status` is `complete` or `failed`. Every other tool returns its result synchronously (a scrape that hits its time budget returns `partial: true` with the records collected so far).

| Category | Tools | Examples |
| --- | --- | --- |
| AI Research | 2 | `run_research`, `get_session_status` |
| Search | 1 | `run_search` |
| AI Extract | 1 | `run_extract` |
| Social media | 5 | `run_linkedin_email`, `run_linkedin_people_search`, `run_linkedin_company_search` |
| Enrichment | 5 | `run_email_enrichment`, `run_email_validation`, `run_email_finder`, `run_phone_enrichment` |
| Company intelligence | 1 | `run_crunchbase_company` |
| E-commerce & Marketplaces | 128 | Amazon, eBay, Walmart, AliExpress, Alibaba products, sellers, reviews |
| Product reviews | 15 | Capterra, Gartner Peer Insights, Trustpilot |
| Company Registries | 93 | country-specific company registries |
| Startup & Funding Data | 93 | startups, funding rounds, investors |

Tool names follow the endpoint path: `POST /functions/v1/run-amazon-product-search` → `run_amazon_product_search`.

> **Context size:** all 344 tool definitions together are large. If your client caps active tools or you want to save context, enable only the tools you need in the client's tool picker.

### Keeping tools in sync with the docs

When NeuralVerge adds or changes endpoints, regenerate the tools and rebuild:

```bash
npm run generate   # fetches https://docs.neuralverge.ai/openapi.json -> src/endpoints.generated.ts + docs/TOOLS.md
npm run build
```

## Pricing

NeuralVerge uses simple, points-based pricing — one pool of points covers research, extraction, and every data source. See [neuralverge.ai/pricing](https://neuralverge.ai/pricing) for the current numbers.

**Plans**

| Plan | Price | Points / month |
| --- | --- | --- |
| Lite | $20/mo | 20,000 |
| Base | $50/mo | 50,000 |
| Core (Popular) | $100/mo | 100,000 |
| Pro | $250/mo | 250,000 |
| Ultima | $500/mo | 500,000 |
| Enterprise | $1,000/mo | 1,000,000 |

**Action costs**

| Action | Cost |
| --- | --- |
| `run_search` (Search) | 5 pts |
| `run_extract` (AI Extract) | 5 pts |
| `run_research` (AI research) | 20–400 pts, priced by task depth (see below) |
| Data Source tools | priced per endpoint — see each endpoint's page at [docs.neuralverge.ai](https://docs.neuralverge.ai) |
| `run_linkedin_people_search` | 100 pts per 25 results |
| `run_linkedin_company_employee` | 30 pts/run + 5 pts/profile |
| `run_phone_enrichment_us` | 100 pts |

**AI research depth tiers**

| Tier | Cost | Speed | Description |
| --- | --- | --- | --- |
| Lite | 20 pts | 30s–90s | Lightweight and fast |
| Base | 50 pts | 1m–2m | Efficient for many tasks |
| Core | 100 pts | 2m–4m | Balanced and strong for many tasks |
| Pro | 200 pts | 3m–7m | Exploratory deep search |
| Ultima | 400 pts | 5m–12m | Extensive deep search |

Plans can be changed anytime; the new points allowance applies on the next billing cycle. Points reset every cycle.

## Requirements

- Node.js >= 18
- A NeuralVerge API key (Bearer token) — see [Getting an API key](#getting-an-api-key) above and [docs.neuralverge.ai/authentication](https://docs.neuralverge.ai/authentication)

## Installation

```bash
npm install
npm run build
```

This compiles TypeScript sources in `src/` to `dist/`.

## Configuration

The server reads its configuration from the environment:

| Variable | Required | Description |
| --- | --- | --- |
| `NEURALVERGE_API_KEY` | Yes | Your NeuralVerge API bearer token (see [Getting an API key](#getting-an-api-key)). |
| `NEURALVERGE_BASE_URL` | No | Override the NeuralVerge API base URL. Defaults to `https://api.neuralverge.ai`. |
| `MCP_TRANSPORT` | No | `stdio` (default) or `http`. See [Transports & client compatibility](#transports--client-compatibility) below. |
| `MCP_HTTP_PORT` | No | Port for `http` transport. Defaults to `8787`. |
| `MCP_HTTP_PATH` | No | HTTP path for the MCP endpoint. Defaults to `/mcp`. |
| `MCP_HTTP_AUTH_TOKEN` | No | If set, `http` transport requires `Authorization: Bearer <token>` on every request. Strongly recommended if the server is reachable over the internet. |

Copy `.env.example` to `.env` for local reference, but note the server itself reads process environment variables — most MCP clients pass these via their own config, not via a `.env` file.

## Transports & client compatibility

This server implements **both** MCP transports, selected via `MCP_TRANSPORT`, because different clients require different ones:

| Client | Transport it needs | Works with this server? |
| --- | --- | --- |
| Claude Desktop, Claude Code | stdio (spawns a local process) | ✅ `MCP_TRANSPORT` unset/`stdio` (default) |
| Cursor | stdio (spawns a local process, same `mcpServers` config shape) | ✅ `MCP_TRANSPORT` unset/`stdio` (default) |
| ChatGPT (Developer Mode / custom connectors) | Remote Streamable HTTP or SSE over HTTPS — **cannot** spawn local stdio commands | ✅ `MCP_TRANSPORT=http`, deployed somewhere reachable (or tunneled) |
| Any other MCP client | stdio or Streamable HTTP | ✅ pick whichever transport it speaks |

### stdio (Claude Desktop, Claude Code, Cursor)

These clients spawn the server as a local subprocess and talk JSON-RPC over its stdin/stdout — no networking involved. Add this to your client's MCP config (`claude_desktop_config.json` for Claude Desktop, `.cursor/mcp.json` for Cursor — the shape is identical):

```json
{
  "mcpServers": {
    "neuralverge": {
      "command": "node",
      "args": ["/absolute/path/to/MCP/dist/index.js"],
      "env": {
        "NEURALVERGE_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### Streamable HTTP (ChatGPT / remote clients)

ChatGPT's MCP connectors only accept **remote** servers over Streamable HTTP or SSE — they cannot launch a local `node`/`npx` process the way Claude Desktop and Cursor do. To use this server from ChatGPT, run it in HTTP mode and make it reachable over HTTPS:

```bash
MCP_TRANSPORT=http MCP_HTTP_PORT=8787 MCP_HTTP_AUTH_TOKEN=some_shared_secret \
NEURALVERGE_API_KEY=your_api_key_here node dist/index.js
```

This starts a stateless Streamable HTTP server (fresh MCP session per request, no server-side session storage) at `http://localhost:8787/mcp`, plus a `GET /health` check. To reach it from ChatGPT you need a public HTTPS URL — either:

- deploy it to any Node host (Fly.io, Render, a VPS, a container platform, etc.), or
- tunnel your local instance for testing (e.g. `ngrok http 8787` or a Cloudflare Tunnel).

Then in ChatGPT: enable **Developer Mode** (Settings → Connectors → Advanced), add a connector pointing at `https://your-host/mcp`, and set the `Authorization: Bearer <MCP_HTTP_AUTH_TOKEN>` header if you set one.

**Security note:** `NEURALVERGE_API_KEY` lives on the server and is shared by everyone who can reach the HTTP endpoint — it is not per-ChatGPT-user. Always set `MCP_HTTP_AUTH_TOKEN` (or put the server behind your own auth) before exposing it publicly; otherwise anyone with the URL can spend your NeuralVerge points.

## Manual testing

You can exercise the server with the official [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
NEURALVERGE_API_KEY=your_api_key_here npm run inspector
```

The Inspector's "HTTP" connection mode also works against the `http` transport (point it at `http://localhost:8787/mcp`), which is a convenient way to sanity-check the ChatGPT-facing path without a real ChatGPT connector.

## Error handling

The NeuralVerge API returns these status codes, which this server surfaces as MCP tool errors with a descriptive message:

| Status | Meaning |
| --- | --- |
| 400 | Bad Request — invalid body/parameters. Not retryable without fixing the request. |
| 401 | Unauthorized — missing/invalid/expired token. Check `NEURALVERGE_API_KEY`. |
| 402 | Payment Required — plan or usage limits reached (out of points). |
| 404 | Not Found — invalid session id or inaccessible resource. |
| 500 | Internal Error — upstream/provider issue. Safe to retry. |

## Project structure

```
src/
  client.ts                # thin fetch wrapper: auth header, error mapping
  tools.ts                 # registers one MCP tool per endpoint (JSON schema -> zod)
  endpoints.generated.ts   # all 344 endpoints, generated from the OpenAPI spec
  endpoint-types.ts        # types for the generated endpoint list
  index.ts                 # MCP server bootstrap (stdio transport, or Streamable HTTP if MCP_TRANSPORT=http)
scripts/
  generate-endpoints.mjs   # `npm run generate`: OpenAPI spec -> endpoints.generated.ts + docs/TOOLS.md
docs/
  TOOLS.md                 # generated catalog of all tools
```

## License

MIT — see [LICENSE](LICENSE).
