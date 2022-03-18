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
      await bot.telegram.sendMessage(94899148, "<b>New order from " +
      `<a href="tg://user?id=${order.userId}">${order.lastName} ${order.firstName}</a>\n` +
      `Object ${order.objectName} from ${order.fromBot ? "BOT" : "SITE"}\n` +
      `Order ${order.userId}-${order.orderNumber}\n` +
      `<a href="https://${botConfig.site}/o/${order.objectId}/s/${orderId}">` +
      `https://${botConfig.site}/o/${order.objectId}/s/${orderId}</a></b>`, {parse_mode: "html"});
    });

// notify admin when create cart
exports.notifyNewCart = functions.region("europe-central2").firestore
    .document("objects/{objectId}/carts/{cartId}")
    .onCreate(async (snap, context) => {
      const objectId = context.params.objectId;
      const cartId = context.params.cartId;
      // admin notify
      await bot.telegram.sendMessage(94899148, "<b>New cart! " +
      `<a href="https://${botConfig.site}/o/${objectId}/share-cart/${cartId}">` +
      `https://${botConfig.site}/o/${objectId}/share-cart/${cartId}</a></b>`,
      {parse_mode: "html"});
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
        prefix: `photos/o/${objectId}/p/${productId}`,
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
        prefix: `photos/o/${objectId}/c/${catalogId}`,
      });
      return null;
    });
