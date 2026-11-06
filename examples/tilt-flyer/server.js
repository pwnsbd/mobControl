// Tilt Flyer — a demo of the mobControl package.
//
// Everything to do with pairing, sockets and sensors lives in mobcontrol.
// This file is an ordinary Express app that happens to plug it in.

const express = require('express');
const http = require('http');
const path = require('path');
const { attachPhoneController } = require('mobcontrol');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);

// One line to add a phone controller to any HTTP server.
const pad = attachPhoneController(server, { path: '/__phone' });
app.use(pad.middleware);

app.use(express.static(path.join(__dirname, 'public')));

// Optional: the module reports pairing, so a server-authoritative game can react.
pad.on('pair', ({ room }) => console.log(`[pad] room ${room} paired`));
pad.on('unpair', ({ room, role }) => console.log(`[pad] ${role} left room ${room}`));

server.listen(PORT, () => {
  console.log(`Tilt Flyer listening on http://localhost:${PORT}`);
});
