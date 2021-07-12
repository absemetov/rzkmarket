const functions = require("firebase-functions");

exports.productCreatedAt = functions.firestore
    .document("catalogs/{docId}")
    .onWrite((change, context) => {
      const newValue = change.after.data();
      if (newValue.name === "Karre") {
        console.log("catalog Karre updated!");
      }
      return true;
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
      return true;
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
      return true;
    });
