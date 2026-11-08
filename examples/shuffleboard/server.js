const { createServer } = require('node:http');
const path = require('node:path');
const express = require('express');
const { attachPhoneController } = require('mobcontrol');

const port = process.env.PORT || 3400;
const app = express();
const server = createServer(app);

app.use(attachPhoneController(server).middleware);
app.use(express.static(path.join(__dirname, 'public')));

server.listen(port, () => console.log(`Shuffleboard listening on http://localhost:${port}`));
