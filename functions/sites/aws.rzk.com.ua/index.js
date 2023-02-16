const express = require("express");
const app = express();
const mqtt = require("mqtt");
// const fetch = require("node-fetch");
const port = 3000;

const client = mqtt.connect("mqtt://broker.hivemq.com");

app.get("/", async (req, res) => {
  res.send("Hello World!");
});

app.get("/on", async (req, res) => {
  // await fetch("http://10.66.66.8/on");
  client.publish("home/rele", "ON");
  res.send("Hello World on!");
});

app.get("/off", async (req, res) => {
  // await fetch("http://10.66.66.8/off");
  client.publish("home/rele", "OFF");
  res.send("Hello World off!");
});

app.get("/status", async (req, res) => {
  // await fetch("http://10.66.66.8/off");
  client.publish("home/rele", "status");
  res.send("Hello World off!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
