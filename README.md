# NeuralVerge MCP Server

An [MCP](https://modelcontextprotocol.io) (Model Context Protocol) server that wraps the full [NeuralVerge](https://docs.neuralverge.ai) API — Search, AI Extract, and all Data Sources (LinkedIn, Crunchbase, email/phone enrichment, e-commerce marketplaces, product reviews, company registries, startup & funding data) — as MCP tools, so any MCP-compatible client (Claude Desktop, Claude Code, Cursor, ChatGPT/GPT clients with MCP support, and others) can call it directly.

This is an independent, unofficial wrapper around the NeuralVerge API. It is not affiliated with or endorsed by NeuralVerge.

## Getting an API key

Before installing, you need a NeuralVerge account and an API key:

1. Sign up at [app.neuralverge.ai](https://app.neuralverge.ai) (or via [neuralverge.ai](https://neuralverge.ai) → "Get started").
2. Choose a plan (see [Pricing](#pricing) below) — this determines your monthly points allowance.
3. Generate an API key from your account/API settings in the app.
4. Use that key as `NEURALVERGE_API_KEY` in the [Configuration](#configuration) step further down.

## MCP server overview

NeuralVerge exposes its API as a remote [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server, so any MCP-compatible client — Claude, ChatGPT, Cursor, or a custom agent — can call Search, AI Extract, and every Data Source (including marketplaces and product reviews) directly as tools, without writing any HTTP integration code. See the official page: [docs.neuralverge.ai/mcp-server](https://docs.neuralverge.ai/mcp-server).

This repository is a **self-hosted equivalent** of that server: same tool names, same input schemas, same behavior, and it can run either as a local stdio process or as a Streamable HTTP server. Notes:

- AI Research is **not** available over MCP: a research run is asynchronous, while an MCP tool has to return its result inside the call. Start research runs over the [REST API](https://docs.neuralverge.ai/ai-research) instead.
- Total tool count: **342** — `run_search`, `run_extract` and every Data Source endpoint.

> **About the "251 tools" figure.** The hosted docs page says the server exposes 251 tools, but the tables on that same page list **342** tools. The 251 in the prose is outdated; this server exposes all 342.

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

Every tool returns its result directly in the tool response — there is no session to poll. A scrape that hits its time budget returns `partial: true` with the records collected so far, so a long run degrades to a shorter result instead of failing.

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

The server exposes **342 tools — one per NeuralVerge API endpoint** (Search, AI Extract and every Data Source), as listed below. AI Research is not available over MCP. The tool list is generated from the official [OpenAPI spec](https://docs.neuralverge.ai/openapi.json), so input schemas (types, enums, min/max, required fields) match the REST API exactly.

Every tool returns its result synchronously (a scrape that hits its time budget returns `partial: true` with the records collected so far). Tool names follow the endpoint path: `POST /functions/v1/run-amazon-product-search` → `run_amazon_product_search`.

> **Context size:** all 342 tool definitions together are large. If your client caps active tools or you want to save context, enable only the tools you need in the client's tool picker.

### All available tools

<!-- TOOLS:START -->
_342 tools, generated by `npm run generate` from the NeuralVerge OpenAPI spec. Required parameters are marked with *._

#### Search (1)

| Tool | Description | Parameters |
| --- | --- | --- |
| `run_search` | Runs a web search and returns a structured search payload. | `query`*, `settings`* |

#### AI Extract (1)

| Tool | Description | Parameters |
| --- | --- | --- |
| `run_extract` | Loads a page by URL and extracts structured data. | `url`*, `instructions`*, `settings`* |

#### Social media (5)

| Tool | Description | Parameters |
| --- | --- | --- |
| `run_linkedin_email` | Looks up a LinkedIn profile and returns contact details, including email when available. | `username`* |
| `run_linkedin_domain` | Finds a LinkedIn profile by company name or domain and full name. | `company_or_domain`*, `full_name`* |
| `run_linkedin_company_search` | Searches LinkedIn companies by query and optional filters. | `searchQuery`*, `companySize`, `industryIds`, `locations`, `maxItems`, `scraperMode`, `startPage` |
| `run_linkedin_people_search` | Searches LinkedIn people using optional query terms and advanced filters. | `searchQuery`, `maxResults`, `startPage`, `scraperMode`, `locations`, `currentCompany`, `pastCompany`, `currentJobTitleFilter`, `pastJobTitle`, `yearsOfExperienceFilter`, `yearsAtCurrentCompanyFilter`, `seniorityLevelFilter`, `functionFilter`, `industryIds`, `firstNames`, `lastNames`, `companyHeadcountFilter` |
| `run_linkedin_company_employee` | Searches LinkedIn employees for one or more companies using people-style filters. | `companies`*, `searchQuery`, `maxResults`, `startPage`, `scraperMode`, `locations`, `currentJobTitleFilter`, `pastJobTitle`, `yearsOfExperienceFilter`, `yearsAtCurrentCompanyFilter`, `seniorityLevelFilter`, `functionFilter`, `industryIds`, `companyHeadcountFilter` |

#### Enrichment (5)

| Tool | Description | Parameters |
| --- | --- | --- |
| `run_email_enrichment` | Enriches a known email address with profile-related data when available. | `email`* |
| `run_email_validation` | Validates an email address and returns deliverability signals. | `email`* |
| `run_email_finder` | Finds a professional email address using company domain, first name, and last name. | `domain`*, `first_name`*, `last_name`* |
| `run_phone_enrichment` | Enriches a known phone number with profile data when available. | `phone`* |
| `run_phone_enrichment_us` | Validates and enriches a US phone number with carrier and activity details. | `phone`* |

#### Company intelligence (1)

| Tool | Description | Parameters |
| --- | --- | --- |
| `run_crunchbase_company` | Fetches structured company data from a Crunchbase company URL. | `url`* |

#### E-commerce & Marketplaces (128)

| Tool | Description | Parameters |
| --- | --- | --- |
| `run_amazon_product_search` | Search Amazon and extract product listings (title, URL, price, rating) across paginated results. 1 point per returned record. | `query`*, `domain`, `max_items`, `start_page` |
| `run_amazon_product` | Get full Amazon product details by ASIN: title, brand, price, images, rating, features, and seller. Flat 5 points per successful run. | `asin`*, `domain` |
| `run_amazon_product_offers` | Get all marketplace offers for an Amazon product by ASIN: price, condition, seller, and delivery. Flat 5 points per successful run. | `asin`*, `domain` |
| `run_amazon_seller` | Get an Amazon seller profile by seller ID: name, rating, business details, and contact info. Flat 5 points per successful run. | `seller`*, `domain` |
| `run_amazon_seller_products` | List products sold by an Amazon seller's storefront: title, URL, price, rating, and image. 1 point per returned record. | `seller`*, `domain`, `max_items`, `start_page` |
| `run_ebay_category` | Get the full eBay browse category tree: every department, category, and subcategory. Flat 5 points per successful run. |  |
| `run_ebay_item` | Get full eBay listing details by item ID: title, price, condition, images, and seller. Flat 5 points per successful run. | `item`* |
| `run_ebay_item_search` | Search active eBay listings by keyword: title, price, condition, and seller summary. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `sort`, `condition`, `buying_format`, `category_id`, `min_price`, `max_price` |
| `run_ebay_product` | Get eBay catalog product details by ePID: brand, model, rating, price range, and specs. Flat 5 points per successful run. | `product`* |
| `run_ebay_product_reviews` | Get buyer reviews for an eBay catalog product by ePID: rating, text, and author. 1 point per returned record. | `product`*, `max_items`, `start_page` |
| `run_ebay_seller` | Get an eBay seller/store profile by username: feedback, ratings, and store details. Flat 5 points per successful run. | `seller`* |
| `run_ebay_seller_feedback` | Get feedback reviews received by an eBay seller: rating, reviewer, and related item. 1 point per returned record. | `seller`*, `max_items`, `start_page` |
| `run_ebay_seller_items` | List active eBay listings for a seller: title, price, condition, and image. 1 point per returned record. | `seller`*, `max_items`, `start_page` |
| `run_walmart_product` | Get full Walmart product details by item ID: brand, price, rating, and specifications. Flat 5 points per successful run. | `item`* |
| `run_walmart_product_search` | Search Walmart products by keyword: title, price, rating, and seller. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `sort`, `min_price`, `max_price` |
| `run_walmart_product_reviews` | Get customer reviews for a Walmart product by item ID: rating, text, and author. 1 point per returned record. | `product`*, `max_items`, `start_page` |
| `run_walmart_seller` | Get a Walmart marketplace seller profile by seller ID: rating, location, and contact info. Flat 5 points per successful run. | `seller`* |
| `run_walmart_seller_products` | List products from a Walmart seller's storefront: title, price, rating, and availability. 1 point per returned record. | `seller`*, `max_items`, `start_page` |
| `run_aliexpress_product` | Get AliExpress product details by ID: title, price, images, and store. Flat 5 points per successful run. | `product`*, `language`, `currency` |
| `run_aliexpress_product_search` | Search AliExpress products by keyword: title, price, and image. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `sort`, `currency`, `min_price`, `max_price`, `language`, `country`, `ship_from`, `filters`, `free_shipping`, `choice`, `four_star_and_up`, `local_shipping` |
| `run_aliexpress_product_reviews` | Get buyer reviews for an AliExpress product by ID: rating, text, and buyer details. 1 point per returned record. | `product`*, `max_items`, `language`, `currency`, `filter`, `translate` |
| `run_alibaba_product_search` | Search Alibaba products by keyword: price, MOQ, supplier, and certifications. 1 point per returned record. | `keyword`*, `count` |
| `run_alibaba_product` | Get full Alibaba product details by ID or URL: price tiers, MOQ, attributes, variants, and supplier. Flat 5 points per successful run. | `product`* |
| `run_avito_categories` | Get the Avito category tree: departments and sub-categories with id, name, alias (URL slug for the category filter), parent id, level and browse URL. 5 point per returned record. |  |
| `run_avito_items` | Get a full Avito listing by id or URL: title, price (RUB), description, specification params, category and breadcrumbs, address and coordinates, view counts, posting time, photos and seller. Flat 5 points per successful run. | `item`* |
| `run_avito_items_search` | Search Avito listings by keyword with region, category, price range, sort, seller type, Avito Delivery and attribute filters. Returns title, price, location, coordinates, image and seller for each listing. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `region`, `category`, `price_min`, `price_max`, `sort`, `seller_type`, `params`, `delivery` |
| `run_avito_sellers` | Get an Avito seller (brand page) by slug or URL: name, type, rating, review count, followers, active listing count, registration date and badges. Flat 5 points per successful run. | `seller`* |
| `run_craigslist_areas` | Directory of ~700 Craigslist regional sites with alias (the area value for searches), area code, hostname, country, region, coordinates, timezone and sub-areas. Flat 5 points per successful run. | `country` |
| `run_craigslist_categories` | Every Craigslist posting category with its alias (the category value for searches), description and section. Flat 5 points per successful run. | `section` |
| `run_craigslist_postings` | Full Craigslist posting by id or URL: title, price, body text/HTML, category attributes with matching search filters, decoded VIN spec for vehicles, hiring company for jobs, images, location and dates. Flat 5 points per successful run. | `posting`* |
| `run_craigslist_postings_search` | Search live Craigslist postings in any regional site by keyword, category, area/sub-area/postal/coordinates and 60+ vehicle, motorcycle, boat, housing, job, gig and event filters; returns title, price, date, location, images and category facets. 1 point per returned record. | `area`*, `keyword`, `category`, `max_items`, `start_page`, `subarea`, `sort`, `purveyor`, `min_price`, `max_price`, `condition`, `language`, `free`, `titles_only`, `has_image`, `posted_today`, `hide_duplicates`, `crypto_ok`, `delivery_available`, `postal`, `lat`, `lon`, `radius`, `make_model`, `min_auto_year`, `max_auto_year`, `min_auto_miles`, `max_auto_miles`, `min_monthly_payment`, `max_monthly_payment`, `transmission`, `drivetrain`, `fuel_type`, `title_status`, `body_type`, `paint`, `cylinders`, `min_engine_displacement_cc`, `max_engine_displacement_cc`, `street_legal`, `motorcycle_motor`, `motorcycle_type`, `min_boat_length`, `max_boat_length`, `min_year_manufactured`, `max_year_manufactured`, `boat_propulsion`, `boat_type`, `min_bedrooms`, `max_bedrooms`, `min_bathrooms`, `max_bathrooms`, `min_sqft`, `max_sqft`, `availability`, `rent_period`, `housing_type`, `laundry`, `parking`, `housing_features`, `employment_type`, `is_internship`, `is_nonprofit`, `is_telecommuting`, `is_paid`, `lost_or_found`, `event_types` |
| `run_craigslist_postings_seller` | All postings published by the seller of a given Craigslist posting (a dealer's, landlord's or shop's full inventory). 1 point per returned record. | `posting`*, `max_items`, `start_page`, `category`, `sort` |
| `run_flipkart_product` | Get full Flipkart product details by item id or product URL: title, brand, price, MRP, discount, images, color, rating, category, breadcrumbs, availability, condition and recent reviews. Flat 5 points per successful run. | `product`* |
| `run_flipkart_product_reviews` | Get customer reviews for a Flipkart product: rating, title, text, author, date, location, certified-buyer flag, helpful/downvote counts and photos. 1 point per returned record. | `product`*, `max_items`, `start_page` |
| `run_flipkart_product_search` | Search Flipkart products by keyword: id, title, brand, price, MRP, discount, image, key specs, rating and review counts. 1 point per returned record. | `keyword`*, `max_items`, `start_page` |
| `run_flipkart_seller` | Get the Flipkart seller offering a given product: name, rating, years on Flipkart, units sold, quality/speed scores, product/service quality ratings and description. Flat 5 points per successful run. | `product`* |
| `run_hepsiburada_categories` | Get the Hepsiburada category tree for a category id or URL: the path from the top-level department down to the category, with its nested children (id, name, alias, level, url). Flat 5 points per successful run. | `category`* |
| `run_hepsiburada_categories_products` | List products in a Hepsiburada category with filters (brand, seller, color, price range, minimum rating, fast delivery, discounted, photo reviews, authorized sellers) and sorting. Returns id, name, brand, price, list price, discount, image, rating and seller. 1 point per returned record. | `category`*, `max_items`, `start_page`, `price_min`, `price_max`, `sort`, `rating_min`, `brand`, `color`, `merchant`, `product_type`, `fast_delivery`, `discounted_only`, `with_photo_reviews`, `authorized_seller`, `recently_reviewed`, `advantageous_price` |
| `run_hepsiburada_merchants` | Get a Hepsiburada merchant (store) by slug or store URL: id, name, alias, url and number of products. Flat 5 points per successful run. | `merchant`* |
| `run_hepsiburada_merchants_products` | List products sold by a Hepsiburada merchant with filters (brand, color, price range, minimum rating, fast delivery, discounted, photo reviews) and sorting. 1 point per returned record. | `merchant`*, `max_items`, `start_page`, `price_min`, `price_max`, `sort`, `rating_min`, `brand`, `color`, `product_type`, `fast_delivery`, `discounted_only`, `with_photo_reviews`, `authorized_seller`, `recently_reviewed`, `advantageous_price` |
| `run_hepsiburada_products` | Get full Hepsiburada product details by SKU, product group id or URL: name, brand, price, list price, discount, images, video, rating, stock, specs, variants, categories, the winning seller and other sellers. Flat 5 points per successful run. | `product`* |
| `run_hepsiburada_products_reviews` | Get customer reviews for a Hepsiburada product (aggregated across its variants): rating, text, author, date, verified purchase, helpful count, per-feature ratings, keywords and photos. Sort by most helpful or most recent. 1 point per returned record. | `product`*, `max_items`, `start_page`, `sort` |
| `run_hepsiburada_products_search` | Search Hepsiburada products by keyword with filters (brand, seller, color, price range, minimum rating, fast delivery, discounted, photo reviews, authorized sellers) and sorting. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `sort`, `rating_min`, `brand`, `color`, `merchant`, `product_type`, `price_min`, `price_max`, `fast_delivery`, `discounted_only`, `with_photo_reviews`, `authorized_seller`, `recently_reviewed`, `advantageous_price` |
| `run_hepsiburada_products_sellers` | List all sellers (merchants) offering a Hepsiburada product: seller id, name, price, list price, rating, city, shipping flags and which seller wins the buybox. Flat 5 points per successful run. | `product`* |
| `run_kleinanzeigen_categories` | Full Kleinanzeigen category tree: id, name, alias, URL and parent id for every department and subcategory. Flat 5 points per successful run. |  |
| `run_kleinanzeigen_listings` | Get one Kleinanzeigen ad by id or URL: price, description, location, attributes, images and seller. Flat 5 points per successful run. | `ad`* |
| `run_kleinanzeigen_listings_search` | Search live Kleinanzeigen ads by keyword with category, price, condition, seller type, shipping and sort filters. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `sort`, `condition`, `offer_type`, `seller_type`, `shipping`, `carrier`, `min_price`, `max_price`, `category_id`, `buy_now` |
| `run_kleinanzeigen_listings_similar` | Related ads Kleinanzeigen shows on an ad's page, by ad id or URL. 1 point per returned record. | `ad`*, `max_items`, `start_page` |
| `run_kleinanzeigen_sellers` | Get one Kleinanzeigen seller by user id or profile URL: type, active since, followers and badges. Flat 5 points per successful run. | `seller`* |
| `run_kleinanzeigen_sellers_listings` | A seller's active Kleinanzeigen ads by user id or profile URL. 1 point per returned record. | `seller`*, `max_items`, `start_page` |
| `run_leboncoin_categories` | Get the leboncoin category tree (id, name, slug, parent and nested subcategories). With include_filters enabled, the first category also carries the full catalog of search filters and their enum values. 5 point per returned record. | `category`, `include_filters` |
| `run_leboncoin_listings` | Get a full leboncoin ad by ID (or listing URL): title, description, price (EUR), category, category attributes, images, location, publication and expiry dates, and seller. Flat 5 points per successful run. | `listing`* |
| `run_leboncoin_listings_similar` | Get the 'annonces similaires' recommended for a leboncoin ad (by ID or URL): title, price, attributes, images, location and seller. 1 point per returned record. | `listing`*, `max_items`, `start_page` |
| `run_leboncoin_locations_search` | Resolve a French place name or postcode into leboncoin location objects: label, city, zipcode, department/region id and coordinates. 1 point per returned record. | `keyword`*, `max_items`, `start_page` |
| `run_leboncoin_sellers` | Get a leboncoin professional store by store ID, seller UUID or store URL: name, SIREN/SIRET, activity sector, description, opening hours, website, address, rating, services and team. Flat 5 points per successful run. | `seller`* |
| `run_leboncoin_sellers_reviews` | Get the curated customer reviews leboncoin shows for a professional store (author, rating, text, date, source: Google Maps / Opinion System). 1 point per returned record. | `seller`*, `max_items`, `start_page` |
| `run_leboncoin_sellers_search` | Browse leboncoin's professional-stores directory by activity sector: id, name, activity sector, city, department and region. 1 point per returned record. | `sector`, `category`, `max_items`, `start_page` |
| `run_mercari_items` | Get a Mercari (Japan) item by id or URL: title, description, price in JPY, status (on sale / sold out), photos, brand, category path, condition, shipping payer/method/origin/days, likes, comments, seller (name, reviews, star rating, verified) and item features. Flat 5 points per successful run. | `item`* |
| `run_mercari_items_search` | Search Mercari (Japan) items by keyword with category, sort, status and price filters. Returns items with id, URL, name, price (JPY), status, thumbnail and photo. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `sort`, `order`, `status`, `category_id`, `price_min`, `price_max` |
| `run_newegg_categories_products` | Products in a Newegg category by category id or category page URL: price, rating, seller and stock, with sort. 1 point per returned record. | `category`*, `max_items`, `start_page`, `sort` |
| `run_newegg_products` | Get one Newegg product by item number or URL: price, rating, specifications, images, offers price range and seller. Flat 5 points per successful run. | `product`* |
| `run_newegg_products_offers` | Every marketplace buying option for a Newegg product: seller, price, shipping, condition and ships-from. 1 point per returned record. | `product`*, `max_items` |
| `run_newegg_products_reviews` | Owner reviews for a Newegg product: rating, title, text, pros, cons, author, date and helpful votes. 1 point per returned record. | `product`*, `max_items`, `start_page` |
| `run_newegg_products_search` | Search Newegg products by keyword with sort: price, rating, seller and stock. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `sort` |
| `run_newegg_sellers` | Get one Newegg marketplace seller store by store key or URL: rating, followers, badges, legal name and location. Flat 5 points per successful run. | `seller`* |
| `run_newegg_sellers_products` | A Newegg marketplace seller's products by store key or store URL. 1 point per returned record. | `seller`*, `max_items`, `start_page` |
| `run_olx_categories` | Full category tree of an OLX marketplace: id, name, alias, parent id, depth, child ids, URL and live offer count. 5 point per returned record. | `domain`, `max_items`, `parent_id`, `level` |
| `run_olx_categories_filters` | Category-specific search filters of an OLX category (keys, types, allowed values and ranges) to use in offers search. 5 point per returned record. | `domain`, `category_id`*, `max_items` |
| `run_olx_offers` | Get one OLX ad by id or URL: price, description, location with coordinates, photos, attributes and seller. 5 point per returned record. | `domain`, `offer`* |
| `run_olx_offers_search` | Search live OLX ads by keyword with category, price, condition, seller type, location, delivery and sort. 1 point per returned record. | `domain`, `keyword`, `max_items`, `start_page`, `sort`, `condition`, `owner_type`, `category_id`, `min_price`, `max_price`, `region_id`, `city_id`, `district_id`, `distance`, `user_id`, `has_delivery` |
| `run_olx_regions` | OLX geography: top-level regions or the cities of one region, with ids and coordinates for offers search. 5 point per returned record. | `domain`, `region_id`, `max_items` |
| `run_olx_users` | Get an OLX seller profile by id, uuid or profile URL: account type, registration, last seen, response time and business details. 5 point per returned record. | `domain`, `user`* |
| `run_olx_users_offers` | A seller's active OLX offers by user id, uuid or profile URL, with category filter and sort. 1 point per returned record. | `domain`, `user`*, `max_items`, `start_page`, `category_id`, `sort` |
| `run_poshmark_items` | Get one Poshmark listing by id or URL: price, brand, size, colors, category, photos, likes/comments, seller and the likers/comments shown on the page. Flat 5 points per successful run. | `item`*, `domain` |
| `run_poshmark_items_comments` | Comments on a Poshmark listing (author, text, date), by listing id or URL. 1 point per returned record. | `item`*, `domain`, `max_items` |
| `run_poshmark_items_likes` | Users who liked a Poshmark listing (handle, name, avatar), by listing id or URL. 1 point per returned record. | `item`*, `domain`, `max_items` |
| `run_poshmark_items_related` | Listings Poshmark shows as related to a listing, by listing id or URL. 1 point per returned record. | `item`*, `domain`, `max_items` |
| `run_poshmark_items_search` | Search live Poshmark listings by keyword with department, category, brand, size, color, price, condition, shipping, availability and sort filters. 1 point per returned record. | `query`, `domain`, `max_items`, `start_page`, `sort`, `availability`, `department`, `condition`, `category`, `subcategory`, `brand`, `size`, `price_min`, `price_max`, `shipping`, `color` |
| `run_poshmark_users` | Get a Poshmark seller's public closet profile by username or URL: bio, location, followers/following/listing counts, items sold and activity. Flat 5 points per successful run. | `user`*, `domain` |
| `run_poshmark_users_followers` | Followers of a Poshmark closet (handle, name, avatar), by username or URL. 1 point per returned record. | `user`*, `domain`, `max_items`, `start_page` |
| `run_poshmark_users_following` | Users a Poshmark closet follows (handle, name, avatar), by username or URL. 1 point per returned record. | `user`*, `domain`, `max_items`, `start_page` |
| `run_poshmark_users_items` | Listings in a Poshmark closet by username or URL, with department, category, brand, size, color, price, condition, shipping, availability and sort filters. 1 point per returned record. | `user`*, `domain`, `max_items`, `start_page`, `sort`, `availability`, `department`, `condition`, `category`, `subcategory`, `brand`, `size`, `price_min`, `price_max`, `shipping`, `color` |
| `run_poshmark_users_search` | Search Poshmark closets by name or handle (username, name, avatar, home region). 1 point per returned record. | `query`*, `domain`, `max_items`, `start_page` |
| `run_rakuten_categories` | Rakuten Ichiba genre tree: the top-level genres, or one genre by id with its breadcrumb path and child genres (with item counts). Flat 5 points per successful run. | `genre_id` |
| `run_rakuten_items` | Get one Rakuten Ichiba item by shop_code/item_code or URL: price range, subscription price, points, shipping, images, rating, category, shop and SKU variants. Flat 5 points per successful run. | `item`* |
| `run_rakuten_items_reviews` | Customer reviews of a Rakuten Ichiba item by shop_code/item_code or URL: rating, text, author, dates, helpful count, purpose tags, SKU, media and shop replies. 1 point per returned record. | `item`*, `max_items`, `start_page` |
| `run_rakuten_items_search` | Search live Rakuten Ichiba items by keyword with sort, condition, price range and genre filters. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `sort`, `condition`, `price_min`, `price_max`, `genre_id` |
| `run_rakuten_shops` | Get one Rakuten Ichiba shop storefront by shop_code or URL: name, description, logo, cover, rating and review count. Flat 5 points per successful run. | `shop`* |
| `run_rakuten_shops_items` | The item catalog of a Rakuten Ichiba shop by shop_code or URL: title, price range, image, points, shipping, rating, category. 1 point per returned record. | `shop`*, `max_items`, `start_page` |
| `run_shopify_collections` | Get one Shopify collection by store domain and handle: title, description, image, product count and timestamps. 5 point per returned record. | `store_domain`*, `collection`* |
| `run_shopify_collections_products` | Products of a Shopify collection with options, variants, prices and availability. 1 point per returned record. | `store_domain`*, `collection`*, `max_items`, `start_page` |
| `run_shopify_products` | Get one Shopify product by store domain and handle: brand, type, tags, images, options and all variants with price, SKU, barcode, availability and stock. 5 point per returned record. | `store_domain`*, `product`* |
| `run_shopify_products_search` | List all products of a Shopify store (not a keyword search) with variants, prices and availability. 1 point per returned record. | `store_domain`*, `max_items`, `start_page` |
| `run_target_categories_products` | List products of a Target category by browse node id or category URL with a sort order. 1 point per returned record. | `category`*, `max_items`, `start_page`, `sort` |
| `run_target_products` | Get one Target product by TCIN or URL: price, ratings breakdown, images, specifications, features, variants, dimensions and return policy. Flat 5 points per successful run. | `product`* |
| `run_target_products_questions` | Customer questions and their answers for a Target product by TCIN or URL. 1 point per returned record. | `product`*, `max_items`, `start_page` |
| `run_target_products_recommendations` | Related products Target shows on a product page: alternatives, guests also viewed, complementary, deals, top performing, new arrivals, similar. 1 point per returned record. | `product`*, `max_items`, `start_page`, `type` |
| `run_target_products_reviews` | Customer reviews of a Target product by TCIN or URL, newest first. 1 point per returned record. | `product`*, `max_items`, `start_page` |
| `run_target_products_search` | Search live Target products by keyword with a sort order (relevance, featured, price, rating, bestselling, newest). 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `sort` |
| `run_trendyol_categories` | Trendyol category tree: 10 departments with nested subcategories (id, name, alias, parent id, URL). Pass a category id or alias to get just that subtree. 5 point per returned record. | `category` |
| `run_trendyol_products` | Get one Trendyol product by contentId or URL: price, brand, rating, attributes, variants, seller and other sellers. Flat 5 points per successful run. | `product`* |
| `run_trendyol_products_reviews` | Customer reviews for a Trendyol product by contentId or URL: rating, text, author, date, likes, seller and photos. 1 point per returned record. | `product`*, `max_items`, `start_page` |
| `run_trendyol_products_sellers` | All sellers offering a Trendyol product by contentId or URL, for price comparison: price, score, stock, free shipping and which offer is featured. Flat 5 points per successful run. | `product`* |
| `run_trendyol_sellers` | Get one Trendyol seller (store) by id or store URL: name, city, score, product count, verified status and shipping/response metrics. Flat 5 points per successful run. | `seller`* |
| `run_trendyol_sellers_products` | A seller's storefront products on Trendyol by seller id or store URL: name, brand, price, rating, image. 1 point per returned record. | `seller`*, `max_items`, `start_page` |
| `run_vinted_products_search` | Search live Vinted items by keyword on any Vinted market, with category, brand, size, condition, color, material and price filters. 1 point per returned record. | `keyword`*, `domain`, `order`, `max_items`, `start_page`, `price_from`, `price_to`, `currency`, `catalog_ids`, `brand_ids`, `size_ids`, `status_ids`, `color_ids`, `material_ids` |
| `run_vinted_users` | Get a Vinted member profile by user id or member URL: location, reputation, feedback and item counts, followers, verification and bundle discounts. Flat 5 points per successful run. | `user`*, `domain` |
| `run_vinted_users_feedbacks` | Feedback (reviews) a Vinted member has received: text, rating, reviewer, the seller's reply and date. 1 point per returned record. | `user`*, `max_items`, `start_page`, `domain` |
| `run_vinted_users_items` | A Vinted member's current wardrobe: title-level data, prices, brand, size, condition, photos, favourites and reserved/closed/hidden flags. 1 point per returned record. | `user`*, `max_items`, `start_page`, `domain` |
| `run_wayfair_products` | Get full Wayfair product details by SKU (or product URL): title, brand, price, list price, discount, rating with per-star breakdown, images, variants, verified status, availability and category. Flat 5 points per successful run. | `product`* |
| `run_wayfair_products_search` | Search Wayfair products by keyword. Returns products with title, brand, price, list price, currency, discount, rating, review count and images. 1 point per returned record. | `keyword`*, `max_items`, `start_page` |
| `run_wayfair_sellers` | Get a Wayfair brand (seller) by id or brand page URL: name, description, logo image, alias and the brand's collections. Flat 5 points per successful run. | `seller`* |
| `run_yahoo_auctions_categories` | Yahoo! Auctions Japan category tree, one level at a time: pass a parent category id (0 for the top-level categories) to get its direct sub-categories (id, Japanese name, URL, parent id). 5 point per returned record. | `max_items`, `start_page`, `category` |
| `run_yahoo_auctions_items` | Get one live or completed Yahoo! Auctions Japan listing by auction id or URL: price, bids, condition, category, description, photos, shipping, payment methods, highest bidders and seller. Flat 5 points per successful run. | `item`* |
| `run_yahoo_auctions_items_closed_search` | Search completed Yahoo! Auctions Japan auctions by keyword and see the price each item actually sold for, with sold-price, condition, region, seller-type and sort filters. 1 point per returned record. | `keyword`*, `keyword_exclude`, `max_items`, `start_page`, `sort`, `condition`, `price_min`, `price_max`, `category`, `brand_id`, `region`, `seller_type`, `free_shipping`, `has_image` |
| `run_yahoo_auctions_items_search` | Search live Yahoo! Auctions Japan listings by keyword and/or category with price, buy-it-now, condition, region, seller, listing-type, appraisal, shipping filters and sort. 1 point per returned record. | `keyword`, `keyword_exclude`, `max_items`, `start_page`, `sort`, `condition`, `price_min`, `price_max`, `buy_now_price_min`, `buy_now_price_max`, `category`, `brand_id`, `region`, `seller_type`, `listing_type`, `marketplace`, `authenticated`, `free_shipping`, `has_image`, `new_arrival`, `ending_within_hour`, `konbini_pickup`, `anonymous_shipping` |
| `run_yahoo_auctions_products` | Get a Yahoo! Auctions Japan catalog product by id or URL: lowest current and buy-it-now price and the live auctions matched to that product. Flat 5 points per successful run. | `product`* |
| `run_yahoo_auctions_sellers` | Get a Yahoo! Auctions Japan seller profile by seller id or URL: display name, rating count, positive-feedback percentage, store/verification badges and profile message. Flat 5 points per successful run. | `seller`* |
| `run_yahoo_auctions_sellers_items` | A seller's live Yahoo! Auctions Japan listings by seller id or URL, with keyword, category, price, condition, region and sort filters. 1 point per returned record. | `seller`*, `keyword`, `keyword_exclude`, `max_items`, `start_page`, `sort`, `condition`, `price_min`, `price_max`, `category`, `brand_id`, `region`, `free_shipping`, `has_image` |
| `run_yahoo_auctions_sellers_reviews` | Feedback comments left for a Yahoo! Auctions Japan seller: verdict, author, auction, comment text and relative date; filter by role and verdict. 1 point per returned record. | `seller`*, `max_items`, `start_page`, `role`, `rating` |
| `run_yahoo_auctions_sellers_reviews_summary` | Aggregated Yahoo! Auctions Japan feedback score of a seller: total and positive percentage as seller/buyer plus positive/neutral/negative counts over the last week, month, 6 months, 100 and 1000 transactions. Flat 5 points per successful run. | `seller`* |
| `run_yandexmarket_categories_products` | List Yandex Market products in a catalog category by id or URL, with sort, price, condition, payment, rating and brand filters. 1 point per returned record. | `category`*, `max_items`, `start_page`, `sort`, `condition`, `price_min`, `price_max`, `payment`, `high_rating`, `vendor_id` |
| `run_yandexmarket_products` | Get one Yandex Market product by id or URL: title, brand, price, rating, category breadcrumbs, seller and spec table. Flat 5 points per successful run. | `product`* |
| `run_yandexmarket_products_search` | Search Yandex Market products by keyword with sort, price, condition, payment, rating, brand and seller filters. 1 point per returned record. | `text`*, `max_items`, `start_page`, `sort`, `condition`, `price_min`, `price_max`, `payment`, `high_rating`, `vendor_id`, `business_id` |
| `run_zalando_brands_products` | Get products of a Zalando brand by brand alias or brand page URL: name, brand, price, list price, discount, currency, image, silhouette, gender, flags and sizes. 1 point per returned record. | `brand`*, `max_items`, `start_page` |
| `run_zalando_products` | Get full Zalando product details by product URL: name, brand, colour, price, list price, discount, 30-day lowest price, images, description, category, stock, sizes with stock levels, attributes (material, care, details) and colour variants. Flat 5 points per successful run. | `product`* |
| `run_zalando_products_related` | Get related products from a Zalando product page (similar, same brand, cross-sell and sponsored recommendations): name, brand, price, discount, image, stock and reason. 1 point per returned record. | `product`*, `max_items`, `start_page` |
| `run_zalando_products_search` | Search Zalando products by keyword with optional brand, size, colour, price range and sort filters. Returns name, brand, colour, gender, price, list price, 30-day lowest price, discount, image and sponsored flag. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `brand`, `sort`, `size`, `color`, `min_price`, `max_price` |

#### Product reviews (15)

| Tool | Description | Parameters |
| --- | --- | --- |
| `run_capterra_products_search` | Search Capterra software products by keyword: name, rating, review count, and image. 1 point per returned record. | `query`*, `max_items` |
| `run_capterra_product` | Get full Capterra product details by id or URL: vendor, pricing, ratings, and features. Flat 5 points per successful run. | `product`* |
| `run_capterra_products_reviews` | Get user reviews for a Capterra product by id or URL: rating, pros/cons, and author. 1 point per returned record. | `product`*, `max_items` |
| `run_capterra_categories` | List Capterra software categories: name, alias, and canonical URL. Flat 5 points per successful run. |  |
| `run_capterra_category_products` | List Capterra products within a software category, ranked as Capterra ranks them. 1 point per returned record. | `category`*, `max_items` |
| `run_gartner_products_search` | Search Gartner Peer Insights products by keyword: name, vendor, and review count. 1 point per returned record. | `query`*, `max_items` |
| `run_gartner_product` | Get full Gartner Peer Insights product details by alias or URL: vendor, ratings, and company profile. Flat 5 points per successful run. | `product`* |
| `run_gartner_vendor` | Get a Gartner Peer Insights vendor profile by alias or URL: markets, products, and ratings. Flat 5 points per successful run. | `vendor`* |
| `run_gartner_categories` | Get the full Gartner Peer Insights category and market taxonomy. Flat 5 points per successful run. |  |
| `run_gartner_market` | Get a Gartner Peer Insights market profile by alias or URL: features, research, and lessons learned. Flat 5 points per successful run. | `market`* |
| `run_gartner_market_products` | List ranked Gartner Peer Insights products within a market, with ratings and vendors. 1 point per returned record. | `market`*, `max_items` |
| `run_gartner_markets_search` | Search Gartner Peer Insights markets (software categories) by keyword. 1 point per returned record. | `query`*, `max_items` |
| `run_trustpilot_search` | Search Trustpilot businesses by keyword: name, domain, rating, and review count. 1 point per returned record. | `query`*, `max_items` |
| `run_trustpilot` | Get full Trustpilot business profile by domain or URL: rating breakdown, claim status, and reply behavior. Flat 5 points per successful run. | `business`* |
| `run_trustpilot_reviews` | Get customer reviews for a Trustpilot business by domain or URL: rating, text, and author. 1 point per returned record. | `business`*, `max_items` |

#### Company Registries (93)

| Tool | Description | Parameters |
| --- | --- | --- |
| `run_au_companies` | Get one company from the Australia registry (ASIC / ABN) by registration number or registry URL: name, status, registration date, address and legal form. Flat 10 points per successful run. | `company`* |
| `run_au_companies_search` | Search the Australia company registry (ASIC / ABN) by company name: name, registration number, status, address and link. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `status` |
| `run_br_companies` | Get one company from the Brazil registry (CNPJ / Receita Federal) by registration number or registry URL: name, status, registration date, address and legal form. Flat 5 points per successful run. | `company`* |
| `run_dk_companies` | Get one company from the Denmark registry (CVR) by registration number or registry URL: name, status, registration date, address and legal form. Flat 5 points per successful run. | `company`* |
| `run_dk_companies_search` | Search the Denmark company registry (CVR) by company name: name, registration number, status, address and link. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `status` |
| `run_ee_companies` | Get one company from the Estonia registry (e-Business Register) by registration number or registry URL: name, status, registration date, address and legal form. Flat 5 points per successful run. | `company`* |
| `run_ee_companies_search` | Search the Estonia company registry (e-Business Register) by company name: name, registration number, status, address and link. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `status` |
| `run_fr_companies` | Get one company from the France registry (RNE / INPI) by registration number or registry URL: name, status, registration date, address and legal form. Flat 30 points per successful run. | `company`* |
| `run_fr_companies_search` | Search the France company registry (RNE / INPI) by company name: name, registration number, status, address and link. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `status` |
| `run_nz_companies` | Get one company from the New Zealand registry (Companies Register) by registration number or registry URL: name, status, registration date, address and legal form. Flat 5 points per successful run. | `company`* |
| `run_nz_companies_search` | Search the New Zealand company registry (Companies Register) by company name: name, registration number, status, address and link. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `status` |
| `run_uk_companies` | Get one company from the United Kingdom registry (Companies House) by registration number or registry URL: name, status, registration date, address and legal form. Flat 30 points per successful run. | `company`* |
| `run_uk_companies_search` | Search the United Kingdom company registry (Companies House) by company name: name, registration number, status, address and link. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `status` |
| `run_be_companies` | Get one company from the Belgium registry (KBO/BCE) by enterprise number or registry URL: name, status, start date, address, legal form, activities, directors, contact details and establishment units. 10 point per returned record. | `company`* |
| `run_be_companies_search` | Search the Belgium company registry (KBO/BCE) by company name: name, enterprise number, status, address and link. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `status` |
| `run_br_companies_search` | Search the Brazil company registry (CNPJ / Receita Federal data) by company name: name, CNPJ, status and link. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `status` |
| `run_no_companies` | Get one company from the Norway registry (Brønnøysundregistrene, Enhetsregisteret) by organisation number or registry URL: name, status, registration date, address, legal form, industry codes and board/signatory roles, share capital, employees, previous names, auditor, liens and related units. 5 point per returned record. | `company`* |
| `run_no_companies_search` | Search the Norway company registry (Brønnøysundregistrene, Enhetsregisteret) by company name: name, organisation number, postal code and place, and link. 1 point per returned record. | `keyword`*, `max_items`, `start_page` |
| `run_co_companies` | Get one company from the Colombia registry (RUES, Registro Mercantil) by NIT or registry URL: name, status, registration date, address, legal form, economic activity, legal representation and establishments. Flat 5 points per successful run. | `company`* |
| `run_co_companies_search` | Search the Colombia company registry (RUES, Registro Mercantil) by name: name, NIT, status, chamber of commerce, category and link. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `status` |
| `run_cz_companies` | Get one company from the Czech Republic commercial register (Justice.cz) by registration number (IČO, 8 digits) or registry URL: name, status, registration date, address and court file number. Also returns legal form, business scope, share capital, officers, shareholders and branches. 5 point per returned record. | `company`* |
| `run_cz_companies_search` | Search the Czech Republic commercial register (Justice.cz) by company name: name, registration number (IČO), status, address and link. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `status` |
| `run_lv_companies` | Get one company from the Latvia registry (Register of Enterprises) by registration number or registry URL: name, status, registration date, address, legal form, capital, officers, shareholders and beneficial owners. Flat 5 points per successful run. | `company`* |
| `run_lv_companies_search` | Search the Latvia company registry (Register of Enterprises) by company name or registration number: name, registration number, status, address and link. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `status` |
| `run_pl_companies` | Get one company from the Poland registry (KRS) by KRS number or registry link: name, status, registration date, address, legal form, NIP/REGON, representatives, capital, shareholders, branches, history. Flat 5 points per successful run. | `company`* |
| `run_pl_companies_search` | Search the Poland company registry (KRS) by company name: name, KRS number, city, register and flags. 1 point per returned record. | `keyword`*, `max_items`, `start_page` |
| `run_sk_companies` | Get one company from the Slovakia Commercial Register (Obchodný register SR) by IČO or registry URL: name, status, registration date, address, legal form, activities and board, with full history. 10 point per returned record. | `company`* |
| `run_sk_companies_search` | Search the Slovakia Commercial Register (Obchodný register SR) by the beginning of the business name: name and link to the registry extract. 1 point per returned record. | `keyword`*, `max_items`, `start_page` |
| `run_at_companies` | Get one company from the Austria registry (Firmenbuch) by registration number (FN) or registry URL: name, status, legal form, address, previous names and the paid extracts offered. Flat 5 points per successful run. | `company`* |
| `run_at_companies_search` | Search the Austria company registry (Firmenbuch) by company name or FN: name, registration number, status, seat and link. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `status` |
| `run_fi_companies` | Get one company from the Finland registry (PRH / YTJ) by Business ID (Y-tunnus) or registry URL: name, status, registration date, address, legal form, names, registrations, tax debt status and Business ID history. Flat 5 points per successful run. | `company`* |
| `run_fi_companies_search` | Search the Finland company registry (PRH / YTJ) by company name: name, Business ID, status, municipality and link. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `status` |
| `run_kr_companies` | Get one company from the South Korea registry (DART) by DART corp code, stock code or registry link: name, English name, market, registration numbers, address, industry, established date, representatives, name history and representative history. 15 point per returned record. | `company`* |
| `run_kr_companies_search` | Search the South Korea company registry (DART) by company name or stock code: name, DART corp code, market, stock code and link. 1 point per returned record. | `keyword`*, `max_items`, `start_page` |
| `run_nl_companies` | Get one company from the Netherlands registry (KVK Handelsregister) by KVK number or registry URL: name, status, registration date, address, legal form and establishments. Flat 5 points per successful run. | `company`* |
| `run_nl_companies_search` | Search the Netherlands company registry (KVK Handelsregister) by company name: name, registration number, status, address and link. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `status` |
| `run_bg_companies` | Get one company from the Bulgaria registry (Commercial Register) by UIC (ЕИК) or registry link: name, status, first registration date, address and contacts, legal form, activity, capital and shares, representatives and board, procuracy, trade-undertaking transfers, mergers, predecessors/successors, liquidation, beneficial owners (NPLE), registrar instructions and court case files. 15 point per returned record. | `company`* |
| `run_bg_companies_search` | Search the Bulgaria company registry (Commercial Register) by company name or UIC: name, UIC (ЕИК), legal form and card link. 1 point per returned record. | `keyword`*, `max_items`, `start_page` |
| `run_cy_companies` | Get one organisation from the Cyprus registry (Registrar of Companies, DRCOR) by registration number (HE, EE, AE, S, BN prefix) or registry link: name, status, registration date, registered office, type, previous names, directors / secretaries / partners, annual fees paid and counters. 10 point per returned record. | `company`* |
| `run_cy_companies_search` | Search the Cyprus company registry (Registrar of Companies, DRCOR) by name: name, registration number, type, status and link. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `status` |
| `run_hr_companies` | Get one company from the Croatia registry (Sudski registar) by MBS, OIB or registry link: name, status, registration date, address, legal form, capital, activities, members, supervisory board, representatives, legal relations and the list of filed financial reports. 5 point per returned record. | `company`* |
| `run_hr_companies_search` | Search the Croatia company registry (Sudski registar) by company name: name, MBS, OIB, status, address, court and link. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `status` |
| `run_lu_companies` | Get one company from the Luxembourg registry (LBR / RCS) by RCS number or registry link: name, status (radiée / en faillite), registration and deletion date, address, legal form, trade names, NACE code, and EUID. 5 point per returned record. | `company`* |
| `run_lu_companies_search` | Search the Luxembourg company registry (LBR / RCS) by company name or RCS number: name, RCS number, status (radiée / en faillite) and link. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `status` |
| `run_si_companies` | Get one company from the Slovenia registry (AJPES PRS) by registration number (matična številka) or registry link: name, short name, status (active/deleted), address, tax and VAT number, number of business units and the list of those units. 10 point per returned record. | `company`* |
| `run_si_companies_search` | Search the Slovenia company registry (AJPES PRS) by company name: name, short name, registration number (matična številka), status (active/deleted), address, tax/VAT number and link. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `status` |
| `run_tw_companies` | Get one company from the Taiwan registry (MOEA) by 統一編號 or registry link: name, status, registration date, address, company type, capital and shares, representative, business scope, directors, managers, branches, factories, warehouses, stock listing, trademarks and change history. 15 point per returned record. | `company`* |
| `run_tw_companies_search` | Search the Taiwan company registry (MOEA) by company name or 統一編號: name, registration number, status, address, registration authority and link. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `status` |
| `run_bg_company_filings` | List the announced acts of a Bulgaria company (Commercial Register) by UIC (ЕИК) or registry URL, newest first: announcement date, act type, title and document link (annual reports, notices, reports, current articles). 1 point per returned record. | `company`*, `max_items`, `start_page` |
| `run_cy_company_filings` | List the filings of one Cyprus organisation (Registrar of Companies, DRCOR) by registration number or registry link: file documents, charges and mortgages, translations, annual returns (HE32) or pending services, with form, date and page number. 1 point per returned record. | `company`*, `list`, `max_items`, `start_page` |
| `run_cz_company_filings` | List the documents filed in the Czech Republic Collection of Documents (Sbírka listin, Justice.cz) for one company, by IČO or registry URL, newest first: document number, type, description, period, filing dates, pages and link. 1 point per returned record. | `company`*, `max_items`, `start_page` |
| `run_hr_company_filings` | List the announcements (Objave) or the document collection (Zbirka isprava) of one company in the Croatia registry (Sudski registar), newest first: date, type, topic, case number and file link. 1 point per returned record. | `company`*, `list`, `max_items`, `start_page` |
| `run_kr_company_filings` | List the filings of one South Korea company (DART) by DART corp code, stock code or registry link, newest first: report id, report name, filer, filing date, correction flag, remarks and link. 1 point per returned record. | `company`*, `max_items`, `start_page` |
| `run_lu_company_filings` | List the RESA publications of one Luxembourg company (LBR / RCS), newest first: publication number, date, type, details and consult mode. 1 point per returned record. | `company`*, `max_items`, `start_page` |
| `run_lv_company_filings` | List the filed annual reports of a Latvia company (Register of Enterprises) by registration number or registry URL, newest first: financial year, type and link. 1 point per returned record. | `company`*, `max_items`, `start_page` |
| `run_no_company_filings` | List the registry announcements (Kunngjøringer) of a Norway company (Brønnøysundregistrene) by organisation number or registry URL, newest first: date, announcement type and link. 1 point per returned record. | `company`*, `max_items`, `start_page` |
| `run_pl_company_filings` | List the filed financial documents (annual and consolidated statements, auditor opinions, approval resolutions, management reports) and register entries of a Poland company (KRS) by KRS number or registry link, newest first: date, type, period and entry details. 1 point per returned record. | `company`*, `max_items`, `start_page` |
| `run_dk_company_filings` | Annual reports, announcements and registrations of one Danish company (CVR): date, type, description and document links. 1 point per returned record. | `company`*, `max_items`, `start_page` |
| `run_ee_company_documents` | Annual reports and documents of one Estonian company (e-Business Register): date, type, title and download links. 1 point per returned record. | `company`*, `max_items`, `start_page` |
| `run_nz_company_documents` | Documents filed by one New Zealand company (Companies Register): date, type and file links. 1 point per returned record. | `company`*, `max_items`, `start_page` |
| `run_ro_companies` | Get one company from the Romania registry data (Ministry of Finance / ONRC) by CUI (CIF): name, status and registration date, address, trade register number, authorization act, phone/fax, tax registrations (profit tax, VAT, social contributions, ...) and the latest filed financial indicators (assets, debts, equity, turnover, profit, employees). 15 point per returned record. | `company`* |
| `run_ro_companies_search` | Search the Romania company registry (Ministry of Finance / ONRC data) by company name: name and CUI. Bucharest by default, add "@ cluj" (county name or code) to the keyword to search another county. All words must appear in the name. 1 point per returned record. | `keyword`*, `max_items`, `start_page` |
| `run_uk_company_filings` | Filing history of one UK company (Companies House): date, type, description and document link. 1 point per returned record. | `company`*, `max_items`, `start_page` |
| `run_es_companies` | Get one company from the Spain registry (Registro Mercantil, Registradores de España open-data directory) by NIF/CIF or registry link: name, status (Vigente / Liquidada / Concurso), address, legal form, registry office and sheet number, IRUS and EUID identifiers, CNAE/NACE activity, website, special situation, administrators and officers with their roles, and other registry entries under the same NIF such as branches. 10 point per returned record. | `company`* |
| `run_es_companies_search` | Search the Spain company registry (Registro Mercantil, Registradores de España open-data directory) by company name, brand or NIF: name, NIF/CIF, status, address, legal form, registry office, sheet number, EUID, CNAE activity and link. 2 point per returned record. | `keyword`*, `max_items`, `start_page`, `status` |
| `run_pt_companies` | Get one company from the Portugal registry (Registo Comercial publications portal) by NIF/NIPC or registry link: name, legal form, registered seat (street, postal code, locality, parish, municipality, district), number of publications and the newest publication. 15 point per returned record. | `company`* |
| `run_pt_companies_search` | Search the Portugal company registry (Registo Comercial publications portal) by entity name: name, NIF/NIPC, municipality and the date and type of the newest publication. 2 point per returned record. | `keyword`*, `max_items`, `start_page` |
| `run_pt_company_filings` | List the publications of a Portugal company (Registo Comercial publications portal) by NIF/NIPC or registry link, newest first: date, act type (registry acts, accounts deposits, notices, convocations), municipality and whether a text / attachment exists. 2 point per returned record. | `company`*, `max_items`, `start_page` |
| `run_se_companies` | Get one company from the Sweden registry (Bolagsverket) by organisation number or registry link: name, status history, registration date, address, legal form, municipality and county, special and foreign-language business names. 5 point per returned record. | `company`* |
| `run_se_companies_search` | Search the Sweden company registry (Bolagsverket) by company name or organisation number: name, organisation number, status, city, legal form and card link. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `status` |
| `run_se_company_filings` | List the most recent registry cases of a Sweden company (Bolagsverket) by organisation number or registry URL, newest first: case number, type (annual report, interim report, register update...), status, arrival and registration dates, financial period. 1 point per returned record. | `company`*, `max_items`, `start_page` |
| `run_ar_companies` | Get one company from the Argentina registry of legal entities (Registro Nacional de Sociedades, IGJ) by CUIT or registry link: name, company type, contract date, legal and fiscal address, activities and last update. 5 point per returned record. | `company`* |
| `run_ar_companies_search` | Search the Argentina registry of legal entities (Registro Nacional de Sociedades, IGJ) by company name or CUIT: name, CUIT, company type, address, main activity and link. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `status` |
| `run_ca_companies` | Get one federal corporation from the Corporations Canada registry by corporation number or registry link: name, status, incorporation date, registered office address, governing legislation, directors, individuals with significant control, annual filings and name history. 5 point per returned record. | `company`* |
| `run_ca_companies_search` | Search federal corporations in the Corporations Canada registry by name, corporation number or business number: name, corporation number, status, business number and link. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `status` |
| `run_ca_company_filings` | Certificates and filings of one federal corporation in the Corporations Canada registry: date, type and amendment details. 1 point per returned record. | `company`*, `max_items`, `start_page` |
| `run_ec_companies` | Get one company from the Ecuador registry (Superintendencia de Compañías) by expediente number or RUC: expediente, RUC and registered name. 5 point per returned record. | `company`* |
| `run_ec_companies_search` | Search the Ecuador company registry (Superintendencia de Compañías) by company name: expediente number, RUC and name (the registry returns up to 15 matches per search). 1 point per returned record. | `keyword`*, `max_items` |
| `run_ge_companies` | Get one company from the Georgia registry (NAPR) by identification code: name, status and legal form. 5 point per returned record. | `company`* |
| `run_ge_companies_search` | Search the Georgia company registry (NAPR) by company name or identification code: name, registration number, status and legal form. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `status` |
| `run_il_companies` | Get one company from the Israel registry (Corporations Authority) by company number: Hebrew and English name, status, registration date, address, company type, liability, purpose and last annual report year. 5 point per returned record. | `company`* |
| `run_il_companies_search` | Search the Israel company registry (Corporations Authority) by company name or company number: name, registration number, status, address, company type and registration date. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `status` |
| `run_mx_companies` | Get one company notice from the Mexican Registro Público de Comercio publications (PSM) by publication number: company name, legal form, publication type, title and date, a link to the published text and the publication history. 5 point per returned record. | `company`* |
| `run_mx_companies_search` | Search Mexican companies by name in the company publications of the Registro Público de Comercio (PSM): name, legal form and the latest publication with its number, type, title and date. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `status` |
| `run_pa_companies` | Get one entity from the Panama Registro Público (Consulta de Folios Suspendidos) by folio or registry link: name, status, register type, incorporation date and status date. Covers suspended, dissolved, merged and closed entities. 5 point per returned record. | `company`* |
| `run_pa_companies_search` | Search the Panama Registro Público (Consulta de Folios Suspendidos) by company name or folio number: name, folio, status, register type, incorporation date and status date. Covers suspended, dissolved, merged and closed entities. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `status` |
| `run_gleif_companies` | Get one LEI record from the Global LEI Index by LEI code or search.gleif.org link, with the Current Data tab of the page: names, legal form, registration authority, categories, BIC/ISIN codes, addresses, registration and issuer details, fund and branch relationships, and direct and ultimate parents. 5 point per returned record. | `company`* |
| `run_gleif_companies_search` | Search the Global LEI Index by company name or LEI code: LEI, name, LEI status, address, legal form code, creation date, category, jurisdiction, registration dates and managing issuer. Filter by active or inactive LEI, exact LEI status, entity category and country. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `status`, `reg_status`, `category`, `country` |
| `run_lei_lookup_companies` | Get one Legal Entity Identifier record by LEI code or lei-lookup.com link: name, entity and LEI status, registration and renewal dates, managing issuer, legal form, registration authority, legal and headquarters addresses, parent companies and the number of subsidiaries. 5 point per returned record. | `company`* |
| `run_lei_lookup_companies_search` | Search the public register of Legal Entity Identifiers by company name or LEI code: LEI, name, country, entity status, LEI registration status and link. Filter by entity status (active or inactive), LEI registration status and country. 1 point per returned record. | `keyword`*, `max_items`, `start_page`, `status`, `reg_status`, `country` |
| `run_lei_lookup_company_relationships` | Subsidiaries of one legal entity in the LEI register (direct and ultimate children): LEI, name, type of relationship and link. 1 point per returned record. | `company`*, `max_items`, `start_page` |
| `run_mx_company_publications` | All published notices of one company in the Mexican Registro Público de Comercio publications (PSM): assemblies, balances, capital and structure changes, with date, type, title and a link to the published text. 1 point per returned record. | `company`*, `max_items`, `start_page` |
| `run_sk_company_filings` | List the documents in the Slovakia Commercial Register collection of documents (Zbierka listín) for one company, by IČO or registry URL: document name, type, delivery date and whether an electronic copy exists. 1 point per returned record. | `company`*, `max_items`, `start_page` |

#### Startup & Funding Data (93)

| Tool | Description | Parameters |
| --- | --- | --- |
| `run_betalist_startups` | Get one startup from BetaList by slug or URL: name, tagline, description, makers, topics, launch date, screenshots and similar startups. Flat 5 points per successful run. | `startup`* |
| `run_betalist_startups_latest` | The newest startups on BetaList, newest first: name, tagline, logo and link. 1 point per returned record. | `max_items`, `start_page` |
| `run_betalist_startups_search` | Search BetaList startups by keyword: name, tagline, logo and link. 1 point per returned record. | `keyword`*, `max_items`, `start_page` |
| `run_betalist_topics_startups` | Startups of one BetaList topic (slug like generative-ai, category/topic, or a BetaList topic URL): name, tagline, logo and link. 1 point per returned record. | `topic`*, `max_items`, `start_page` |
| `run_dealroom_companies` | Get one company from Dealroom by slug or URL: tagline, HQ, founding year, sector, tier, valuation / revenue / headcount ranges, investors by round, ownership, funding events, alumni founders, footprint and investments. Dealroom shows ranges, not exact values, without a login. Flat 5 points per successful run. | `company`* |
| `run_dealroom_companies_search` | Search Dealroom companies by keyword and/or tier, sector and country: name, tier, sector, HQ, founding year, numeric valuation and range, logo and link. At least one of keyword / tier / sector / country is required. 1 point per returned record. | `keyword`, `tier`, `sector`, `country`, `sort`, `max_items`, `start_page` |
| `run_dealroom_investors` | Get one investor from Dealroom by slug or URL: type, HQ, rank, portfolio / unicorn / investment counts, links, biggest holdings, exits, portfolio analysis, market map, similar investors and key people. Flat 5 points per successful run. | `investor`* |
| `run_dealroom_investors_search` | Search the Dealroom investor index by name keyword, type and country, ordered by Dealroom rank: name, type, country, HQ, portfolio companies, rank and link. With no filters it returns the top of the index. 1 point per returned record. | `keyword`, `type`, `country`, `max_items`, `start_page` |
| `run_eustartups_directory` | Get one startup from the EU-Startups database by slug or URL: tagline, description, country, city, tags, founding year, total funding, website, status, social links and related articles. Flat 5 points per successful run. | `company`* |
| `run_eustartups_directory_search` | Search the EU-Startups startup database by country category (e.g. german-startups) or by keyword: name, city, tags, founding year, logo and link. Provide a country or a keyword. 1 point per returned record. | `country`, `keyword`, `max_items`, `start_page` |
| `run_eustartups_investors` | Get one investor from the EU-Startups investor database by slug or URL: type, HQ country, website, investment areas, typical investment, funding stages, LinkedIn and contact email. Flat 5 points per successful run. | `investor`* |
| `run_eustartups_investors_search` | Search the EU-Startups investor database by name, type and HQ country: type, HQ, investment areas, typical investment, funding stage and link. All filters are optional. 1 point per returned record. | `keyword`, `type`, `country`, `max_items`, `start_page` |
| `run_futurepedia_categories` | AI tool categories of Futurepedia with the number of tools in each and the group they belong to (the top sub-categories shown on the Futurepedia categories page). Optional group filter. Flat 5 points per successful run. | `group` |
| `run_futurepedia_tools` | Get one AI tool from Futurepedia by slug or URL: description, rating and review count, categories, pricing, key features, pros and cons, use cases, pricing plans, rating breakdown and social links. Flat 5 points per successful run. | `tool`* |
| `run_futurepedia_tools_alternatives` | Alternatives to one Futurepedia AI tool (slug or URL): name, description, pricing, rating, categories and link. 1 point per returned record. | `tool`*, `max_items` |
| `run_futurepedia_tools_reviews` | User reviews of one Futurepedia AI tool (slug or URL): rating, review text and reviewer name. 1 point per returned record. | `tool`*, `max_items` |
| `run_futurepedia_tools_search` | List the AI tools of one Futurepedia category (slug like video-generators or a category URL) with sorting, pricing, feature and verified filters: name, description, pricing, rating, categories and link. 1 point per returned record. | `category`*, `max_items`, `start_page`, `sort`, `pricing`, `feature`, `verified_only` |
| `run_indiegogo_campaigns` | Get one Indiegogo campaign by slug or URL: goal, funds raised, backers, phase and outcome, category, tags, story, risks, refund policy, stretch goals, creator and the number of perks. Flat 5 points per successful run. | `campaign`* |
| `run_indiegogo_campaigns_search` | Search Indiegogo (and Gamefound) projects by keyword and category, phase, benefit, tag, creator and player-count filters: name, tagline, goal, funds raised, backers, phase, dates, creator and link. 1 point per returned record. | `term`, `max_items`, `start_page`, `sort`, `creator_id`, `tags`, `phases`, `benefits`, `player_counts`, `categories` |
| `run_indiehackers_ideas_search` | Browse the Indie Hackers Ideas database, optionally by category: company, one-line idea, categories and MRR. 1 point per returned record. | `category`, `max_items`, `start_page` |
| `run_indiehackers_posts` | Get one Indie Hackers post by its slug or URL: title, full text, author, publish date, upvotes, comment count and the product it belongs to. Flat 5 points per successful run. | `post`* |
| `run_indiehackers_posts_comments` | List the comments of one Indie Hackers post (threaded: depth and parent id): text, author, upvotes and date. 1 point per returned record. | `post`*, `max_items`, `start_page` |
| `run_indiehackers_posts_search` | Indie Hackers post feeds: the top posts of a week, month or all time, or the newest posts, with author, upvotes and comment counts. 1 point per returned record. | `sort`, `period`, `date`, `max_items` |
| `run_indiehackers_products` | Get one product from Indie Hackers by slug or URL: name, tagline, description, website, Twitter, self-reported monthly revenue, founders and the product's updates. Flat 5 points per successful run. | `product`* |
| `run_indiehackers_products_search` | Browse the Indie Hackers products directory by sort, category, business model and monthly revenue range: name, tagline and self-reported revenue. 1 point per returned record. | `sort`, `category`, `business_model`, `monthly_revenue_min`, `monthly_revenue_max`, `max_items` |
| `run_indiehackers_users` | Get one Indie Hackers member by username or profile URL: name, bio, products with revenue and the latest activity. Flat 5 points per successful run. | `user`* |
| `run_kickstarter_projects` | Get one Kickstarter project by creator/project or URL: goal, pledged, backers, state, dates, creator, category, location, story, risks and counters of rewards, updates, comments and FAQ. Flat 5 points per successful run. | `project`* |
| `run_kickstarter_projects_search` | Search Kickstarter projects by keyword, category, state, staff picks, location and funding ranges: name, blurb, goal, pledged, backers, creator, category and link. 1 point per returned record. | `term`, `category`, `state`, `sort`, `raised`, `staff_picks`, `location_id`, `max_items`, `start_page`, `goal_min`, `goal_max`, `pledged_min`, `pledged_max`, `raised_min`, `raised_max` |
| `run_owler_companies` | Get one company from Owler by slug or URL: description, founded year, headquarters, CEO, revenue and employee estimates, full funding rounds with investors, acquisitions, investments, competitors and latest news. Flat 10 points per successful run. | `company`* |
| `run_owler_companies_competitors` | Competitors of one Owler company (slug or URL): name, link, CEO, revenue, employees, funding, headquarters and sector. 1 point per returned record. | `company`*, `max_items`, `start_page` |
| `run_owler_companies_news` | Latest news about one Owler company (slug or URL): title, summary, publisher, date and link. 1 point per returned record. | `company`*, `news_type`, `max_items` |
| `run_owler_companies_search` | Search Owler companies by name (the site's own suggestion list): company id, name, logo and profile link. 1 point per returned record. | `keyword`*, `max_items` |
| `run_pitchbook_companies` | Get the public profile preview of a company by PitchBook id or URL: description, website, founded year, status, employees, industries, parent company, address, social links, FAQs, the latest deals, competitors, investors, investments, affiliates and patent tables shown in the free preview, verticals, related research and news. Flat 5 points per successful run. | `company`* |
| `run_pitchbook_investors` | Get the public profile preview of an investor by PitchBook id or URL: description, website, founded year, status, investor types, address, social links, FAQs, counters (investments, portfolio, exits), the latest investments, exits, co-investors and affiliates shown in the free preview, related research and news. Flat 5 points per successful run. | `investor`* |
| `run_pitchbook_profiles_search` | Search PitchBook public profile previews by keyword: name, type (company / investor / fund), profile id and link. 1 point per returned record. | `keyword`*, `type`, `max_items`, `start_page` |
| `run_pitchwall_products` | Get one product from PitchWall by slug or URL: tagline, full description with pricing and FAQs, website, topics, publish date, social accounts, screenshots and submitter. Flat 5 points per successful run. | `product`* |
| `run_pitchwall_products_search` | List the newest PitchWall products, or the products of one topic (tag): name, tagline, website, topics, publish date and link. The topic is optional. 1 point per returned record. | `topic`, `max_items`, `start_page` |
| `run_producthunt_categories` | Products of a Product Hunt category: name, tagline, rating, review count, launches and categories. 1 point per returned record. | `category`*, `max_items`, `start_page` |
| `run_producthunt_categories_list` | The Product Hunt categories with their sub-categories: name, slug, parent and description. Flat 5 points per successful run. |  |
| `run_producthunt_collections` | Products of a Product Hunt collection in the curator's order, with the full list paged beyond the first 20. 1 point per returned record. | `collection`*, `max_items`, `start_page` |
| `run_producthunt_collections_search` | Browse Product Hunt collections page by page, or search them by keyword. 1 point per returned record. | `keyword`, `max_items`, `start_page` |
| `run_producthunt_forums_search` | Browse Product Hunt forum threads page by page, or search them by keyword. 1 point per returned record. | `keyword`, `max_items`, `start_page` |
| `run_producthunt_forums_threads` | Top-level comments of a Product Hunt forum thread: text, author, votes, reply count and date, all pages. 1 point per returned record. | `thread`*, `max_items`, `start_page` |
| `run_producthunt_launches` | Get one Product Hunt launch by slug or URL: tagline, votes, comments, daily / weekly / monthly rank, dates, topics, link and the product it belongs to. Flat 5 points per successful run. | `launch`* |
| `run_producthunt_launches_search` | Search Product Hunt launches by keyword: name, date and the product behind each launch. 1 point per returned record. | `keyword`*, `max_items`, `start_page` |
| `run_producthunt_leaderboards` | Launches of a Product Hunt leaderboard (day, week, month or year): rank, name, tagline, votes, comments, topics and product link, beyond the first page. 1 point per returned record. | `period`, `date`*, `featured`, `max_items`, `start_page` |
| `run_producthunt_products` | Get one product from Product Hunt by slug or URL: tagline, description, website, rating, review count, followers, launches, categories, social links, pros and cons, makers, awards and similar products. Flat 5 points per successful run. | `product`* |
| `run_producthunt_products_alternatives` | Alternatives of a Product Hunt product with their rating and similarity score, all pages. 1 point per returned record. | `product`*, `max_items`, `start_page` |
| `run_producthunt_products_customers` | Customers of a Product Hunt product (products whose makers say they use it) with the shoutout note. 1 point per returned record. | `product`*, `max_items`, `start_page` |
| `run_producthunt_products_launches` | Launches of a Product Hunt product: votes, comments, ranks and dates, all pages. 1 point per returned record. | `product`*, `max_items`, `start_page` |
| `run_producthunt_products_reviews` | Reviews of a Product Hunt product (all review types): rating, text, reviewer, date and alternatives mentioned, all pages. 1 point per returned record. | `product`*, `max_items`, `start_page` |
| `run_producthunt_products_search` | Search Product Hunt products by keyword: name, tagline, rating, review count, logo and link. 1 point per returned record. | `keyword`*, `max_items`, `start_page` |
| `run_producthunt_topics` | Products of a Product Hunt topic: name, tagline, rating, review count, launches and categories. 1 point per returned record. | `topic`*, `max_items`, `start_page` |
| `run_producthunt_users` | Get one Product Hunt user by username or URL: name, headline, about, followers, submitted launches, products, collections, reviews, links and join date. Flat 5 points per successful run. | `user`* |
| `run_producthunt_users_collections` | Collections of a Product Hunt user with their size and first products, all pages. 1 point per returned record. | `user`*, `max_items`, `start_page` |
| `run_producthunt_users_comments` | Comments of a Product Hunt user, taken from their activity feed (comments filter), all pages. 1 point per returned record. | `user`*, `max_items`, `start_page` |
| `run_producthunt_users_launches` | Launches submitted by a Product Hunt user: votes, comments, ranks and dates, all pages. 1 point per returned record. | `user`*, `max_items`, `start_page` |
| `run_producthunt_users_stacks` | Products in a Product Hunt user's stack with who recommended them. 1 point per returned record. | `user`*, `max_items` |
| `run_producthunt_users_upvotes` | Launches a Product Hunt user upvoted, newest first: votes, comments, ranks and dates. The site serves at most the latest 200 upvotes of a user. 1 point per returned record. | `user`*, `max_items`, `start_page` |
| `run_seedrs_businesses` | Get one funded business from the Republic Europe (Seedrs) secondary-market page by slug or URL: description, sector, available shares, indicative valuation and its change, eligibility and incorporation date. Flat 5 points per successful run. | `business`* |
| `run_seedrs_campaigns` | Get one Republic Europe (Seedrs) campaign by slug or URL: raised and target amounts, valuation, equity offered, share price, investors, tax relief, company number, sectors, links, highlights and the pitch text. Flat 5 points per successful run. | `campaign`* |
| `run_seedrs_campaigns_search` | Search the live Republic Europe (Seedrs) campaigns by campaign-name word and sector, impact tag, business type, tax relief and pitch type filters: raised and target amounts, valuation, investors, type, status and link. 1 point per returned record. | `search`, `max_items`, `sort`, `trending_in`, `include_prereg`, `types`, `tax_eligibilities`, `sectors`, `business_types`, `tags` |
| `run_techeu_companies` | Get one company from Tech.eu Funding Explorer by id or URL: description, location, sectors, every funding round with investors, exit and funding-signal estimates. Flat 5 points per successful run. | `company`* |
| `run_techeu_exits_search` | Search European startup exits and M&A (Tech.eu Funding Explorer, CC BY 4.0), newest first: company, date, type, value in EUR and acquirer. 1 point per returned record. | `country`, `from`, `to`, `max_items`, `start_page` |
| `run_techeu_investors` | Get one investor profile from Tech.eu Funding Explorer by name or URL: deals, portfolio, biggest deals, co-investors, sector / stage / country focus. Flat 5 points per successful run. | `investor`* |
| `run_techeu_investors_search` | Search the Tech.eu investor directory by name: type, number of deals and companies, top sector and active years. 1 point per returned record. | `keyword`, `type`, `sort`, `max_items`, `start_page` |
| `run_techeu_rounds_search` | Search European startup funding rounds (Tech.eu Funding Explorer, CC BY 4.0), newest first: company, amount in EUR, stage, investors, date and source. Filter by country, stage, sector, minimum amount and dates. 1 point per returned record. | `country`, `stage`, `sector`, `minAmount`, `from`, `to`, `max_items`, `start_page` |
| `run_theresanaiforthat_companies` | Get one company from There's An AI For That by slug or URL: description, industry, location, website, socials, AI-native flag, employees, valuation, ranks and its tools. Flat 5 points per successful run. | `company`* |
| `run_theresanaiforthat_countries` | AI ecosystem ranking of countries from There's An AI For That: region, AI market cap, population, AI investment per capita and the number of companies, organizations, investors, tools, models, papers, devices, robots and fundraises. Optional region filter. Flat 5 points per successful run. | `area` |
| `run_theresanaiforthat_tasks` | Get one task (category) from There's An AI For That by slug or URL: number of tools, models, robots and devices, subscribers, most popular tool, subtasks, related tasks and the top tools. Flat 5 points per successful run. | `task`* |
| `run_theresanaiforthat_tools` | Get one AI tool from There's An AI For That by slug or URL: tagline, description, website, pricing, rating and its breakdown, views, saves, task, company, country, features, releases, pros and cons, FAQ and counters of alternatives and reviews. Flat 5 points per successful run. | `tool`* |
| `run_theresanaiforthat_tools_alternatives` | Alternatives and similar tools of one There's An AI For That tool (top alternatives and "if you liked" recommendations): name, short description, task, price, rating, views and link. 1 point per returned record. | `tool`*, `max_items` |
| `run_theresanaiforthat_tools_reviews` | Reviews and comments of one There's An AI For That tool: text, star rating, date, release, votes and author. 1 point per returned record. | `tool`*, `max_items` |
| `run_theresanaiforthat_tools_search` | Search AI tools on There's An AI For That by keyword or task name: name, short description, task, price, rating, views, saves and link. Sorting and tool type apply to task names (for example seo or video editing). Paid placements are skipped. 1 point per returned record. | `keyword`*, `sort`, `tool_type`, `max_items`, `start_page` |
| `run_tracxn_companies` | Get one company from Tracxn by profile URL or id token: description, website, founding year, location, stage, sectors, total funding, latest round, valuation, investors, revenue band, employee count, competitors, legal entities, board, the 3 latest funding rounds and news. Flat 5 points per successful run. | `company`* |
| `run_tracxn_companies_funding` | Get all funding rounds and the investor list of one Tracxn company (profile URL or id token): date, amount, round name, lead and other investors, plus the first-investment line of the institutional investors. Flat 5 points per successful run. | `company`* |
| `run_tracxn_companies_search` | Get the companies of a Tracxn list page (an explore list such as Auto Tech startups in India, or a sector /companies page): name, description, founded year, location, stage, total funding, investors, Tracxn score, competitor rank. 1 point per returned record. | `explore`*, `max_items` |
| `run_tracxn_geographies` | Get one country startup landscape from Tracxn by URL or id token: totals, top companies and investors, recent funding rounds, acquisitions, IPOs and news. Flat 5 points per successful run. | `geography`* |
| `run_tracxn_investors` | Get one investor (VC, PE, angel network, family office ...) from Tracxn by profile URL or id token: type, founding year, headquarters, portfolio and unicorn / IPO / acquisition counts, top investments, yearly / stage / sector / geography breakdowns, recent investments, team, co-investors and news. Flat 5 points per successful run. | `investor`* |
| `run_tracxn_legal_entities` | Get one registered legal entity from Tracxn by URL or id token: CIN, status, type, incorporation date, registrar, capital, address, brands, business activity, recent filings, directors and signatories. Flat 5 points per successful run. | `entity`* |
| `run_tracxn_legal_entities_search` | Search 21.9M registered legal entities in Tracxn by name or CIN in one of 13 countries (default India): name, CIN, incorporation date, status, associated brands and link. 1 point per returned record. | `query`*, `country`, `max_items` |
| `run_tracxn_people` | Get one founder / angel investor / board member from Tracxn by profile URL or id token: roles, founded companies, board memberships, angel investments, portfolio exits and top news. Flat 5 points per successful run. | `person`* |
| `run_tracxn_sectors` | Get one Tracxn sector overview by URL or id token: company / funding / unicorn / IPO / acquisition totals, top companies and investors, founding and funding trends by year and country, recent rounds, acquisitions, IPOs and news. Flat 5 points per successful run. | `sector`* |
| `run_tracxn_unicorns_search` | List the unicorn startups of a country from Tracxn Unicorn Club (newest first): rank, name, description, founded year, location, stage, sectors, time to unicorn, top investors, employees, total funding, join date. 1 point per returned record. | `country`*, `max_items`, `start_page` |
| `run_wefunder_companies` | Get one WeFunder company by slug or URL: tagline, location, total raised and investors, current round (valuation, minimum investment, closing date), highlights, team, featured investors, memos, perks, FAQ and the latest updates and questions. Flat 5 points per successful run. | `company`* |
| `run_wefunder_companies_search` | Browse WeFunder campaigns by status, instrument and industry / highlight tags: name, tagline, raise progress, investors, valuation terms, founder and link. 1 point per returned record. | `status`, `security`, `industries`, `highlights`, `sort`, `max_items`, `start_page` |
| `run_wellfound_companies` | Get one company from Wellfound by slug or URL: description, size, stage, total raised, funding rounds, founders, tags, locations and open jobs. Flat 5 points per successful run. | `company`* |
| `run_wellfound_jobs_search` | Search Wellfound jobs by role and location: job title, pay, locations, description and the hiring company (size, stage, tags). 1 point per returned record. | `role`*, `location`*, `max_items`, `start_page` |
| `run_yc_companies` | Get one Y Combinator company by slug or URL: one-liner, description, batch, status, website, team size, location, founders with bios, social links, news and Launch YC posts. Flat 5 points per successful run. | `company`* |
| `run_yc_companies_search` | Search the Y Combinator directory by keyword and filters (batch, industry, region, hiring, top company, nonprofit, team size): name, one-liner, batch, status, industries, regions, team size and website. 1 point per returned record. | `query`, `batches`, `industries`, `regions`, `team_size_min`, `team_size_max`, `sort_by`, `is_hiring`, `top_company`, `nonprofit`, `max_items`, `start_page` |
| `run_yc_founders_search` | Search the public Y Combinator founders directory by name keyword and filters (batch, title, industry, top company): name, title, company, batches, industries and region. 1 point per returned record. | `query`, `batches`, `titles`, `industries`, `top_company`, `max_items`, `start_page` |
| `run_eustartups_directory_categories` | The country categories of the EU-Startups database with their slugs (use them as the country filter of the directory search), names, links and startup counts. Flat 5 points per successful run. |  |
| `run_wellfound_locations` | The list of Wellfound job locations (US cities, US states, countries and other places) with the slug to use as the location in Wellfound jobs search. Optional type and name filters. Flat 5 points per successful run. | `keyword`, `type` |

<!-- TOOLS:END -->

### Keeping tools in sync with the docs

When NeuralVerge adds or changes endpoints, regenerate the tools and rebuild:

```bash
npm run generate   # fetches https://docs.neuralverge.ai/openapi.json -> src/endpoints.generated.ts + README tool list
npm run build
```

## Pricing

NeuralVerge uses simple, points-based pricing — one pool of points covers search, extraction, and every data source. See [neuralverge.ai/pricing](https://neuralverge.ai/pricing) for the current numbers.

**Plans**

| Plan | Price | Points / month |
| --- | --- | --- |
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
| Data Source tools | priced per endpoint — see each endpoint's page at [docs.neuralverge.ai](https://docs.neuralverge.ai) |
| `run_linkedin_people_search` | 100 pts per 25 results |
| `run_linkedin_company_employee` | 30 pts/run + 5 pts/profile |
| `run_phone_enrichment_us` | 100 pts |

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
  endpoints.generated.ts   # all 342 endpoints, generated from the OpenAPI spec
  endpoint-types.ts        # types for the generated endpoint list
  index.ts                 # MCP server bootstrap (stdio transport, or Streamable HTTP if MCP_TRANSPORT=http)
scripts/
  generate-endpoints.mjs   # `npm run generate`: OpenAPI spec -> endpoints.generated.ts + README tool list
```

## License

MIT — see [LICENSE](LICENSE).
