#!/bin/bash
cd "$(dirname "$0")"

IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")

echo "======================================================="
echo "  Background Remover & Multi-Crop Studio (iPad Edition)"
echo "======================================================="
echo ""
echo "  To open on your iPad:"
echo "  1. Make sure your iPad is on the same Wi-Fi."
echo "  2. Open Safari on your iPad and go to:"
echo ""
echo "     http://${IP}:5174"
echo ""
echo "  3. In Safari, tap the Share icon [↑] and choose:"
echo "     'Add to Home Screen'"
echo "     It will open full-screen like a native iPad app!"
echo "======================================================="
echo ""

npx vite --host 0.0.0.0 --port 5174
