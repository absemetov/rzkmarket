const functions = require("firebase-functions");
const firebase = require("firebase-admin");
const {Telegraf} = require("telegraf");
const botConfig = functions.config().env.bot;
const bot = new Telegraf(botConfig.token, {
  handlerTimeout: 540000,
});
// notify admin when new user
exports.notifyNewUser = functions.region("europe-central2").firestore
    .document("users/{userId}")
    .onCreate(async (snap, context) => {
      const user = snap.data();
      const userId = context.params.userId;
      // admin notify
      await bot.telegram.sendMessage(94899148, `<b>New subsc! <a href="tg://user?id=${userId}">${userId}</a>\n`+
      `Message: ${user.message}</b>`,
      {parse_mode: "html"});
    });

// notify admin when create order
exports.notifyNewOrder = functions.region("europe-central2").firestore
    .document("objects/{objectId}/orders/{orderId}")
    .onCreate(async (snap, context) => {
      const order = snap.data();
      const orderId = context.params.orderId;
      // admin notify
      await bot.telegram.sendMessage(94899148, `<b>New order from ${order.lastName} ${order.firstName}! ` +
      `Object ${order.objectName} Channel ${order.fromBot ? "bot" : "site"} ` +
      `<a href="https://${botConfig.site}/o/${order.objectId}/s/${orderId}">` +
      `Order ${order.userId}-${order.orderNumber}</a></b>`, {parse_mode: "html"});
    });
// add createdAt field to Products
exports.productSetCreatedAt = functions.region("europe-central2").firestore
    .document("objects/{objectId}/products/{docId}")
    .onCreate((snap, context) => {
      const newValue = snap.data();
      return snap.ref.set({
        createdAt: newValue.updatedAt,
      }, {merge: true});
    });
// add createdAt field to Catalogs
exports.catalogSetCreatedAt = functions.region("europe-central2").firestore
    .document("objects/{objectId}/catalogs/{docId}")
    .onCreate((snap, context) => {
      const newValue = snap.data();
      return snap.ref.set({
        createdAt: newValue.updatedAt,
      }, {merge: true});
    });
// delete product photos
exports.productPhotoDelete = functions.region("europe-central2").firestore
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
exports.catalogPhotoDelete = functions.region("europe-central2").firestore
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
