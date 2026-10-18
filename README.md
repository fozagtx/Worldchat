# Worldchat

See who's online around the world on a 3D globe and start a real 1:1 video call in one tap. Light, cream-and-brown design.

- **Real presence.** Every open browser shows up as a pin. Only the city is shared, rounded to about 10 km. Nothing is stored on the server and there are no seeded or fake users.
- **Real calls.** Peer-to-peer WebRTC (Google STUN). Calls ring with Accept/Decline, show live connection status and a timer, and Mute/Camera control the actual tracks. If you have no microphone or camera, you can still see and hear the other person.
- **Stack.** Vite + React + TypeScript client. Node `ws` server (`server/index.js`) handles presence and signaling and serves `dist/` in production.

## Run

```bash
npm install
npm run dev      # vite on :5173, server on :8787 (/ws proxied)
npm test         # server protocol tests
npm run build && npm start   # production: one process on $PORT (default 8787)
```

Calls need HTTPS (or localhost) for camera/mic access. Behind strict NATs a direct connection can fail without a TURN server; the app says so instead of pretending to connect.
