const admin = require("firebase-admin");
const functions = require("firebase-functions");
// init firebase service
admin.initializeApp();
// const app = require("./app");
const bot = require("./bot");
const rzkComRu = require("./sites/rzk.com.ru");
const rzkComUa = require("./sites/rzk.com.ua");

// exports.app = app.app;
exports.bot = bot.bot;
exports.triggers = require("./triggers");
exports.rzkComRu = rzkComRu.express;
exports.rzkComUa = rzkComUa.express;

// // Create and Deploy Your First Cloud Functions
// https://firebase.google.com/docs/functions/write-firebase-functions

exports.helloWorld = functions.https.onRequest((request, response) => {
  functions.logger.info("Hello logs!", {structuredData: true});
  response.send("Hello from Firebase!");
});
