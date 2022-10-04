// const admin = require("firebase-admin");
const {initializeApp} = require("firebase-admin/app");
// const functions = require("firebase-functions");
// init firebase service
initializeApp();
const {siteFunction} = require("./sites/rzk.com.ru");
const {botFunction} = require("./bot");
const {productsUploadFunction} = require("./bot/bot_upload_scene");

// exports.site = siteFunction;
exports.bot = botFunction;
exports.productsUpload = productsUploadFunction;
// exports.triggers = require("./triggers");
// Create and Deploy Your First Cloud Functions
// https://firebase.google.com/docs/functions/write-firebase-functions
// exports.helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
