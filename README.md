# NeuralVerge MCP Server

An [MCP](https://modelcontextprotocol.io) (Model Context Protocol) server that wraps the full [NeuralVerge](https://docs.neuralverge.ai) API — AI Research, AI Extract, AI Agents, and Data Sources (LinkedIn, email, phone, Crunchbase) — as MCP tools, so any MCP-compatible client (Claude Desktop, Claude Code, etc.) can call it directly.

This is an independent, unofficial wrapper around the NeuralVerge API. It is not affiliated with or endorsed by NeuralVerge.

## Features

Every NeuralVerge API endpoint is exposed as a 1:1 MCP tool:

| Tool | NeuralVerge Endpoint | Description |
| --- | --- | --- |
| `run_research` | `POST /functions/v1/run-research` | Starts a multi-step AI research workflow, returns a `session_id`. |
| `run_agent` | `POST /functions/v1/run-agent` | Runs a saved AI agent, returns a `session_id`. |
| `get_session_status` | `GET /functions/v1/get-session-status` | Polls a session started by `run_research` or `run_agent`. |
| `run_search` | `POST /functions/v1/run-search` | Synchronous web search. |
| `run_extract` | `POST /functions/v1/run-extract` | Schema-driven structured extraction from a URL. |
| `run_linkedin_email` | `POST /functions/v1/run-linkedin-email` | LinkedIn profile lookup + email. |
| `run_linkedin_domain` | `POST /functions/v1/run-linkedin-domain` | LinkedIn profile lookup by company/domain + full name. |
| `run_linkedin_company_search` | `POST /functions/v1/run-linkedin-company-search` | LinkedIn company search with filters. |
| `run_linkedin_people_search` | `POST /functions/v1/run-linkedin-people-search` | LinkedIn people search with advanced filters. |
| `run_linkedin_company_employee` | `POST /functions/v1/run-linkedin-company-employee` | LinkedIn employee search scoped to companies. |
| `run_email_enrichment` | `POST /functions/v1/run-email-enrichment` | Enrich a known email with profile data. |
| `run_email_validation` | `POST /functions/v1/run-email-validation` | Validate an email's deliverability. |
| `run_email_finder` | `POST /functions/v1/run-email-finder` | Find a professional email from name + domain. |
| `run_phone_enrichment` | `POST /functions/v1/run-phone-enrichment` | Enrich a known phone number with profile data. |
| `run_phone_enrichment_us` | `POST /functions/v1/run-phone-enrichment-us` | Validate/enrich a US phone number (carrier, activity score, owners). |
| `run_crunchbase_company` | `POST /functions/v1/run-crunchbase-company` | Fetch structured company data from a Crunchbase URL. |

`run_research` and `run_agent` are asynchronous: they return a `session_id` immediately. Call `get_session_status` every 2–5 seconds until `status` is `complete` or `failed`, per NeuralVerge's own polling guidance. All other tools return their result synchronously.

## Requirements

- Node.js >= 18
- A NeuralVerge API key (Bearer token) — see [docs.neuralverge.ai/authentication](https://docs.neuralverge.ai/authentication)

## Installation

```bash
npm install
npm run build
```

This compiles TypeScript sources in `src/` to `dist/`.

## Configuration

The server reads its API key from the environment:

| Variable | Required | Description |
| --- | --- | --- |
| `NEURALVERGE_API_KEY` | Yes | Your NeuralVerge API bearer token. |
| `NEURALVERGE_BASE_URL` | No | Override the API base URL. Defaults to `https://api.neuralverge.ai`. |

Copy `.env.example` to `.env` for local reference, but note the server itself reads process environment variables — most MCP clients pass these via their own config (see below), not via a `.env` file.

## Usage with Claude Desktop / Claude Code

Add to your MCP client's config (e.g. `claude_desktop_config.json`):

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

## Manual testing

You can exercise the server with the official [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
NEURALVERGE_API_KEY=your_api_key_here npm run inspector
```

## Error handling

The NeuralVerge API returns these status codes, which this server surfaces as MCP tool errors with a descriptive message:

| Status | Meaning |
| --- | --- |
| 400 | Bad Request — invalid body/parameters. Not retryable without fixing the request. |
| 401 | Unauthorized — missing/invalid/expired token. Check `NEURALVERGE_API_KEY`. |
| 402 | Payment Required — plan or usage limits reached. |
| 404 | Not Found — invalid session id or inaccessible resource. |
| 500 | Internal Error — upstream/provider issue. Safe to retry. |

## Project structure

```
src/
  client.ts   # thin fetch wrapper: auth header, error mapping
  tools.ts     # all 16 MCP tool definitions (input schemas + handlers)
  index.ts     # MCP server bootstrap (stdio transport)
```

## License

MIT — see [LICENSE](LICENSE).
