// const admin = require("firebase-admin");
import {initializeApp} from "firebase-admin/app";
const functions = require("firebase-functions");
// init firebase service
initializeApp();
const bot = require("./bot");
const rzkComRu = require("./sites/rzk.com.ru");

export const rzkComUa = rzkComRu.express;
export const rzkComRu1 = rzkComRu.express;
export const botUa = bot.handle;
export const botRu = bot.handle;
export const triggers = require("./triggers");
// // Create and Deploy Your First Cloud Functions
// https://firebase.google.com/docs/functions/write-firebase-functions

export const helloWorld = functions.https.onRequest((request, response) => {
  functions.logger.info("Hello logs!", {structuredData: true});
  response.send("Hello from Firebase!");
});
