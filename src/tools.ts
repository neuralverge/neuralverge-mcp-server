import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiGet, apiPost } from "./client.js";

function toResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

async function runTool(fn: () => Promise<unknown>) {
  try {
    const data = await fn();
    return toResult(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text" as const, text: message }],
      isError: true,
    };
  }
}

const researchSettings = z
  .object({
    country_code: z.string().optional().describe("Two-letter country code, e.g. 'us'."),
    search_enabled: z.boolean().optional().describe("Whether web search is enabled during research."),
    deepsearch_model: z.string().optional().describe("Model used for the deep research step."),
    finalizer_model: z.string().optional().describe("Model used to finalize the report."),
    extract_schema_json: z
      .string()
      .optional()
      .describe("JSON-encoded schema string describing the desired structured output."),
  })
  .describe("Research run settings.");

const agentSettings = z
  .object({
    country_code: z.string().optional(),
    search_enabled: z.boolean().optional(),
    deepsearch_model: z.string().optional(),
    finalizer_model: z.string().optional(),
  })
  .describe("Agent run settings.");

const searchSettings = z
  .object({
    country: z.string().optional(),
    language: z.string().optional(),
    max_results: z.number().optional(),
  })
  .describe("Search settings.");

const extractSettings = z
  .object({
    country_code: z.string().optional(),
    extract_schema_json: z.string().optional().describe("JSON-encoded schema string for the extraction shape."),
  })
  .describe("Extraction settings.");

