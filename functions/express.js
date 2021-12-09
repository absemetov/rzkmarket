const functions = require("firebase-functions");
const express = require("express");
const app = express();
app.get("/", (req, res) => {
  const date = new Date();
  // London is UTC + 1hr;
  const hours = (date.getHours() % 12) + 1;
  res.send(`
    <!doctype html>
    <head>
      <title>Time</title>
      <link rel="stylesheet" href="/style.css">
      <script src="/script.js"></script>
    </head>
    <body>
      <p>In London, the clock strikes:
        <span id="bongs">${"BONG ".repeat(hours)}</span></p>
      <button onClick="refresh(this)">Refresh</button>
    </body>
  </html>`);
});

exports.express = functions.https.onRequest(app);
