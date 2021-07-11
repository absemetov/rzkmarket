const app = require("./app");
const bot = require("./bot");

exports.app = app.app;
exports.bot = bot.bot;

const functions = require("firebase-functions");

exports.productCreatedAt = functions.firestore
    .document("catalogs/{docId}")
    .onWrite((change, context) => {
      const newValue = change.after.data();
      if (newValue.name === "Karre") {
        console.log("catalog Karre updated!");
      }
      return null;
});

exports.productSetCreatedAt = functions.firestore
    .document("products/{docId}")
    .onCreate((snap, context) => {
      const newValue = snap.data();
      if (!newValue.createdAt) {
        return snap.ref.set({
          createdAt: newValue.updatedAt,
        }, {merge: true});
      }
      return null;
});

exports.catalogSetCreatedAt = functions.firestore
    .document("catalogs/{docId}")
    .onCreate((snap, context) => {
      const newValue = snap.data();
      if (!newValue.createdAt) {
        return snap.ref.set({
          createdAt: newValue.updatedAt,
        }, {merge: true});
      }
      return null;
});
// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
