# oaiproxy

Simple experimental proxy and local bridge that signs into a ChatGPT subscription account and exposes an OpenAI-compatible API on `http://127.0.0.1:1455`.

Current scope:

- `POST /v1/chat/completions`
- `GET /v1/models`
- `GET /v1/models/:id`
- `GET /health`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/status`
- `GET /auth/callback`


## Requirements

- Node.js `22.11.0` or newer
- npm `10+`
- A local browser session that can complete OpenAI OAuth

## Install

```bash
npm install
```

## Run

```bash
npm run start
```

Default listen address:

- Host: `127.0.0.1`
- Port: `1455`

On startup:

- If a usable auth session is found, the server starts immediately.
- If auth is missing, the terminal prompts: `No valid ChatGPT auth found. Launch browser login now? [Y/n]`
- If you answer `Y` or press enter, the browser opens and the callback returns to `http://localhost:1455/auth/callback`

## Configuration

Environment variables:

- `HOST`
  - Default: `127.0.0.1`
  - Listen host for the local server.
- `PORT`
  - Default: `1455`
  - Listen port for the local server.
- `LOG_LEVEL`
  - Default: `info`
  - Pino log level. Accepts `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`.
- `UPSTREAM_TIMEOUT_MS`
  - Default: `30000`
  - Timeout used for OAuth token exchange and upstream Codex requests.

The OAuth callback URL is derived from the current `PORT` and always uses:

- `http://localhost:<PORT>/auth/callback`

## Auth files

Primary auth file written by this project:

- `~/.chatgpt-codex/auth.json`

Read-only fallback sources:

- `$CODEX_HOME/auth.json`
- `~/.codex/auth.json`

If fallback auth is used, refreshes and new logins still write to `~/.chatgpt-codex/auth.json`.

## Endpoints

`GET /health`

- Simple liveness check.

`GET /auth/status`

- Shows whether auth is usable.
- Returns the source auth path, email, plan type, account id, and expiry.

`POST /auth/login`

- Starts OAuth login and opens the browser.

`POST /auth/logout`

- Removes the primary local auth file.

`GET /v1/models`

- Returns the tested model list.

`GET /v1/models/:id`

- Returns a single model record for supported model ids.

`POST /v1/chat/completions`

- Supports both `stream: true` and `stream: false`
- Converts OpenAI chat messages into the upstream Codex responses format
- Translates upstream SSE back into OpenAI-compatible chat completion output

## Quick checks

Health:

```bash
curl http://127.0.0.1:1455/health
```

Auth status:

```bash
curl http://127.0.0.1:1455/auth/status
```

Models:

```bash
curl http://127.0.0.1:1455/v1/models
```

Streaming chat completion:

```bash
curl -sN http://127.0.0.1:1455/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{
    "model": "gpt-5.4",
    "stream": true,
    "messages": [
      { "role": "system", "content": "Reply briefly." },
      { "role": "user", "content": "Say hello in three words." }
    ]
  }'
```

Non-streaming chat completion:

```bash
curl http://127.0.0.1:1455/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{
    "model": "gpt-5.4",
    "stream": false,
    "messages": [
      { "role": "system", "content": "Reply briefly." },
      { "role": "user", "content": "Say hello in three words." }
    ]
  }'
```

## OpenOats setup

For the OpenAI-compatible provider slot in OpenOats, use:

- Base URL: `http://127.0.0.1:1455`
- Model: `gpt-5.4`
- API key: leave blank unless the client insists on a value

The prototype route to use is `/v1/chat/completions`.

## Development

Typecheck:

```bash
npm run typecheck
```

Tests:

```bash
npm test
```
