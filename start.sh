#!/bin/bash
echo "🧪 Starting TestFlow..."
echo ""

if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "⚠️  ANTHROPIC_API_KEY not set!"
  echo "   Run: export ANTHROPIC_API_KEY=your_key_here"
  echo ""
fi

# Start backend
echo "▶ Starting backend on port 4000..."
cd "$(dirname "$0")/backend"
node server.js &
BACKEND_PID=$!
sleep 2

# Start frontend
echo "▶ Starting frontend on port 5173..."
cd "$(dirname "$0")/frontend2"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ TestFlow is running!"
echo "   Backend:  http://localhost:4000"
echo "   Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Stopped.'" INT
wait
