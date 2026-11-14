#!/usr/bin/env bash
# Build the frontend with the Render API URL baked in, then deploy only the
# static files to Vercel. (Deploying the repo root makes the Vercel CLI detect
# frontend/ + backend/ as "services", which new projects reject.)
#   VITE_API_URL=https://<render-service>.onrender.com scripts/deploy-frontend.sh
set -euo pipefail
: "${VITE_API_URL:?set VITE_API_URL to the Render backend URL}"
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$(mktemp -d)"
(cd "$root/frontend" && npm install --no-audit --no-fund && npm run build)
cp -r "$root/frontend/dist/." "$out/"
echo '{"rewrites":[{"source":"/(.*)","destination":"/index.html"}]}' > "$out/vercel.json"
mkdir -p "$out/.vercel" && cp "$root/.vercel/project.json" "$out/.vercel/"
cd "$out" && npx vercel deploy --prod --yes
