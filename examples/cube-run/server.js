// Cube Run — an ordinary Express app that plugs in mobControl.
//
// The only two lines that have anything to do with the phone are marked.

const express = require('express');
const http = require('http');
const path = require('path');
const { attachPhoneController } = require('mobcontrol');

const PORT = process.env.PORT || 3200;

const app = express();
const server = http.createServer(app);

const pad = attachPhoneController(server);   // <- 1
app.use(pad.middleware);                     // <- 2

app.use(express.static(path.join(__dirname, 'public')));

server.listen(PORT, () => {
  console.log(`Cube Run listening on http://localhost:${PORT}`);
});
