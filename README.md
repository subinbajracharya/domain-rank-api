# Domain Ranking App - Backend

A NestJS API for fetching and caching domain rankings from the Tranco List.

---

## Why This Application Exists

**The Problem:**
Domain ranking data (like Alexa, Tranco, or SimilarWeb) is critical for:

- **SEO professionals** tracking domain authority over time
- **Marketing teams** benchmarking against competitors
- **Investors** evaluating domain portfolio value
- **Researchers** studying internet concentration trends

**The Challenge:**
The Tranco List API provides ranking data, but:

- Rate limits restrict how many domains you can query
- External API calls add latency to every request
- Historical data changes frequently, requiring repeated fetches

**Our Solution:**
Build a caching layer that:

1. Stores ranking history in a PostgreSQL database
2. Serves cached data when fresh (< 24 hours old)
3. Only fetches from Tranco API when cache expires

This reduces API calls by 90%+ while providing fast responses.

---

## Thought Process: Architecture Decisions

### Why NestJS?

- **TypeScript-first**: Catches errors at compile time, essential for data integrity
- **Modular architecture**: Easy to add new modules (auth, users, etc.)
- **Dependency injection**: Makes testing business logic straightforward
- **Battle-tested**: Used by major companies, well-documented

### Why PostgreSQL + Prisma?

- **PostgreSQL**: Reliable, supports complex queries, excellent for time-series data
- **Prisma**: Type-safe database client, reduces boilerplate, excellent migrations

### Why In-Database Caching?

- **Simpler than Redis**: No additional infrastructure needed
- **Persistent**: Cache survives app restarts
- **Fast enough**: PostgreSQL handles these queries in < 5ms

### Database Schema Design

```prisma
model Ranking {
  id        String   @id @default(cuid())
  domain    String   // Index for fast domain lookups
  date      String   // YYYY-MM-DD format for easy charting
  rank      Int      // Tranco ranking (1 = most popular)
  createdAt DateTime @default(now())  // When record was created
  updatedAt DateTime @updatedAt       // When cache was refreshed

  @@unique([domain, date])  // Prevent duplicate rankings per day
  @@index([domain])         // Speed up domain queries
  @@index([date])           // Speed up time-series queries
}
```

**Why composite unique key?**

- A domain can only have one ranking per date
- Prevents accidental duplicate inserts
- Allows `ON CONFLICT` handling for clean upserts

---

## Features

- **Domain Ranking API** - Fetch ranking history for multiple domains
- **Caching** - 24-hour in-database cache to reduce external API calls
- **PostgreSQL Database** - Persistent storage with Prisma ORM
- **CORS Support** - Configured for frontend on port 3001
- **Batch Processing** - Fetch multiple domains efficiently

---

## Prerequisites

- Node.js 18+
- npm, pnpm, or yarn
- PostgreSQL database (Neon cloud database configured)
- Tranco List API access

## Setup

Install dependencies:

```bash
npm install
```

## Configuration

Create a `.env` file in the root directory:

```env
# Database (Neon PostgreSQL)
DATABASE_URL=postgresql://user:password@host/neondb?sslmode=require

# For CORS (frontend on port 3001)
FRONTEND_URL=http://localhost:3001
PORT=3000

# Tranco API
TRANCO_API_BASE=https://tranco-list.eu/api/ranks/domain
CACHE_HOURS=24
```

## Development Server

Start the development server:

```bash
npm run start:dev
```

The API will be available at `http://localhost:3000`

## Production

Build the application:

```bash
npm run build
```

Start production server:

```bash
npm run start:prod
```

## API Endpoints

### Get Rankings

```
GET /rankings/{domains}
```

Where `{domains}` is a comma-separated list of domain names.

**Example Request:**

```
GET /rankings/facebook.com,google.com
```

**Example Response:**

```json
{
  "facebook.com": {
    "domain": "facebook.com",
    "labels": ["2024-01-01", "2024-01-02", "2024-01-03", ...],
    "ranks": [3, 3, 4, ...]
  },
  "google.com": {
    "domain": "google.com",
    "labels": ["2024-01-01", "2024-01-02", "2024-01-03", ...],
    "ranks": [1, 1, 1, ...]
  }
}
```

### Response Format Rationale

- **`labels`**: Array of date strings for X-axis on charts
- **`ranks`**: Array of integers for Y-axis values
- **Why arrays?** Frontend charting libraries (Chart.js) expect this format

---

## Tech Stack

- **Framework**: NestJS
- **Database**: PostgreSQL (via Prisma ORM)
- **ORM**: Prisma
- **External API**: Tranco List API
- **Caching**: 24-hour in-database cache
- **HTTP Client**: Axios

---

## Project Structure

```
domain-rank-api/
├── prisma/
│   ├── schema.prisma      # Database schema
│   └── migrations/        # Database migrations
├── src/
│   ├── app.module.ts      # Root module
│   ├── main.ts            # Entry point
│   └── rankings/
│       ├── rankings.controller.ts  # API endpoints
│       ├── rankings.module.ts      # Rankings module
│       └── rankings.service.ts     # Business logic
└── package.json
```

---

## Caching Strategy Explained

```
Request: GET /rankings/google.com,facebook.com

┌─────────────────────────────────────────────────────────────┐
│ Step 1: Check cache freshness for all domains              │
│   └─ Query: SELECT DISTINCT domain, updatedAt FROM ...     │
│   └─ Result: { google.com: "2024-01-10", facebook: null }  │
├─────────────────────────────────────────────────────────────┤
│ Step 2: Fetch fresh data from Tranco for stale domains     │
│   └─ API call: GET /ranks/domain/google.com                │
│   └─ API call: GET /ranks/domain/facebook.com              │
├─────────────────────────────────────────────────────────────┤
│ Step 3: Update database cache                              │
│   └─ Transaction: DELETE + INSERT for each domain          │
├─────────────────────────────────────────────────────────────┤
│ Step 4: Return combined results                             │
│   └─ Cached + Fresh data merged by domain                  │
└─────────────────────────────────────────────────────────────┘
```

**Why this approach?**

- **Single freshness check**: One query, not N queries
- **Parallel API calls**: Stale domains fetched simultaneously
- **Atomic updates**: Transaction ensures cache consistency
- **Graceful degradation**: Partial failures don't break entire response

---

## Frontend

See [domain-rank-web](../domain-rank-web/README.md) for frontend details:

- **Framework**: Nuxt 4 / Vue 3
- **Styling**: Bootstrap 5
- **Charts**: Chart.js with vue-chartjs
- **Development Server**: Port 3001

---

## Resources

- [NestJS Documentation](https://docs.nestjs.com)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Tranco List API](https://tranco-list.eu)
