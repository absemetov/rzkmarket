const admin = require("firebase-admin");
// init firebase service
admin.initializeApp();
// const app = require("./app");
const bot = require("./bot");
const express = require("./express");

// exports.app = app.app;
exports.bot = bot.bot;
exports.triggers = require("./triggers");
exports.express = express.express;

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
