const functions = require("firebase-functions");
const {photoCheckUrl, deletePhotoStorage, store} = require("./bot/bot_store_cart");
const {Telegraf} = require("telegraf");
const algoliasearch = require("algoliasearch");
const bot = new Telegraf(process.env.BOT_TOKEN);
const algoliaClient = algoliasearch(process.env.ALGOLIA_ID, process.env.ALGOLIA_ADMIN_KEY);
const productsIndex = algoliaClient.initIndex(`${process.env.ALGOLIA_PREFIX}products`);
const catalogsIndex = algoliaClient.initIndex(`${process.env.ALGOLIA_PREFIX}catalogs`);
const ordersIndex = algoliaClient.initIndex(`${process.env.ALGOLIA_PREFIX}orders`);
// notify admin when new user
exports.userCreate = functions.region("europe-central2").firestore
    .document("users/{userId}")
    .onCreate(async (snap, context) => {
      const userId = context.params.userId;
      // admin notify
      await bot.telegram.sendMessage(94899148, `<b>New subsc! <a href="tg://user?id=${userId}">${userId}</a>`, {parse_mode: "html"});
      // add createdAt timestamp
      // return snap.ref.set({
      //   createdAt: Math.floor(Date.now() / 1000),
      // }, {merge: true});
      return null;
    });

// notify admin when create order
exports.orderCreate = functions.region("europe-central2").firestore
    .document("objects/{objectId}/orders/{orderId}")
    .onCreate(async (snap, context) => {
      const order = snap.data();
      const orderId = context.params.orderId;
      // admin notify
      await bot.telegram.sendMessage(94899148, "<b>New order from " +
      `<a href="tg://user?id=${order.userId}">${order.lastName} ${order.firstName}</a>\n` +
      `Object ${order.objectName}\n` +
      `Order ${store.formatOrderNumber(order.userId, order.orderNumber)}\n` +
      `<a href="${process.env.BOT_SITE}/o/${order.objectId}/s/${orderId}">` +
      `${process.env.BOT_SITE}/o/${order.objectId}/s/${orderId}</a>\nfrom ${order.fromBot ? "BOT" : "SITE"}</b>`, {parse_mode: "html"});
      // algolia order index
      const orderAlgolia = {
        objectID: orderId,
        createdAt: order.createdAt,
        orderNumber: store.formatOrderNumber(order.userId, order.orderNumber),
        firstName: order.firstName,
        lastName: order.lastName,
        objectId: order.objectId,
        objectName: order.objectName,
        phoneNumber: order.phoneNumber,
        address: order.address,
        comment: order.comment,
        status: store.statuses().get(order.statusId),
      };
      await ordersIndex.saveObject(orderAlgolia);
      return null;
    });

// update order
exports.orderUpdate = functions.region("europe-central2").firestore
    .document("objects/{objectId}/orders/{orderId}")
    .onUpdate(async (change, context) => {
      const order = change.after.data();
      const orderId = context.params.orderId;
      // algolia order index
      const orderAlgolia = {
        objectID: orderId,
        createdAt: order.createdAt,
        orderNumber: store.formatOrderNumber(order.userId, order.orderNumber),
        firstName: order.firstName,
        lastName: order.lastName,
        objectId: order.objectId,
        objectName: order.objectName,
        phoneNumber: order.phoneNumber,
        address: order.address,
        comment: order.comment,
        status: store.statuses().get(order.statusId),
      };
      await ordersIndex.saveObject(orderAlgolia);
      return null;
    });

// notify admin when create cart
exports.cartCreate = functions.region("europe-central2").firestore
    .document("objects/{objectId}/carts/{cartId}")
    .onCreate(async (snap, context) => {
      const objectId = context.params.objectId;
      const cartId = context.params.cartId;
      const cart = snap.data();
      let user;
      if (!isNaN(cartId)) {
        user = `<a href="tg://user?id=${cartId}">${cartId}</a>`;
      } else {
        user = "anonim";
      }
      await bot.telegram.sendMessage(94899148, `<b>New cart from ${user}\n` +
        `<a href="${process.env.BOT_SITE}/o/${objectId}/share-cart/${cartId}">` +
        `${process.env.BOT_SITE}/o/${objectId}/share-cart/${cartId}</a>\nChannel ${cart.fromBot ? "BOT" : "SITE"}</b>`,
      {parse_mode: "html"});
      // const cart = snap.data();
      // return snap.ref.set({
      //   createdAt: cart.updatedAt,
      // }, {merge: true});
      return null;
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
        // productAlgolia.subCategory = product.tagsNames.map((item) => item.name);
        productAlgolia.subCategory = product.tagsNames;
      }
      // create HierarchicalMenu
      // const groupString = product.catalogsNamePath.split("#");
      const helpArray = [];
      // add first object name
      product.pathArray.map((catalog) => catalog.name).forEach((catalogName, index) => {
        helpArray.push(catalogName);
        productAlgolia[`categories.lvl${index}`] = helpArray.join(" > ");
      });
      // const productAlgoliaHierarchicalMenu = Object.assign(productAlgolia, objProp);
      await productsIndex.saveObject(productAlgolia);
      // return a promise of a set operation to update the count
      //  delete this code!!! if this set trigger update run!!!
      // return snap.ref.set({
      //   createdAt: product.updatedAt,
      // }, {merge: true});
      return null;
    });
