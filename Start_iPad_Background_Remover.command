#!/bin/bash
cd "$(dirname "$0")"

IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")

echo "======================================================="
echo "  Background Remover & Multi-Crop Studio (iPad Edition)"
echo "======================================================="
echo ""
echo "  To open on your iPad:"
echo "  Option A (Local Wi-Fi):"
echo "     http://${IP}:5174"
echo ""
echo "  Option B (GitHub Pages Website):"
echo "     https://carmen-reynolds.github.io/ipadclipartstudio/"
echo ""
echo "  Tip: In Safari, tap Share [↑] -> 'Add to Home Screen'"
echo "  to use full-screen like a native iPad app!"
echo "======================================================="
echo ""

# Start secure Cloudflare tunnel in background for GitHub Pages compatibility
if [ -f "./bin/cloudflared" ]; then
  echo "  Starting secure HTTPS tunnel for Eagle library..."
  ./bin/cloudflared tunnel --url http://localhost:5174 > /tmp/cloudflared_active.log 2>&1 &
  TUNNEL_PID=$!
  trap "kill $TUNNEL_PID 2>/dev/null" EXIT
fi

npx vite --host 0.0.0.0 --port 5174
