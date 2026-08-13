# NeuralVerge MCP Server

An [MCP](https://modelcontextprotocol.io) (Model Context Protocol) server that wraps the full [NeuralVerge](https://docs.neuralverge.ai) API — AI Research, AI Extract, AI Agents, and Data Sources (LinkedIn, Crunchbase, Email enrichment and lookup, Phone enrichment and lookup, Email verification) — as MCP tools, so any MCP-compatible client (Claude Desktop, Claude Code, Cursor, ChatGPT/GPT clients with MCP support, and others) can call it directly.

This is an independent, unofficial wrapper around the NeuralVerge API. It is not affiliated with or endorsed by NeuralVerge.

## Getting an API key

Before installing, you need a NeuralVerge account and an API key:

1. Sign up at [app.neuralverge.ai](https://app.neuralverge.ai) (or via [neuralverge.ai](https://neuralverge.ai) → "Get started").
2. Choose a plan (see [Pricing](#pricing) below) — this determines your monthly points allowance.
3. Generate an API key from your account/API settings in the app.
4. Use that key as `NEURALVERGE_API_KEY` in the [Configuration](#configuration) step further down.

## Tools

Every NeuralVerge API endpoint is exposed as a 1:1 MCP tool. `run_research` and `run_agent` are asynchronous — they return a `session_id` immediately; call `get_session_status` every 2–5 seconds until `status` is `complete` or `failed` (NeuralVerge's own polling guidance). Every other tool returns its result synchronously.

### AI Research

#### `run_research`
Starts the full multi-step research workflow: searches, analyzes sources, and returns a structured report. Async — returns a `session_id`.

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `instructions` | string | Yes | The research task, in natural language. |
| `settings.country_code` | string | No | Two-letter country code, e.g. `us`. |
| `settings.search_enabled` | boolean | No | Whether web search runs during the task. |
| `settings.deepsearch_model` | string | No | Depth tier for the research step (drives cost — see [Pricing](#pricing)). |
| `settings.finalizer_model` | string | No | Model used to write the final report. |
| `settings.extract_schema_json` | string | No | JSON-encoded schema pinning the structured output shape. |

Cost: 20–400 pts, depending on `deepsearch_model` depth tier.

#### `run_agent`
Runs a saved NeuralVerge agent — a reusable workflow with baked-in instructions and settings — by its `agentId`. Async — returns a `session_id`.

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `agentId` | string (uuid) | Yes | ID of the saved agent to run. |
| `instructions` | string | Yes | Instructions for this specific run. |
| `settings.country_code` | string | No | Two-letter country code. |
| `settings.search_enabled` | boolean | No | Whether web search runs during the task. |
| `settings.deepsearch_model` | string | No | Depth tier for the research step. |
| `settings.finalizer_model` | string | No | Model used to write the final report. |

Cost: same tiered pricing as `run_research`, based on the agent's configured depth.

#### `get_session_status`
Polls a session created by `run_research` or `run_agent`.

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `session_id` | string (uuid) | Yes | Session ID returned by `run_research` or `run_agent`. |

Returns `status` (`queued`/`running`/`complete`/`failed`) and, once complete, a `results` object with a `human` (Markdown summary) and `machine` (structured JSON) field. Polling itself is free.

#### `run_search`
Runs a synchronous web search and returns ranked results (title, URL, snippet). No polling needed.

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `query` | string | Yes | Search query. |
| `settings.country` | string | No | Country to bias results toward. |
| `settings.language` | string | No | Language to bias results toward. |
| `settings.max_results` | number | No | Maximum number of results to return. |

Cost: 5 pts.

### AI Extract

#### `run_extract`
Loads a page by URL and extracts structured data according to natural-language instructions and/or a JSON schema. Synchronous.

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `url` | string | Yes | URL of the page to load and extract from. |
| `instructions` | string | Yes | What to extract, in natural language. |
| `settings.country_code` | string | No | Two-letter country code for locale-sensitive pages. |
| `settings.extract_schema_json` | string | No | JSON-encoded schema pinning the output shape. |

Cost: 5 pts.

This is also the **generic gateway NeuralVerge itself uses** for every catalog data source that doesn't have its own dedicated endpoint (corporate registries, review sites, LinkedIn profiles without email) — point it at the right URL with the right `extract_schema_json` and it behaves like a dedicated source. See [Data sources not exposed as dedicated tools](#data-sources-not-exposed-as-dedicated-tools) below.

### AI Agents

`run_agent` (see above, under AI Research) — NeuralVerge tags it "AI Agents" since it executes saved, reusable agent configurations rather than one-off instructions.

### Data Sources — dedicated tools

These 11 catalog sources have their own dedicated endpoints/tools:

#### `run_linkedin_email`
LinkedIn profile lookup by URL, returning contact details including email when available (catalog: **LinkedIn people profile + Email**).

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `username` | string | Yes | Full LinkedIn profile URL, e.g. `https://www.linkedin.com/in/john-doe/` |

Cost: 10 pts.

#### `run_linkedin_domain`
Finds a LinkedIn profile from a company name/domain plus a full name (catalog: **LinkedIn profile by name and domain**).

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `company_or_domain` | string | Yes | Company name or domain, e.g. `openai.com` |
| `full_name` | string | Yes | Full name of the person to find. |

Cost: 10 pts.

#### `run_linkedin_company_search`
Searches LinkedIn companies by query with optional filters.

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `searchQuery` | string | Yes | Free-text company search query. |
| `companySize` | string[] | No | Size buckets, e.g. `["51-200"]`. |
| `industryIds` | string[] | No | Industry filters. |
| `locations` | string[] | No | Location filters. |
| `maxItems` | number | No | Max number of results. |
| `scraperMode` | string | No | Scraper depth, e.g. `short` or `full`. |
| `startPage` | number | No | Page offset. |

Cost: 5 pts per company returned.

#### `run_linkedin_people_search`
Searches LinkedIn people with an optional free-text query and advanced filters (company, title, seniority, industry, experience, location).

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `searchQuery` | string | No | Free-text people search query. |
| `maxResults` | number | No | Max number of results. |
| `startPage` | number | No | Page offset. |
| `scraperMode` | string | No | Scraper depth, e.g. `short` or `full`. |
| `locations` | string[] | No | Location filters. |
| `currentCompany` / `pastCompany` | string[] | No | Current/past employer filters. |
| `currentJobTitleFilter` / `pastJobTitle` | string[] | No | Current/past title filters. |
| `yearsOfExperienceFilter` | string[] | No | Experience range filters. |
| `yearsAtCurrentCompanyFilter` | string[] | No | Tenure filters. |
| `seniorityLevelFilter` | string[] | No | Seniority filters. |
| `functionFilter` | string[] | No | Job function filters. |
| `industryIds` | string[] | No | Industry filters. |
| `firstNames` / `lastNames` | string[] | No | Name filters. |
| `companyHeadcountFilter` | string[] | No | Employer size filters. |

Cost: 100 pts per 25 results.

#### `run_linkedin_company_employee`
Searches employees of one or more given companies, using the same filter set as `run_linkedin_people_search`.

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `companies` | string[] | Yes | LinkedIn company URLs or names to search employees of. |
| `searchQuery` | string | No | Free-text search query. |
| `maxResults`, `startPage`, `scraperMode`, `locations`, `currentJobTitleFilter`, `pastJobTitle`, `yearsOfExperienceFilter`, `yearsAtCurrentCompanyFilter`, `seniorityLevelFilter`, `functionFilter`, `industryIds`, `companyHeadcountFilter` | — | No | Same semantics as `run_linkedin_people_search`. |

Cost: 30 pts per run + 5 pts per profile returned.

#### `run_email_enrichment`
Enriches a known email with profile data (name, phones, company, position, LinkedIn/X/Telegram, work experience).

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `email` | string | Yes | Email address to enrich. |

Cost: 10 pts.

#### `run_email_validation`
Validates deliverability of an email address (valid/invalid/risky, catch-all detection, mail provider, confidence).

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `email` | string | Yes | Email address to validate. |

Cost: 1 pt — the cheapest call in the catalog.

#### `run_email_finder`
Finds a professional email address from a company domain, first name, and last name.

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `domain` | string | Yes | Company domain, e.g. `openai.com` |
| `first_name` | string | Yes | Person's first name. |
| `last_name` | string | Yes | Person's last name. |

Cost: 10 pts.

#### `run_phone_enrichment`
Enriches a known phone number with profile data (name, emails, company, LinkedIn/X/Telegram, carrier), worldwide.

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `phone` | string | Yes | Phone number in international format, e.g. `+1234567890` |

Cost: 10 pts.

#### `run_phone_enrichment_us`
Validates and enriches a **US** phone number specifically: carrier, line type, activity score, litigator risk, and owner records (with addresses).

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `phone` | string | Yes | US phone number, e.g. `12069735100` |

Cost: 100 pts.

#### `run_crunchbase_company`
Fetches structured company data from a Crunchbase organization URL (website, location, founding year, employees, industries, funding, description).

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `url` | string | Yes | Crunchbase organization URL, e.g. `https://www.crunchbase.com/organization/openai` |

Cost: 15 pts.

### Data sources not exposed as dedicated tools

NeuralVerge's [catalog](https://neuralverge.ai/data-sources) lists **29 data sources** in total. The 11 above have dedicated endpoints/tools. The other **18** are all reached through `run_extract` — pass the source's own page URL as `url` and a matching `extract_schema_json`; the "Read more" page for each source on the catalog site has the exact schema and an example `curl` call. All of them cost 5 pts (the standard `run_extract` price), except where noted.

**Company intelligence**

| Source | What it returns | Cost |
| --- | --- | --- |
| Capterra | Description, rating, use cases, alternatives, FAQs, features, pricing, integrations, support. | 5 pts |
| Capterra reviews | User reviews. | 5 pts |
| G2 | Product info, rating, reviews, discussions, pricing, features. | 5 pts |
| Trustpilot | Review summary, rating, common topics, company details, contact info, similar companies. | 5 pts |

**Corporate registry** (official company registers, by country)

| Source | Country | What it returns | Cost |
| --- | --- | --- | --- |
| Companies House company | 🇬🇧 UK | Registered office, status, type, incorporation date, SIC codes, officers, persons with significant control. | 5 pts |
| Companies House filings | 🇬🇧 UK | Filing date, description, document link. | 5 pts |
| Companies House officers | 🇬🇧 UK | Officer name, correspondence address, role, appointment date. | 5 pts |
| Ariregister company | 🇪🇪 Estonia | General info, VAT info, right of representation, contacts, shareholders, tax info, documents. | 5 pts |
| CVR company | 🇩🇰 Denmark | Business info, ownership, financial statements, production units, registration history, employee counts. | 5 pts |
| Czech Business Register search | 🇨🇿 Czech Republic | Structured results from a register search. | 5 pts |
| INPI company | 🇫🇷 France | Identity, management/direction, establishments, observations and documents. | 5 pts |
| KBO company | 🇧🇪 Belgium | General info, functions, entrepreneurial skill, characteristics, authorisations, entity links. | 5 pts |
| KRS company | 🇵🇱 Poland | Basic/contact/address data, VAT confirmation, bankruptcy info, legal representatives. | 5 pts |
| YTJ company | 🇫🇮 Finland | Business ID, name, company form, home municipality, line of business, registration history. | 5 pts |
| LEI Lookup company | 🌐 Global | LEI registration details, company data, legal address. | 5 pts |
| LEI Lookup search | 🌐 Global | Structured results from an LEI search. | 5 pts |

**Social media** (LinkedIn, without a dedicated tool)

| Source | What it returns | Cost |
| --- | --- | --- |
| LinkedIn company profile | ID, name, country, locations, followers, employee count, about, specialties. | 5 pts |
| LinkedIn people profile | Name, headline, about, location, current company, full role/education history, certifications, languages, recent posts + engagement. | 5 pts |

Example: fetching a UK company record via `run_extract`:

```json
{
  "url": "https://find-and-update.company-information.service.gov.uk/company/08804411",
  "instructions": "Extract data from Companies House profile",
  "settings": {
    "country_code": "us",
    "extract_schema_json": "{ ... }"
  }
}
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
| `run_extract` (AI Extract) — and every data source routed through it | 5 pts |
| `run_research` / `run_agent` (AI research) | 20–400 pts, priced by task depth (see below) |
| Most dedicated Data Source tools | 1–15 pts (see per-tool cost above) |
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
  client.ts   # thin fetch wrapper: auth header, error mapping
  tools.ts     # all 16 MCP tool definitions (input schemas + handlers)
  index.ts     # MCP server bootstrap (stdio transport, or Streamable HTTP if MCP_TRANSPORT=http)
```

## License

MIT — see [LICENSE](LICENSE).
