const functions = require("firebase-functions");

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
