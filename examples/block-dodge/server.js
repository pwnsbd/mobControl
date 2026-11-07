const { createServer } = require('node:http');
const path = require('node:path');
const express = require('express');
const { attachPhoneController } = require('mobcontrol');

const port = process.env.PORT || 3300;
const app = express();
const server = createServer(app);
const phone = attachPhoneController(server);
app.use(phone.middleware);
app.use(express.static(path.join(__dirname, 'public')));

server.listen(port, () => {
  console.log(`Block Dodge listening on http://localhost:${port}`);
});
