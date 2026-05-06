# GG Manager

## Dev setup

1. `npm install`
2. `npm run db:up`
3. Copy `apps/server/.env.example` to `apps/server/.env` and set valid secrets
4. Run services:
   - `npm run server:dev`
   - `npm run admin:dev`
   - `npm run client:dev`

## Smoke test

- `npm run smoke`

## Tests

- `npm --workspace apps/server run test`
