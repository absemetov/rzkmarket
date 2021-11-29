const functions = require("firebase-functions");
const firebase = require("firebase-admin");
// add createdAt field
exports.productSetCreatedAt = functions.firestore
    .document("objects/{objectId}/products/{docId}")
    .onCreate((snap, context) => {
      const newValue = snap.data();
      return snap.ref.set({
        createdAt: newValue.updatedAt,
      }, {merge: true});
    });
// add createdAt field
exports.catalogSetCreatedAt = functions.firestore
    .document("objects/{objectId}/catalogs/{docId}")
    .onCreate((snap, context) => {
      const newValue = snap.data();
      return snap.ref.set({
        createdAt: newValue.updatedAt,
      }, {merge: true});
    });
// delete product photos
exports.productPhotoDelete = functions.firestore
    .document("objects/{objectId}/products/{productId}")
    .onDelete(async (snap, context) => {
      const bucket = firebase.storage().bucket();
      const objectId = context.params.objectId;
      const productId = context.params.productId;
      await bucket.deleteFiles({
        prefix: `photos/${objectId}/products/${productId}`,
      });
      return null;
    });
// delete catalog photos
exports.catalogPhotoDelete = functions.firestore
    .document("objects/{objectId}/catalogs/{catalogId}")
    .onDelete(async (snap, context) => {
      const bucket = firebase.storage().bucket();
      const objectId = context.params.objectId;
      const catalogId = context.params.catalogId;
      await bucket.deleteFiles({
        prefix: `photos/${objectId}/catalogs/${catalogId}`,
      });
      return null;
    });
