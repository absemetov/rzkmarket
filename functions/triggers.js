const functions = require("firebase-functions");
const {photoCheckUrl, deletePhotoStorage} = require("./bot/bot_store_cart");
const {Telegraf} = require("telegraf");
const algoliasearch = require("algoliasearch");
const bot = new Telegraf(process.env.BOT_TOKEN, {
  handlerTimeout: 540000,
});
const algoliaClient = algoliasearch(process.env.ALGOLIA_ID, process.env.ALGOLIA_ADMIN_KEY);
const productsIndex = algoliaClient.initIndex(`${process.env.ALGOLIA_PREFIX}products`);
const catalogsIndex = algoliaClient.initIndex(`${process.env.ALGOLIA_PREFIX}catalogs`);
// notify admin when new user
exports.notifyNewUser = functions.region("europe-central2").firestore
    .document("users/{userId}")
    .onCreate(async (snap, context) => {
      const userId = context.params.userId;
      // admin notify
      await bot.telegram.sendMessage(94899148, `<b>New subsc! <a href="tg://user?id=${userId}">${userId}</a>`, {parse_mode: "html"});
      // add timestamp
      return snap.ref.set({
        createdAt: Math.floor(Date.now() / 1000),
      }, {merge: true});
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
      `Object ${order.objectName}\n` +
      `Order ${order.userId}-${order.orderNumber}\n` +
      `<a href="${process.env.BOT_SITE}/o/${order.objectId}/s/${orderId}">` +
      `${process.env.BOT_SITE}/o/${order.objectId}/s/${orderId}</a>\nfrom ${order.fromBot ? "BOT" : "SITE"}</b>`, {parse_mode: "html"});
      return null;
    });

// notify admin when create cart
exports.notifyNewCart = functions.region("europe-central2").firestore
    .document("objects/{objectId}/carts/{cartId}")
    .onCreate(async (snap, context) => {
      const objectId = context.params.objectId;
      const cartId = context.params.cartId;
      // admin notify
      await bot.telegram.sendMessage(94899148, "<b>New cart! " +
      `<a href="${process.env.BOT_SITE}/o/${objectId}/share-cart/${cartId}">` +
      `${process.env.BOT_SITE}/o/${objectId}/share-cart/${cartId}</a></b>`,
      {parse_mode: "html"});
      const cart = snap.data();
      return snap.ref.set({
        createdAt: cart.updatedAt,
      }, {merge: true});
    });

// add createdAt field to Products
// and add data to Algolia index
exports.productCreate = functions.region("europe-central2").firestore
    .document("objects/{objectId}/products/{productId}")
    .onCreate(async (snap, context) => {
      const product = snap.data();
      const productId = context.params.productId;
      const objectId = context.params.objectId;
      // add data to Algolia
      const productAlgolia = {
        objectID: `${objectId}-${productId}`,
        name: product.name,
        orderNumber: product.orderNumber,
        productId,
        seller: product.objectName,
        sellerId: objectId,
      };
      if (product.brand) {
        productAlgolia.brand = product.brand;
      }
      // add subCategory
      if (product.tagsNames) {
        productAlgolia.subCategory = product.tagsNames.map((item) => item.name);
      }
      // add default photo
      // for (const zoom of [1, 2]) {
      //   const imgUrl = await photoCheckUrl();
      //   productAlgolia[`img${zoom}`] = imgUrl;
      // }
      // create HierarchicalMenu
      const groupString = product.catalogsNamePath.split("#");
      const helpArray = [];
      // add first object name
      groupString.forEach((item, index) => {
        helpArray.push(item);
        productAlgolia[`categories.lvl${index}`] = helpArray.join(" > ");
      });
      // const productAlgoliaHierarchicalMenu = Object.assign(productAlgolia, objProp);
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
      const objectId = context.params.objectId;
      const productId = context.params.productId;
      // update data in Algolia
      const productAlgolia = {
        objectID: `${objectId}-${productId}`,
        name: product.name,
        orderNumber: product.orderNumber,
        productId,
        seller: product.objectName,
        sellerId: objectId,
      };
      // add brand if changed
      if (product.brand) {
        productAlgolia.brand = product.brand;
      }
      // add subCategory
      if (product.tagsNames) {
        productAlgolia.subCategory = product.tagsNames.map((item) => item.name);
      }
      // add photos if changed
      if (product.mainPhoto) {
        for (const zoom of [1, 2]) {
          const imgUrl = await photoCheckUrl(`photos/o/${objectId}/p/${productId}/${product.mainPhoto}/${zoom}.jpg`,
            product.mainPhoto ? true : false);
          if (imgUrl) {
            productAlgolia[`img${zoom}`] = imgUrl;
          } else {
            await bot.telegram.sendMessage(94899148, `Photo load error productId: ${productId} zoom: ${zoom} photoId ${product.mainPhoto}`,
                {parse_mode: "html"});
          }
        }
      }
      // create HierarchicalMenu
      const groupString = product.catalogsNamePath.split("#");
      const helpArray = [];
      groupString.forEach((item, index) => {
        helpArray.push(item);
        productAlgolia[`categories.lvl${index}`] = helpArray.join(" > ");
      });
      // const productAlgoliaHierarchicalMenu = Object.assign(productAlgolia, objProp);
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
      await productsIndex.deleteObject(`${objectId}-${productId}`);
      // delete photo from storage
      // await bucket.deleteFiles({
      //   prefix: `photos/o/${objectId}/p/${productId}`,
      // });
      await deletePhotoStorage(`photos/o/${objectId}/p/${productId}`);
      return null;
    });
// add createdAt field to Catalogs
exports.catalogCreate = functions.region("europe-central2").firestore
    .document("objects/{objectId}/catalogs/{catalogId}")
    .onCreate(async (snap, context) => {
      const catalog = snap.data();
      const catalogId = context.params.catalogId;
      const catalogAlgolia = {
        objectID: catalogId,
        name: catalog.name,
        orderNumber: catalog.orderNumber,
        hierarchicalUrl: catalog.hierarchicalUrl,
      };
      // add default photo
      // for (const zoom of [1, 2]) {
      //   const imgUrl = await photoCheckUrl();
      //   catalogAlgolia[`img${zoom}`] = imgUrl;
      // }
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
      const catalogId = context.params.catalogId;
      const objectId = context.params.objectId;
      const catalogAlgolia = {
        objectID: catalogId,
        name: catalog.name,
        orderNumber: catalog.orderNumber,
        hierarchicalUrl: catalog.hierarchicalUrl,
      };
      // add photos if changed
      if (catalog.photoId) {
        for (const zoom of [1, 2]) {
          const imgUrl = await photoCheckUrl(`photos/o/${objectId}/c/${catalogId}/${catalog.photoId}/${zoom}.jpg`, true);
          if (imgUrl) {
            catalogAlgolia[`img${zoom}`] = imgUrl;
          } else {
            await bot.telegram.sendMessage(94899148, `Photo load error catalogId: ${catalogId} zoom: ${zoom}`,
                {parse_mode: "html"});
          }
        }
      }
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
      // await bucket.deleteFiles({
      //   prefix: `photos/o/${objectId}/c/${catalogId}`,
      // });
      await deletePhotoStorage(`photos/o/${objectId}/c/${catalogId}`);
      return null;
    });
