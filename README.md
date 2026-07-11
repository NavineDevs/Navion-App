# Navion-App (Shell)

UI shell project that runs separately from `Navion` core.

## What this project is

`Navion-App` provides the app-facing layer and reuses core logic from the `navion` dependency:
- Browser shell/UI routes
- `/nv/*` gateway entry + URL/base tracking cookies
- Delegation to NAVION core proxy handler
- Separate service port (`8090` by default)

## File layout (UV-App style shell split)

```txt
Navion-App/
  server.js
  static/
  src/
    config/
      app.config.js
      routes.js
    index.js
    server/
      index.js
```

## UV-App-style shell patterns now included

- App config module (`src/config/app.config.js`)
- Runtime metadata helper (`src/index.js`)
- Shell status endpoint (`/api/navion-status`)
- Graceful shutdown on SIGINT/SIGTERM

## Requirements

- Node.js `18+`
- `../Navion` present for local dependency installs

## Run

```bash
npm start
```

Server default:
- `http://localhost:8090`

## Adult and ISP-blocked sites (pornhub, hanime, etc.)

These work out of the box with no VPN, Tor, or external proxy. Navion-App uses the core engine's built-in encrypted DNS (DoH) and, when a direct connection to a blocked host fails, automatically retries directly against every resolved IPv4 and IPv6 address.

An optional local proxy is still supported for networks that block by SNI or raw IP. See `../Navion/README.md` for the optional `NAVION_UPSTREAM_PROXY_*` options. Check `http://localhost:8090/api/navion-status` for `dns.doh` and `upstreamProxy.enabled`.

## Key routes

- `/` - NAVION browser shell
- `/app` - NAVION browser shell alias
- `/nv/<encoded-url>` - proxied target entry via core handler
- `/api/fetch?url=<encoded-url>` - proxy endpoint (core)
- `/nav/home` - NAVION home page
- `/nav/error` - NAVION error page
- `/nv.sw.js`, `/nv.client.js`, `/nv.register.js` - app-served runtime assets

## Branding / Credits

- Company: **Navine**
- Lead Dev: **HitBoyXx23**
- Core repo: https://github.com/NavineDevs/Navion
- App repo: https://github.com/NavineDevs/Navion-App

## How to stay dependency-free in Navion-App

Use the shell as a thin layer and keep custom logic in your own modules:

1. Put shared logic in `../Navion/src/` first when possible.
2. Keep app-only helpers in `Navion-App` (routing, UI-shell behavior, status endpoints).
3. Prefer native Node APIs (`http`, `fs`, `path`, `url`) and browser APIs.
4. If you need a "library feature", implement a focused internal utility file instead of installing a package.
5. Export shared helpers from `Navion/package.json` and import them from `navion`.

## Use Navion Core as the app dependency

Published installs use npm:

```json
{
  "dependencies": {
    "navion": "^1.0.12"
  }
}
```

Local development with a sibling `../Navion` checkout:

```bash
npm install
```

When `../Navion` exists, `postinstall` links the local core automatically. Force local core:

```bash
set NAVION_USE_LOCAL_CORE=1
npm run link:core
```

Use the published npm core instead of the local checkout:

```bash
set NAVION_USE_NPM_CORE=1
npm install
```

Then app code can import core features:

```js
import { handleProxy, encode, decode } from "navion";
```