// update product data
exports.productUpdate = functions.region("europe-central2").firestore
    .document("objects/{objectId}/products/{productId}")
    .onUpdate(async (change, context) => {
      const product = change.after.data();
      // ...or the previous value before this update
      const previousValueProduct = change.before.data();
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
        // productAlgolia.subCategory = product.tagsNames.map((item) => item.name);
        productAlgolia.subCategory = product.tagsNames;
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
      // const groupString = product.catalogsNamePath.split("#");
      const helpArray = [];
      product.pathArray.map((catalog) => catalog.name).forEach((catalogName, index) => {
        helpArray.push(catalogName);
        productAlgolia[`categories.lvl${index}`] = helpArray.join(" > ");
      });
      // const productAlgoliaHierarchicalMenu = Object.assign(productAlgolia, objProp);
      await productsIndex.saveObject(productAlgolia);
      // check catalogId if product move
      if (previousValueProduct.catalogId !== product.catalogId) {
        await bot.telegram.sendMessage(94899148, `<b>Product changed catalogId!!! ${product.name} (${productId}) in row ${product.rowNumber}\n` +
        `from: ${previousValueProduct.pathArray.map((catalog) => catalog.name).join(" > ")}(${previousValueProduct.catalogId}) in row ${previousValueProduct.rowNumber}\n` +
        `to: ${product.pathArray.map((catalog) => catalog.name).join(" > ")} (${product.catalogId})</b>`,
        {parse_mode: "html"});
      }
      if (previousValueProduct.name !== product.name) {
        await bot.telegram.sendMessage(94899148, `<b>Product name changed!!! ${product.name} (${productId}) in row ${product.rowNumber}\n` +
        `previousValue is: ${previousValueProduct.name} in row ${previousValueProduct.rowNumber}</b>`,
        {parse_mode: "html"});
      }
      // if (previousValueProduct.rowNumber !== product.rowNumber) {
      //   await bot.telegram.sendMessage(94899148, `<b>Product rowNumber changed!!! ${product.name} (${productId})\n` +
      //   `previousValue is: ${previousValueProduct.rowNumber}\n` +
      //   `to row ${product.rowNumber}</b>`,
      //   {parse_mode: "html"});
      // }
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
        // hierarchicalUrl: catalog.hierarchicalUrl,
        hierarchicalUrl: catalog.pathArray.map((catalog) => catalog.name).join(" > "),
      };
      // add data to Algolia
      await catalogsIndex.saveObject(catalogAlgolia);
      // add created value
      // return snap.ref.set({
      //   createdAt: catalog.updatedAt,
      // }, {merge: true});
      return null;
    });
// update catalog event
exports.catalogUpdate = functions.region("europe-central2").firestore
    .document("objects/{objectId}/catalogs/{catalogId}")
    .onUpdate(async (change, context) => {
      const catalog = change.after.data();
      // ...or the previous value before this update
      const previousValueCatalog = change.before.data();
      const catalogId = context.params.catalogId;
      const objectId = context.params.objectId;
      const catalogAlgolia = {
        objectID: catalogId,
        name: catalog.name,
        orderNumber: catalog.orderNumber,
        hierarchicalUrl: catalog.pathArray.map((catalog) => catalog.name).join(" > "),
      };
      // add photos if changed
      if (catalog.photoId) {
        for (const zoom of [1, 2]) {
          const imgUrl = await photoCheckUrl(`photos/o/${objectId}/c/${catalogId.replace(/#/g, "-")}/${catalog.photoId}/${zoom}.jpg`, true);
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
      // check parentId if catalog move
      if (previousValueCatalog.parentId !== catalog.parentId) {
        await bot.telegram.sendMessage(94899148, `<b>Catalog moved!!! ${catalog.name} (${catalogId})\n` +
        `from: ${previousValueCatalog.pathArray.map((catalog) => catalog.name).join(" > ")}(${previousValueCatalog.parentId})\n` +
        `to: ${catalog.pathArray.map((catalog) => catalog.name).join(" > ")}(${catalog.parentId})</b>`,
        {parse_mode: "html"});
      }
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
      await deletePhotoStorage(`photos/o/${objectId}/c/${catalogId.replace(/#/g, "-")}`);
      return null;
    });
