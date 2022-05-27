const functions = require("firebase-functions");
const firebase = require("firebase-admin");
const {uploadProducts} = require("./bot_upload_scene");
const {Telegraf} = require("telegraf");
const algoliasearch = require("algoliasearch");
const bot = new Telegraf(process.env.BOT_TOKEN, {
  handlerTimeout: 540000,
});
const bucket = firebase.storage().bucket();
const algoliaClient = algoliasearch(process.env.ALGOLIA_ID, process.env.ALGOLIA_ADMIN_KEY);
const productsIndex = algoliaClient.initIndex("products");
const catalogsIndex = algoliaClient.initIndex("dev_catalogs");
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
      `<a href="https://${process.env.BOT_SITE}/o/${order.objectId}/s/${orderId}">` +
      `https://${process.env.BOT_SITE}/o/${order.objectId}/s/${orderId}</a></b>`, {parse_mode: "html"});
    });

// notify admin when create cart
exports.notifyNewCart = functions.region("europe-central2").firestore
    .document("objects/{objectId}/carts/{cartId}")
    .onCreate(async (snap, context) => {
      const objectId = context.params.objectId;
      const cartId = context.params.cartId;
      // admin notify
      await bot.telegram.sendMessage(94899148, "<b>New cart! " +
      `<a href="https://${process.env.BOT_SITE}/o/${objectId}/share-cart/${cartId}">` +
      `https://${process.env.BOT_SITE}/o/${objectId}/share-cart/${cartId}</a></b>`,
      {parse_mode: "html"});
    });

// add createdAt field to Products
// and add data to Algolia index
exports.productCreate = functions.region("europe-central2").firestore
    .document("objects/{objectId}/products/{productId}")
    .onCreate(async (snap, context) => {
      const product = snap.data();
      const objectID = context.params.productId;
      const productAlgolia = {
        objectID,
        name: product.name,
      };
      // add data to Algolia
      await productsIndex.saveObject(productAlgolia);
      // return a promise of a set operation to update the count
      return snap.ref.set({
        createdAt: product.updatedAt,
      }, {merge: true});
    });
// update product data
exports.productUpdate = functions.region("europe-central2").firestore
    .document("objects/{objectId}/products/{productId}")
    .onUpdate(async (change, context) => {
      const product = change.after.data();
      const objectID = context.params.productId;
      const productAlgolia = {
        objectID,
        name: product.name,
      };
      // update data in Algolia
      await productsIndex.saveObject(productAlgolia);
      // return a promise of a set operation to update the count
      return null;
    });
// delete product
exports.productDelete = functions.region("europe-central2").firestore
    .document("objects/{objectId}/products/{productId}")
    .onDelete(async (snap, context) => {
      const objectId = context.params.objectId;
      const productId = context.params.productId;
      // delete data in Algolia
      await productsIndex.deleteObject(productId);
      // delete photo from storage
      await bucket.deleteFiles({
        prefix: `photos/o/${objectId}/p/${productId}`,
      });
      return null;
    });
// add createdAt field to Catalogs
exports.catalogCreate = functions.region("europe-central2").firestore
    .document("objects/{objectId}/catalogs/{catalogId}")
    .onCreate(async (snap, context) => {
      const catalog = snap.data();
      const objectID = context.params.catalogId;
      const catalogAlgolia = {
        objectID,
        name: catalog.name,
      };
      // add data to Algolia
      await catalogsIndex.saveObject(catalogAlgolia);
      // add created value
      return snap.ref.set({
        createdAt: catalog.updatedAt,
      }, {merge: true});
    });
// update catalog event
exports.catalogUpdate = functions.region("europe-central2").firestore
    .document("objects/{objectId}/catalogs/{catalogId}")
    .onUpdate(async (change, context) => {
      const catalog = change.after.data();
      const objectID = context.params.catalogId;
      const catalogAlgolia = {
        objectID,
        name: catalog.name,
      };
      // update data in Algolia
      await catalogsIndex.saveObject(catalogAlgolia);
      // return a promise of a set operation to update the count
      return null;
    });
// delete catalog photos
exports.catalogDelete = functions.region("europe-central2").firestore
    .document("objects/{objectId}/catalogs/{catalogId}")
    .onDelete(async (snap, context) => {
      const objectId = context.params.objectId;
      const catalogId = context.params.catalogId;
      // delete from Algolia
      await catalogsIndex.deleteObject(catalogId);
      // delete photo catalog
      await bucket.deleteFiles({
        prefix: `photos/o/${objectId}/c/${catalogId}`,
      });
      return null;
    });
// upload products trigger
exports.productsUpload = functions.region("europe-central2").firestore
    .document("objects/{objectId}")
    .onUpdate(async (change, context) => {
      const objectId = context.params.objectId;
      // Retrieve the current and previous value
      const data = change.after.data();
      const previousData = change.before.data();

      // We'll only update if the upload start has changed.
      // This is crucial to prevent infinite loops.
      if (data.uploadProductsStart == previousData.uploadProductsStart) {
        return null;
      }
      // start uploading
      try {
        await uploadProducts(bot.telegram, objectId, data.sheetId);
      } catch (error) {
        // await ctx.replyWithMarkdown(`Sheet ${error}`);
        await bot.telegram.sendMessage(94899148, `<b>Sheet ${error}</b>`,
            {parse_mode: "html"});
      }
      // the current timestamp
      const uploadProductsFinish = Math.floor(Date.now() / 1000);

      // Then return a promise of a set operation to update the count
      return change.after.ref.set({
        uploadProductsFinish,
      }, {merge: true});
    });
