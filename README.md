# Domain Ranking App - Backend

A NestJS API for fetching and caching domain rankings from the Tranco List.

## Features

- **Domain Ranking API** - Fetch ranking history for multiple domains
- **Caching** - 24-hour in-database cache to reduce external API calls
- **PostgreSQL Database** - Persistent storage with Prisma ORM
- **CORS Support** - Configured for frontend on port 3001

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

## Tech Stack

- **Framework**: NestJS
- **Database**: PostgreSQL (via Prisma ORM)
- **ORM**: Prisma
- **External API**: Tranco List API
- **Caching**: 24-hour in-database cache
- **HTTP Client**: Axios

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

## Database Schema

```prisma
model Ranking {
  id        String   @id @default(cuid())
  domain    String
  date      String   // YYYY-MM-DD
  rank      Int
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([domain])
  @@index([date])
  @@unique([domain, date])
}
```

## Frontend

See [domain-rank-web](../domain-rank-web/README.md) for frontend details:

- **Framework**: Nuxt 4 / Vue 3
- **Styling**: Bootstrap 5
- **Charts**: Chart.js with vue-chartjs
- **Development Server**: Port 3001

## Resources

- [NestJS Documentation](https://docs.nestjs.com)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Tranco List API](https://tranco-list.eu)
