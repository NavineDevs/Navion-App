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

`package.json` uses the local core package:

```json
{
  "dependencies": {
    "navion": "file:../Navion"
  }
}
```

Install it from this folder:

```bash
npm install
```

Then app code can import core features:

```js
import { handleProxy, encode, decode } from "navion";
```
