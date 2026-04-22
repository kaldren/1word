# Releasing

## Bump version

Edit the version string in all 5 files:

- `package.json`
- `extension/package.json`
- `server/package.json`
- `extension/manifest.json`
- `extension/manifest.firefox.json`

Convention: `1.MINOR.0` for normal releases, `1.x.PATCH` for hotfixes.

## Build

```bash
# Chrome / Edge
npm run build:ext
# output: extension/dist-chrome/

# Firefox
npm run build:ext:firefox
# output: extension/dist-firefox/
```

Zip each folder and upload to the respective store.

## Deploy server

```bash
npm run deploy -w server
```

## DB migrations (run manually, irreversible)

```bash
npm run db:migrate:remote -w server
```
