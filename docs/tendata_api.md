# Tendata API Documentation

## Global Trade Data & Business Intelligence API Platform

**Version:** v2  
**Base URL:** `https://open-api.tendata.cn`  
**Rate Limit:** 200 requests per minute

---

## Table of Contents

1. [Introduction](#introduction)
2. [Request Structure](#request-structure)
3. [Response Structure](#response-structure)
4. [Authentication](#authentication)
5. [Common Error Codes](#common-error-codes)
6. [API Endpoints](#api-endpoints)
   - [Access Token](#access-token)
   - [Trade Data Search](#trade-data-search)
   - [Company Search](#company-search)
   - [Company Details](#company-details)
   - [Contact Information](#contact-information)
   - [Account Information](#account-information)
7. [Country Codes Reference](#country-codes-reference)
8. [Code Examples](#code-examples)

---

## Introduction

This document introduces the relevant APIs, request parameters, and usage examples of the Tendata API platform.

You can use our REST API to access the features of Tendata iTrader. By integrating the Tendata database, you can synchronize your potential customers, find email addresses, social media addresses, and more.

### Key Features

- Access to 10B+ global trade records
- Coverage of 228 countries
- 500M+ company profiles
- 850M+ business contacts
- AI-powered data cleaning and company verification

---

## Request Structure

### Service Address

```
open-api.tendata.cn
```

### Communication Protocol

Both HTTP and HTTPS communication protocols are supported. It is recommended to use the more secure HTTPS protocol to send requests.

### Request Methods

Tendata API supports both **POST** and **GET** request methods.

### Request Parameters

For detailed request parameters, refer to the description documentation for each API interface.

### Character Encoding

Requests and responses are encoded using the **UTF-8** character set.

---

## Response Structure

### Standard Response Format

After a successful API call, the response parameters are returned with HTTP status code 200.

When the request is processed successfully, the response will contain the `data` part. All API response data will be included in the `data` field.

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Indicator of successful API response |
| `code` | number | API response status code |
| `msg` | string | API response message |
| `traceId` | string | Trace ID for debugging |
| `data` | object | API response data entity |

### Success Response Example

```json
{
  "success": true,
  "code": 200,
  "msg": "Success",
  "traceId": "h0layklx3w9tpx9sx8u1",
  "data": "..."
}
```

---

## Authentication

### Signature Authentication Method

The Tendata API employs an API Key-based authentication mechanism to ensure secure access to its services.

### Authentication Flow

1. **Obtain your API Key** from our sales team or authorized representatives
2. **Request Access Token** via the `/v2/access-token` endpoint using your API Key
3. **Include Access Token** in the `Authorization` header of all subsequent API requests

### Access Token Retrieval

**Endpoint:** `GET /v2/access-token`

**Request Example:**

```bash
curl --location --request GET 'https://open-api.tendata.cn/v2/access-token?apiKey=YOUR_API_KEY' \
  --header 'User-Agent: Apifox/1.0.0 (https://apifox.com)' \
  --header 'Accept: */*' \
  --header 'Host: open-api.tendata.cn' \
  --header 'Connection: keep-alive'
```

**Response Parameters:**

| Parameter Name | Type | Description | Example Value |
|----------------|------|-------------|---------------|
| `accessToken` | string | Access Token | QSlHffXmCAILIOHNGXToq4LsP2yX64VQhEBZ7Ei4 |
| `expiresIn` | number | Token Expiration Time (in seconds) | 7200 |
| `unit` | string | Time Unit | SECONDS |
| `tokenType` | string | Token Type (always Bearer) | Bearer |

**Response Example:**

```json
{
  "data": {
    "accessToken": "QSlHffXmCAILIOHNGXToq4LsP2yX64VQhEBZ7Ei4",
    "expiresIn": 7200,
    "unit": "SECONDS",
    "tokenType": "Bearer"
  },
  "traceId": "h0layklx3w9tpx9sx8u1",
  "code": 200,
  "success": true,
  "msg": "Success"
}
```

### Using the Access Token

Include the access token in the `Authorization` header of all API requests:

```bash
Authorization: Bearer QSlHffXmCAILIOHNGXToq4LsP2yX64VQhEBZ7Ei4
```

> **Note:** The access token is generally valid for **2 hours** (7200 seconds).

---

## Common Error Codes

| Code | CodeN | Message | Description |
|------|-------|---------|-------------|
| TRADE_CATALOG_ERROR | 40001 | trade catalog error | Invalid trade catalog specified |
| PARAM_DATE | 40002 | DATE PARAM ERROR | Date parameter format error |
| PARAM_ERROR | 40003 | PARAM ERROR | General parameter error |
| UNAUTHORIZED | 401 | Unauthorized | Authentication failed or token expired |
| FORBIDDEN | 403 | Forbidden | Access denied |
| NOT_FOUND | 404 | Not Found | Resource not found |
| RATE_LIMIT_EXCEEDED | 429 | Rate Limit Exceeded | API rate limit exceeded |
| INTERNAL_ERROR | 500 | Internal Server Error | Server-side error |
| INSUFFICIENT_BALANCE | 40010 | Insufficient Balance | Account balance insufficient |

---

## API Endpoints

### Trade Data Search

Search for import/export trade data records.

**Endpoint:** `POST /v2/trade`

**Request Parameters:**

| Parameter | Type | Required | Default | Description | Example |
|-----------|------|----------|---------|-------------|---------|
| `pageNo` | integer | Yes | - | Page number | 1 |
| `pageSize` | integer | Yes | - | Records per page (max 100) | 10 |
| `catalog` | string | Yes | - | Data source type: `imports` or `exports` | imports |
| `startDate` | string | Yes | - | Query start date (YYYY-MM-DD) | 2024-01-01 |
| `endDate` | string | Yes | - | Query end date (YYYY-MM-DD) | 2024-12-31 |
| `hsCode` | string | No | - | HS Code (4+ digits) | 63049239 |
| `exporter` | string | No | - | Exporter name (min 2 characters) | - |
| `importer` | string | No | - | Importer name (min 2 characters) | - |
| `containProducer` | boolean | No | - | Include production enterprises | false |
| `countryOfOriginCode` | string | No | - | Country of origin code (ISO 3166-1 alpha-3) | CHN |
| `destinationCountryCode` | string | No | - | Destination country code | USA |
| `productDesc` | string | No | - | Product description keywords | electronics |
| `quantity` | array | No | - | Quantity range | [1, 100] |
| `quantityUnit` | string | No | - | Quantity unit | PKG |
| `sumOfUSD` | array | No | - | Total USD value range | [1000, 10000] |
| `weightUnitPriceUSD` | array | No | - | Weight unit price USD range | [10, 50] |
| `optimizationModel` | boolean | No | false | Enable T-info data source optimization | true |

**Request Example:**

```bash
curl https://open-api.tendata.cn/v2/trade \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "pageNo": 1,
    "pageSize": 10,
    "catalog": "imports",
    "startDate": "2023-01-01",
    "endDate": "2023-12-31",
    "hsCode": "63049239"
  }'
```

**Response Parameters:**

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `total` | number | Total count of records | 9200 |
| `pageNo` | number | Current page number | 1 |
| `pageSize` | number | Records per page | 10 |
| `list` | array | Array of trade records | [...] |

**Trade Record Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `date` | string | Trade date |
| `hsCode` | string | HS Code |
| `productDesc` | string | Product description |
| `exporter` | string | Exporter name |
| `exporterCountry` | string | Exporter country |
| `importer` | string | Importer name |
| `importerCountry` | string | Importer country |
| `quantity` | number | Quantity |
| `quantityUnit` | string | Quantity unit |
| `weight` | number | Weight (kg) |
| `sumOfUSD` | number | Total USD value |
| `weightAvgPrice` | number | Average price per weight unit |
| `quantityAvgPrice` | number | Average price per quantity unit |
| `tradeCount` | number | Number of transactions |

---

### Company Search

Search for companies based on trade activity.

**Endpoint:** `POST /v2/company/search`

**Request Parameters:**

| Parameter | Type | Required | Default | Description | Example |
|-----------|------|----------|---------|-------------|---------|
| `pageNo` | integer | Yes | - | Page number | 1 |
| `pageSize` | integer | Yes | - | Records per page | 10 |
| `dateRange` | string | Yes | - | Time range | CURRENT_YEAR, LAST_YEAR, ONE_YEAR |
| `catalog` | string | Yes | - | Data source type | imports/exports |
| `exporter` | string | No | - | Exporter name | Example Exporter |
| `importer` | string | No | - | Importer name | Example Importer |
| `hsCode` | string | No | - | HS Code | 1234 |
| `productDesc` | string | No | - | Product description | electronics; appliances |
| `countryOfOriginCode` | string | No | - | Country of origin code | CHN |

**dateRange Values:**

- `CURRENT_YEAR` - Current year
- `LAST_YEAR` - Previous year
- `ONE_YEAR` - Last 12 months

---

### Company Details

Get detailed information about a specific company.

**Endpoint:** `GET /v2/company/detail`

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `companyId` | string | Yes | Company ID from search results |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `companyName` | string | Company name |
| `country` | string | Country |
| `address` | string | Address |
| `phone` | string | Phone number |
| `email` | string | Email address |
| `website` | string | Website URL |
| `establishedYear` | number | Year established |
| `employeeCount` | string | Employee count range |
| `businessType` | string | Type of business |
| `mainProducts` | array | Main products/services |
| `tradeStatistics` | object | Trade statistics summary |

---

### Contact Information

Retrieve contact information for companies.

**Endpoint:** `POST /v2/contact/search`

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `companyId` | string | Yes | Company ID |
| `pageNo` | integer | Yes | Page number |
| `pageSize` | integer | Yes | Records per page |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `contactName` | string | Contact person name |
| `title` | string | Job title |
| `email` | string | Email address |
| `phone` | string | Phone number |
| `linkedin` | string | LinkedIn profile URL |
| `department` | string | Department |

---

### Social Media Links

Get social media links for companies.

**Endpoint:** `GET /v2/contact-link`

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `companyId` | string | Yes | Company ID |

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `linkedin` | string | LinkedIn URL |
| `facebook` | string | Facebook URL |
| `twitter` | string | Twitter/X URL |
| `instagram` | string | Instagram URL |
| `youtube` | string | YouTube URL |

---

### Account Information

Get current account status and balance.

**Endpoint:** `GET /v2/account`

**Request Example:**

```bash
curl --location --request GET 'https://open-api.tendata.cn/v2/account' \
  --header 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  --header 'User-Agent: Apifox/1.0.0 (https://apifox.com)'
```

**Response Parameters:**

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `expiresIn` | string | Account expiration date | 2025-09-10 00:00:00 |
| `balance` | number | Remaining points/credits | 799971 |

**Response Example:**

```json
{
  "success": true,
  "code": 200,
  "msg": "Success",
  "data": {
    "balance": 5678,
    "expiresIn": "2025-09-10 00:00:00"
  }
}
```

---

## Country Codes Reference

The API uses ISO 3166-1 alpha-3 country codes. Below is a reference table of commonly used codes:

| Code | Country | Code | Country | Code | Country |
|------|---------|------|---------|------|---------|
| AFG | Afghanistan | DEU | Germany | NGA | Nigeria |
| ALB | Albania | GHA | Ghana | NLD | Netherlands |
| ARE | United Arab Emirates | GBR | United Kingdom | NOR | Norway |
| ARG | Argentina | GRC | Greece | NZL | New Zealand |
| AUS | Australia | HKG | Hong Kong | PAK | Pakistan |
| AUT | Austria | HUN | Hungary | PAN | Panama |
| BEL | Belgium | IDN | Indonesia | PER | Peru |
| BGD | Bangladesh | IND | India | PHL | Philippines |
| BRA | Brazil | IRL | Ireland | POL | Poland |
| CAN | Canada | IRN | Iran | PRT | Portugal |
| CHE | Switzerland | IRQ | Iraq | QAT | Qatar |
| CHL | Chile | ISR | Israel | ROU | Romania |
| CHN | China | ITA | Italy | RUS | Russia |
| COL | Colombia | JPN | Japan | SAU | Saudi Arabia |
| CZE | Czech Republic | KAZ | Kazakhstan | SGP | Singapore |
| DNK | Denmark | KEN | Kenya | SWE | Sweden |
| EGY | Egypt | KOR | South Korea | THA | Thailand |
| ESP | Spain | KWT | Kuwait | TUR | Turkey |
| FIN | Finland | LKA | Sri Lanka | TWN | Taiwan |
| FRA | France | MEX | Mexico | UKR | Ukraine |
| GEO | Georgia | MYS | Malaysia | USA | United States |
| UZB | Uzbekistan | VNM | Vietnam | ZAF | South Africa |

---

## Code Examples

### Java (OkHttp)

```java
OkHttpClient client = new OkHttpClient().newBuilder().build();

MediaType mediaType = MediaType.parse("application/json");

RequestBody body = RequestBody.create(mediaType, "{" +
    "\"pageNo\": 1," +
    "\"pageSize\": 10," +
    "\"catalog\": \"imports\"," +
    "\"startDate\": \"2023-01-01\"," +
    "\"endDate\": \"2023-12-31\"," +
    "\"hsCode\": \"63049239\"" +
"}");

Request request = new Request.Builder()
    .url("https://open-api.tendata.cn/v2/trade")
    .method("POST", body)
    .addHeader("Authorization", "Bearer YOUR_ACCESS_TOKEN")
    .addHeader("Content-Type", "application/json")
    .build();

Response response = client.newCall(request).execute();
System.out.println(response.body().string());
```

### Python (requests)

```python
import requests
import json

# Get Access Token
token_url = "https://open-api.tendata.cn/v2/access-token"
params = {"apiKey": "YOUR_API_KEY"}
token_response = requests.get(token_url, params=params)
access_token = token_response.json()["data"]["accessToken"]

# Search Trade Data
url = "https://open-api.tendata.cn/v2/trade"
headers = {
    "Authorization": f"Bearer {access_token}",
    "Content-Type": "application/json"
}
payload = {
    "pageNo": 1,
    "pageSize": 10,
    "catalog": "imports",
    "startDate": "2023-01-01",
    "endDate": "2023-12-31",
    "hsCode": "63049239"
}

response = requests.post(url, headers=headers, json=payload)
data = response.json()
print(json.dumps(data, indent=2))
```

### Go

```go
package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "io/ioutil"
    "net/http"
)

func main() {
    url := "https://open-api.tendata.cn/v2/trade"
    
    payload := map[string]interface{}{
        "pageNo":    1,
        "pageSize":  10,
        "catalog":   "imports",
        "startDate": "2023-01-01",
        "endDate":   "2023-12-31",
        "hsCode":    "63049239",
    }
    
    jsonPayload, _ := json.Marshal(payload)
    
    req, _ := http.NewRequest("POST", url, bytes.NewBuffer(jsonPayload))
    req.Header.Set("Authorization", "Bearer YOUR_ACCESS_TOKEN")
    req.Header.Set("Content-Type", "application/json")
    
    client := &http.Client{}
    resp, err := client.Do(req)
    if err != nil {
        panic(err)
    }
    defer resp.Body.Close()
    
    body, _ := ioutil.ReadAll(resp.Body)
    fmt.Println(string(body))
}
```

### PHP

```php
<?php
$curl = curl_init();

$payload = json_encode([
    "pageNo" => 1,
    "pageSize" => 10,
    "catalog" => "imports",
    "startDate" => "2023-01-01",
    "endDate" => "2023-12-31",
    "hsCode" => "63049239"
]);

curl_setopt_array($curl, [
    CURLOPT_URL => "https://open-api.tendata.cn/v2/trade",
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST => "POST",
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_HTTPHEADER => [
        "Authorization: Bearer YOUR_ACCESS_TOKEN",
        "Content-Type: application/json"
    ],
]);

$response = curl_exec($curl);
curl_close($curl);

echo $response;
?>
```

### JavaScript (Node.js)

```javascript
const axios = require('axios');

async function searchTradeData() {
    const url = 'https://open-api.tendata.cn/v2/trade';
    
    const payload = {
        pageNo: 1,
        pageSize: 10,
        catalog: 'imports',
        startDate: '2023-01-01',
        endDate: '2023-12-31',
        hsCode: '63049239'
    };
    
    const config = {
        headers: {
            'Authorization': 'Bearer YOUR_ACCESS_TOKEN',
            'Content-Type': 'application/json'
        }
    };
    
    try {
        const response = await axios.post(url, payload, config);
        console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

searchTradeData();
```

---

## Best Practices

### Rate Limiting

- API rate limit is **200 requests per minute**
- Implement exponential backoff when encountering 429 errors
- Cache frequently accessed data when possible

### Token Management

- Access tokens expire after **2 hours** (7200 seconds)
- Implement token refresh logic before expiration
- Store tokens securely and never expose them in client-side code

### Error Handling

- Always check the `success` field in responses
- Use `traceId` for debugging and support inquiries
- Implement proper error handling for all API calls

### Data Quality

- Use specific HS codes (6-8 digits) for more accurate results
- Combine multiple filter parameters to narrow results
- Remove company suffixes for better company name matching

---

## Support

For API access, pricing inquiries, or technical support:

- **Website:** [tendata.com](https://tendata.com)
- **API Documentation:** [open-api.tendata.cn](https://open-api.tendata.cn)

---

*Document Version: 2.0*  
*Last Updated: January 2026*