const functions = require("firebase-functions");
const firebase = require("firebase-admin");
// add createdAt field
exports.productSetCreatedAt = functions.firestore
    .document("products/{docId}")
    .onCreate((snap, context) => {
      const newValue = snap.data();
      return snap.ref.set({
        createdAt: newValue.updatedAt,
      }, {merge: true});
    });
// delete photos
exports.productPhotoDelete = functions.firestore
    .document("products/{productId}")
    .onDelete(async (snap, context) => {
      const bucket = firebase.storage().bucket();
      const productId = context.params.productId;
      await bucket.deleteFiles({
        prefix: `photos/products/${productId}`,
      });
      return null;
    });
// add createdAt field
exports.catalogSetCreatedAt = functions.firestore
    .document("catalogs/{docId}")
    .onCreate((snap, context) => {
      const newValue = snap.data();
      return snap.ref.set({
        createdAt: newValue.updatedAt,
      }, {merge: true});
    });