export function registerTools(server: McpServer) {
  // ---- AI Research ----

  server.tool(
    "run_research",
    "Starts the full NeuralVerge AI research workflow (multi-step search, analysis, and structured reporting) and returns a session_id immediately. Poll get_session_status with that session_id until status is 'complete' or 'failed'.",
    {
      instructions: z.string().describe("Main research task, in natural language."),
      settings: researchSettings,
    },
    async ({ instructions, settings }) =>
      runTool(() => apiPost("/functions/v1/run-research", { instructions, settings })),
  );

  server.tool(
    "run_agent",
    "Runs a saved NeuralVerge agent (a reusable, preconfigured workflow) by its agentId and returns a session_id immediately. Poll get_session_status with that session_id until status is 'complete' or 'failed'.",
    {
      agentId: z.string().uuid().describe("UUID of the saved agent to run."),
      instructions: z.string().describe("Instructions passed to the agent for this run."),
      settings: agentSettings,
    },
    async ({ agentId, instructions, settings }) =>
      runTool(() => apiPost("/functions/v1/run-agent", { agentId, instructions, settings })),
  );

  server.tool(
    "get_session_status",
    "Returns the current status of an AI Research or AI Agent session (queued/running/complete/failed) and the final result (human-readable summary plus machine-readable JSON) once processing completes.",
    {
      session_id: z.string().uuid().describe("Session identifier returned by run_research or run_agent."),
    },
    async ({ session_id }) =>
      runTool(() => apiGet("/functions/v1/get-session-status", { session_id })),
  );

  server.tool(
    "run_search",
    "Runs a synchronous web search and returns a structured list of ranked results (title, url, snippet) immediately, without polling.",
    {
      query: z.string().describe("Search query."),
      settings: searchSettings,
    },
    async ({ query, settings }) => runTool(() => apiPost("/functions/v1/run-search", { query, settings })),
  );

  // ---- AI Extract ----

  server.tool(
    "run_extract",
    "Loads a webpage by URL and extracts structured data from it according to natural-language instructions and/or a JSON schema. Synchronous — returns the result immediately.",
    {
      url: z.string().describe("URL of the page to load and extract data from."),
      instructions: z.string().describe("Natural-language description of what to extract."),
      settings: extractSettings,
    },
    async ({ url, instructions, settings }) =>
      runTool(() => apiPost("/functions/v1/run-extract", { url, instructions, settings })),
  );

  // ---- Data Sources: LinkedIn ----

  server.tool(
    "run_linkedin_email",
    "Looks up a LinkedIn profile by its full profile URL and returns contact details, including an email address when available.",
    {
      username: z.string().describe("Full LinkedIn profile URL, e.g. https://www.linkedin.com/in/john-doe/"),
    },
    async ({ username }) => runTool(() => apiPost("/functions/v1/run-linkedin-email", { username })),
  );

  server.tool(
    "run_linkedin_domain",
    "Finds a LinkedIn profile matching a company name or domain plus a full name.",
    {
      company_or_domain: z.string().describe("Company name or domain, e.g. openai.com"),
      full_name: z.string().describe("Full name of the person to find."),
    },
    async ({ company_or_domain, full_name }) =>
      runTool(() => apiPost("/functions/v1/run-linkedin-domain", { company_or_domain, full_name })),
  );

  server.tool(
    "run_linkedin_company_search",
    "Searches LinkedIn companies by a text query with optional filters (size, industry, location).",
    {
      searchQuery: z.string().describe("Free-text company search query."),
      companySize: z.array(z.string()).optional().describe("Company size buckets, e.g. ['51-200']."),
      industryIds: z.array(z.string()).optional().describe("Industry filters."),
      locations: z.array(z.string()).optional().describe("Location filters."),
      maxItems: z.number().optional().describe("Maximum number of results to return."),
      scraperMode: z.string().optional().describe("Scraper depth mode, e.g. 'short' or 'full'."),
      startPage: z.number().optional().describe("Page offset to start from."),
    },
    async (args) => runTool(() => apiPost("/functions/v1/run-linkedin-company-search", args)),
  );

  server.tool(
    "run_linkedin_people_search",
    "Searches LinkedIn people using an optional free-text query and a rich set of advanced filters (company, title, seniority, location, experience, industry).",
    {
      searchQuery: z.string().optional().describe("Free-text people search query."),
      maxResults: z.number().optional().describe("Maximum number of results to return."),
      startPage: z.number().optional().describe("Page offset to start from."),
      scraperMode: z.string().optional().describe("Scraper depth mode, e.g. 'short' or 'full'."),
      locations: z.array(z.string()).optional(),
      currentCompany: z.array(z.string()).optional(),
      pastCompany: z.array(z.string()).optional(),
      currentJobTitleFilter: z.array(z.string()).optional(),
      pastJobTitle: z.array(z.string()).optional(),
      yearsOfExperienceFilter: z.array(z.string()).optional(),
      yearsAtCurrentCompanyFilter: z.array(z.string()).optional(),
      seniorityLevelFilter: z.array(z.string()).optional(),
      functionFilter: z.array(z.string()).optional(),
      industryIds: z.array(z.string()).optional(),
      firstNames: z.array(z.string()).optional(),
      lastNames: z.array(z.string()).optional(),
      companyHeadcountFilter: z.array(z.string()).optional(),
    },
    async (args) => runTool(() => apiPost("/functions/v1/run-linkedin-people-search", args)),
  );

  server.tool(
    "run_linkedin_company_employee",
    "Searches LinkedIn employees of one or more given companies, using the same people-style filters as run_linkedin_people_search.",
    {
      companies: z.array(z.string()).describe("LinkedIn company URLs or names to search employees of."),
      searchQuery: z.string().optional().describe("Free-text search query."),
      maxResults: z.number().optional(),
      startPage: z.number().optional(),
      scraperMode: z.string().optional(),
      locations: z.array(z.string()).optional(),
      currentJobTitleFilter: z.array(z.string()).optional(),
      pastJobTitle: z.array(z.string()).optional(),
      yearsOfExperienceFilter: z.array(z.string()).optional(),
      yearsAtCurrentCompanyFilter: z.array(z.string()).optional(),
      seniorityLevelFilter: z.array(z.string()).optional(),
      functionFilter: z.array(z.string()).optional(),
      industryIds: z.array(z.string()).optional(),
      companyHeadcountFilter: z.array(z.string()).optional(),
    },
    async (args) => runTool(() => apiPost("/functions/v1/run-linkedin-company-employee", args)),
  );

  // ---- Data Sources: Email ----

  server.tool(
    "run_email_enrichment",
    "Enriches a known email address with associated profile data (name, phone, company, position, LinkedIn/X profiles) when available.",
    {
      email: z.string().email().describe("Email address to enrich."),
    },
    async ({ email }) => runTool(() => apiPost("/functions/v1/run-email-enrichment", { email })),
  );

  server.tool(
    "run_email_validation",
    "Validates an email address and returns deliverability signals (valid/invalid/risky, catch-all detection, provider, confidence).",
    {
      email: z.string().email().describe("Email address to validate."),
    },
    async ({ email }) => runTool(() => apiPost("/functions/v1/run-email-validation", { email })),
  );

  server.tool(
    "run_email_finder",
    "Finds a professional email address for a person given their company domain, first name, and last name.",
    {
      domain: z.string().describe("Company domain, e.g. openai.com"),
      first_name: z.string().describe("Person's first name."),
      last_name: z.string().describe("Person's last name."),
    },
    async ({ domain, first_name, last_name }) =>
      runTool(() => apiPost("/functions/v1/run-email-finder", { domain, first_name, last_name })),
  );

  // ---- Data Sources: Phone ----

  server.tool(
    "run_phone_enrichment",
    "Enriches a known phone number with associated profile data (name, email, company, LinkedIn/X profiles, carrier) when available.",
    {
      phone: z.string().describe("Phone number in international format, e.g. +1234567890"),
    },
    async ({ phone }) => runTool(() => apiPost("/functions/v1/run-phone-enrichment", { phone })),
  );

  server.tool(
    "run_phone_enrichment_us",
    "Validates and enriches a US phone number with carrier, line type, activity score, litigator risk, and owner details.",
    {
      phone: z.string().describe("US phone number, e.g. 12069735100"),
    },
    async ({ phone }) => runTool(() => apiPost("/functions/v1/run-phone-enrichment-us", { phone })),
  );

  // ---- Data Sources: Crunchbase ----

  server.tool(
    "run_crunchbase_company",
    "Fetches structured company data (website, location, founding year, employees, industries, funding, description) from a Crunchbase company URL.",
    {
      url: z.string().describe("Crunchbase organization URL, e.g. https://www.crunchbase.com/organization/openai"),
    },
    async ({ url }) => runTool(() => apiPost("/functions/v1/run-crunchbase-company", { url })),
  );
}
