const app = require("./app");
const bot = require("./bot");

exports.app = app.app;
exports.bot = bot.bot;

const functions = require("firebase-functions");

exports.myFunction = functions.firestore
    .document("catalogs/{docId}")
    .onWrite((change, context) => {
      // Retrieve the current and previous value
      const data = change.after.data();
      const previousData = change.before.data();
      console.log("data", data);
      console.log("prevData", previousData);
      return null;
      // We'll only update if the name has changed.
      // This is crucial to prevent infinite loops.
      // if (data.name == previousData.name) {
      //   return null;
      // }
      // Then return a promise of a set operation to update the count
      // return change.after.ref.set({
      //   name_change_count: count + 1
      // }, {merge: true});
    });
// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
