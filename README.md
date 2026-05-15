# oaiproxy

Simple experimental proxy and local bridge that signs into a ChatGPT subscription account and exposes an OpenAI-compatible API on `http://127.0.0.1:1455`.

Current scope:

- `POST /v1/chat/completions`
- `GET /v1/models`
- `GET /v1/models/:id`
- `GET /health`
- `GET /ready`
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
npm install -g @nima__/oai-proxy
```

## Run

```bash
oaiproxy
```

Default listen address:

- Host: `127.0.0.1`
- Port: `1455`

On startup:

- If a usable auth session is found, the server starts immediately.
- If auth is missing, the terminal prompts: `No valid ChatGPT auth found. Launch browser login now? [Y/n]`
- If you answer `Y` or press enter, the browser opens and the callback returns to `http://localhost:1455/auth/callback`

## Run As A LaunchAgent

The clean macOS way to keep this running for a local OpenAI-compatible client is a user-scoped `launchd` agent.

That is exactly what I set up locally:

- a plist under `~/Library/LaunchAgents/`
- absolute `node` path in `ProgramArguments`
- repo root as `WorkingDirectory`
- stdout/stderr sent to log files under `~/Library/Logs/oaiproxy/`

Important: install auth first. The background agent has no interactive terminal, so do one successful login with:

```bash
oaiproxy
```

After auth exists, install the LaunchAgent:

```bash
oaiproxy-launchd install
```

Useful commands:

```bash
oaiproxy-launchd status
oaiproxy-launchd logs
oaiproxy-launchd uninstall
```

Defaults used by the LaunchAgent:

- Label: `dev.oaiproxy.server`
- Plist: `~/Library/LaunchAgents/dev.oaiproxy.server.plist`
- Logs:
  - `~/Library/Logs/oaiproxy/stdout.log`
  - `~/Library/Logs/oaiproxy/stderr.log`

You can override the runtime parameters at install time:

```bash
PORT=1555 LOG_LEVEL=debug oaiproxy-launchd install
```

To change the port after the agent is already installed, edit the plist directly and reload:

```bash
# 1. Edit the PORT value in the plist
nano ~/Library/LaunchAgents/dev.oaiproxy.server.plist

# 2. Reload (this stops the running process and starts it on the new port)
launchctl unload ~/Library/LaunchAgents/dev.oaiproxy.server.plist
launchctl load  ~/Library/LaunchAgents/dev.oaiproxy.server.plist
```

Do not kill the process with `kill` or `pkill` — `KeepAlive` is set, so launchd will immediately restart it on the old port.

You can also pin a specific Node binary if your shell uses a version manager:

```bash
NODE_BINARY="$(command -v node)" oaiproxy-launchd install
```

If your reusable auth lives under a custom `CODEX_HOME`, pass that during install too:

```bash
CODEX_HOME="/path/to/codex-home" oaiproxy-launchd install
```

## Run As A Service

For a container or sidecar process, enable service mode:

```bash
OAI_PROXY_SERVICE_MODE=true HOST=0.0.0.0 oaiproxy
```

Service mode:

- disables the startup browser-login prompt
- keeps `/auth/*`, `/health`, `/ready`, and `/v1/*` routes available
- makes `/auth/login` return the login URL without trying to open a browser from the service process

Manual service-mode auth flow:

1. Call `POST /auth/login` on the running service.
2. Open the returned `authorization_url` in a browser.
3. After the browser redirects to `http://localhost:<PORT>/auth/callback?...`, copy the full callback URL.
4. Send that callback URL back to the running service, for example with `curl` from a shell or exec session that can reach the service's `localhost:<PORT>`.

Persisting the auth JSON in a service-safe store, such as a single Secrets Manager secret, is intentionally left for a follow-up change.

Build a local container image:

```bash
docker build -t oai-proxy:local .
```

Run it locally:

```bash
docker run --rm -p 1455:1455 \
  -v "$HOME/.chatgpt-codex:/home/node/.chatgpt-codex" \
  oai-proxy:local
```

The container healthcheck uses `/health`, not `/ready`, so a fresh container can stay running while you complete manual auth. Use `/ready` when you need to check whether auth is usable for chat completions.

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
- `OAI_PROXY_SERVICE_MODE`
  - Default: `false`
  - Set to `true` for non-interactive service/container mode.
- `OAI_PROXY_AUTH_ROUTES_ENABLED`
  - Default: `true`
  - Enables or disables `/auth/*` routes.
- `OAI_PROXY_STARTUP_LOGIN_PROMPT`
  - Default: `true` locally, `false` in service mode.
  - Controls the interactive startup login prompt.

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

`GET /ready`

- Readiness check that returns `503` when auth is missing or expired.

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

- Supports both `stream: true` and non-streaming responses. Omitted `stream` defaults to non-streaming, matching OpenAI chat completions.
- Converts OpenAI chat messages into the upstream Codex responses format
- Preserves multimodal user content with OpenAI-compatible `image_url` parts
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

Multimodal chat completion:

```bash
curl http://127.0.0.1:1455/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{
    "model": "gpt-5.5",
    "stream": false,
    "messages": [
      { "role": "system", "content": "Describe images briefly." },
      {
        "role": "user",
        "content": [
          { "type": "text", "text": "What is important in this image?" },
          {
            "type": "image_url",
            "image_url": {
              "url": "data:image/png;base64,...",
              "detail": "low"
            }
          }
        ]
      }
    ]
  }'
```

## Client setup

For any OpenAI-compatible client, use:

- Base URL: `http://127.0.0.1:1455`
- Model: `gpt-5.4`
- API key: leave blank unless the client insists on a value

The prototype route to use is `/v1/chat/completions`.

If you installed the LaunchAgent with a custom port, use that port in the client too.

## Development

Typecheck:

```bash
npm run typecheck
```

Tests:

```bash
npm test
```
