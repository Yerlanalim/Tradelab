# TradeLab Local Backend

Local Express backend for TradeLab to avoid Supabase Edge Function 60-second timeout limitation.

## Features

- **No timeout limits**: Runs locally without Supabase Edge Function constraints
- **Extended OpenAI timeouts**: 120-180 seconds instead of 35-45 seconds
- **Supabase integration**: Uses Supabase only for database operations
- **Authentication**: JWT-based authentication via Supabase Auth
- **Rate limiting**: 30 requests per minute per user

## Setup

1. Install dependencies:
```bash
npm install
```

2. Environment variables are loaded from `../.env` (parent directory)

3. Required environment variables:
- `OPENAI_API_KEY`
- `P3_SEARCH_MODEL`
- `P3_BASE_MODEL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Development

Start the development server with hot reload:
```bash
npm run dev
```

Server will run on `http://localhost:3001`

## Production

Build and run:
```bash
npm run build
npm start
```

## API Endpoints

### Health Check
```
GET /health
```

### Chat Handler
```
POST /chat
Authorization: Bearer <supabase_jwt_token>
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "..." }
  ],
  "page_context": "/products/supplier-search",
  "session_id": "...",
  "context": {}
}
```

## Architecture

- `server.ts` - Express server setup
- `config.ts` - Environment configuration
- `openai.ts` - OpenAI client with extended timeouts
- `chat-handler.ts` - Main chat logic (migrated from Supabase Edge Function)
- `pricing.ts` - Pricing constants

## Migration Notes

- Converted from Deno to Node.js/Express
- Removed CORS restrictions (simplified for local/proxy usage)
- Increased OpenAI API timeouts (2-3x longer)
- Supabase used only for:
  - User authentication
  - Database operations (api_usage, chat_entities, etc.)

## Calculation Layer

Cost estimation engine for import operations (Logistics + Customs + Duties + VAT).

### POST /api/calc/quote

Calculates a landed cost estimate based on deal passport parameters.

#### Request Example
```json
{
  "dest_country": "KZ",
  "incoterms": "CIF",
  "goods_value": 10000,
  "currency": "USD",
  "weight_gross_kg": 100,
  "hs_code": "8471300000",
  "country_of_origin": "CN"
}
```

#### Response Statuses

*   **ok**: Calculation successful, high confidence.
*   **incomplete**: Missing required inputs (e.g. weight, incoterms choice). Check `all_missing_inputs` array.
*   **escalation_required**: Calculation done but requires human expert review. Check `escalation_reasons`.
    *   Reasons include: Low HS confidence (< 65%), multiple HS candidates, DDP incoterms, unsupported tariff units (only `kg` supported in MVP).

### Calculation Policy: "Incomplete vs. Escalation"

To ensure a smooth user experience, the system follows a "graceful degradation" policy:
- **Missing Inputs (Weight/HS Code)**: If critical fields like `weight_gross_kg` or `hs_code` are missing, the API returns **200 OK** with `status: "incomplete"`. It does **not** return a 400 error or trigger an escalation.
- **Logistics Failures**: If no shipping lane is found due to missing inputs (like weight for a per-kg rate), it is treated as **incomplete**.
- **Escalation Priority**: Escalation is reserved for cases where data *is present* but ambiguous (low confidence), unsupported (complex tariffs), or high-risk (DDP).

### Business Actions

1.  **Download PDF**: Generates a branded report with full cost breakdown for the client.
2.  **Create Order (Создать заказ)**: This action converts the calculation into a **Logistics Lead**. 
    *   It captures the specific shipment parameters (incoterms, weight, HS code) and the calculated estimates.
    *   In a production environment, this triggers a CRM entry (e.g., Bitrix24/AmoCRM) for manager follow-up.
    *   It bridges the gap between a self-service estimate and a formal shipping contract.


#### MVP Limitations

1.  **Specific Duties**: Only `kg` based rates supported. Units like `liters`, `pieces`, `m2` trigger escalation.
2.  **Incoterms**: Best support for CIF/FOB. DDP triggers escalation due to complexity.
3.  **Volume**: Calculation based on weight only (chargeable weight). Volume (CBM) support is planned.
4.  **Customs Fees**: Currently returned as empty/zero in totals until specific configuration is added (MVP limitation).
