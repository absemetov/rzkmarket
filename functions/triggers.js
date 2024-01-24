// 2nd generation functions
const {onDocumentCreated, onDocumentUpdated, onDocumentDeleted} = require("firebase-functions/v2/firestore");
const {FieldValue} = require("firebase-admin/firestore");
// const functions = require("firebase-functions");
const {photoCheckUrl, deletePhotoStorage, store} = require("./bot/bot_store_cart");
const {Telegraf} = require("telegraf");
const algoliasearch = require("algoliasearch");
const bot = new Telegraf(process.env.BOT_TOKEN);
const algoliaClient = algoliasearch(process.env.ALGOLIA_ID, process.env.ALGOLIA_ADMIN_KEY);
const productsIndex = algoliaClient.initIndex(`${process.env.ALGOLIA_PREFIX}products`);
const catalogsIndex = algoliaClient.initIndex(`${process.env.ALGOLIA_PREFIX}catalogs`);
const ordersIndex = algoliaClient.initIndex(`${process.env.ALGOLIA_PREFIX}orders`);
// notify admin when new user
// 2nd gen
exports.userCreateSecondGen = onDocumentCreated({
  document: "users/{userId}",
  region: "europe-central2",
  maxInstances: 5}, async (event) => {
  const userId = event.params.userId;
  const user = event.data.data();
  // admin notify
  await bot.telegram.sendMessage(94899148, `New subsc! <a href="tg://user?id=${userId}">${userId}</a>\nFrom: ${JSON.stringify(user.from)}`, {parse_mode: "html"});
  // add createdAt timestamp
  // return snap.ref.set({
  //   createdAt: Math.floor(Date.now() / 1000),
  // }, {merge: true});
  return null;
});

// notify admin when create order
// 2nd gen
exports.orderCreateSecondGen = onDocumentCreated({
  document: "objects/{objectId}/orders/{orderId}",
  region: "europe-central2",
  maxInstances: 5}, async (event) => {
  const order = event.data.data();
  const objectId = event.params.objectId;
  const orderId = event.params.orderId;
  // NEW increment numberSail
  for (const product of order.products) {
    await store.createRecord(`objects/${objectId}/products/${product.productId}`, {
      numberOrders: FieldValue.increment(1),
      numberSails: FieldValue.increment(product.qty),
    });
  }
  // algolia order index
  const orderAlgolia = {
    objectID: orderId,
    createdAt: order.createdAt,
    orderNumber: `${order.userId}-${order.orderNumber}`,
    firstName: order.firstName,
    lastName: order.lastName,
    sellerId: objectId,
    objectName: order.objectName,
    phoneNumber: order.phoneNumber,
    address: order.address,
    comment: order.comment,
    status: store.statuses().get(order.statusId),
  };
  await ordersIndex.saveObject(orderAlgolia);
  // admin notify
  const param = btoa(`o_${objectId}_o_${orderId}`);
  await bot.telegram.sendMessage(94899148, "<b>New order from " +
  `<a href="tg://user?id=${order.userId}">${order.lastName} ${order.firstName}</a>\n` +
  `Object ${order.objectName}\n` +
  `Order ${order.userId}-${order.orderNumber}\n` +
  `https://t.me/${process.env.BOT_NAME}?start=${param}\n` +
  `${process.env.BOT_SITE}/o/${order.objectId}/s/${orderId}\nfrom ${order.fromBot ? "BOT" : "SITE"}</b>`, {parse_mode: "html"});
  return null;
});
// update order
// 2nd gen
exports.orderUpdateSecondGen = onDocumentUpdated({
  document: "objects/{objectId}/orders/{orderId}",
  region: "europe-central2",
  maxInstances: 5}, async (event) => {
  const order = event.data.after.data();
  const orderId = event.params.orderId;
  // algolia order index
  const orderAlgolia = {
    objectID: orderId,
    createdAt: order.createdAt,
    orderNumber: `${order.userId}-${order.orderNumber}`,
    firstName: order.firstName,
    lastName: order.lastName,
    sellerId: order.objectId,
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
// 2nd gen
exports.cartCreateSecondGen = onDocumentCreated({
  document: "carts/{cartId}",
  region: "europe-central2",
  maxInstances: 5}, async (event) => {
  // const objectId = event.params.objectId;
  const cartId = event.params.cartId;
  const cart = event.data.data();
  let user;
  if (!isNaN(cartId)) {
    user = `<a href="tg://user?id=${cartId}">${cartId}</a>`;
  } else {
    user = "anonim";
  }
  if (cartId !== "94899148") {
    await bot.telegram.sendMessage(94899148, `<b>New cart from ${user}\n` +
    `<a href="${process.env.BOT_SITE}/share-cart/${cartId}">` +
    `${process.env.BOT_SITE}/share-cart/${cartId}</a>\nChannel ${cart.fromBot ? "BOT" : "SITE"}</b>`,
    {parse_mode: "html"});
  }
  // const cart = snap.data();
  // return snap.ref.set({
  //   createdAt: cart.updatedAt,
  // }, {merge: true});
  return null;
});

// add createdAt field to Products
// 2nd gen
exports.productCreateSecondGen = onDocumentCreated({
  document: "objects/{objectId}/products/{productId}",
  region: "europe-central2",
  maxInstances: 5}, async (event) => {
  const product = event.data.data();
  const productId = event.params.productId;
  const objectId = event.params.objectId;
  // add data to Algolia
  const productAlgolia = {
    objectID: `${objectId}-${productId}`,
    productId,
    name: product.name,
    price: product.price,
    orderNumber: product.orderNumber,
    unit: product.unit,
    availability: product.availability,
    seller: product.objectName,
    sellerId: objectId,
    path: product.catalogId.replace(/#/g, "/"),
  };
  if (product.brand) {
    productAlgolia.brand = product.brand;
  }
  if (product.brandSite) {
    productAlgolia.brandSite = product.brandSite;
  }
  if (product.nameRu) {
    productAlgolia.nameRu = product.nameRu;
  }
  // add subCategory
  if (product.tags) {
    // productAlgolia.subCategory = product.tagsNames.map((item) => item.name);
    productAlgolia.subCategory = product.tags;
  }
  // create HierarchicalMenu
  // const groupString = product.catalogsNamePath.split("#");
  const helpArray = [];
  // add first object name
  product.pathArray.map((catalog) => catalog.name).forEach((catalogName, index) => {
    helpArray.push(catalogName);
    productAlgolia[`categories.lvl${index}`] = helpArray.join(" > ");
  });
  await productsIndex.saveObject(productAlgolia);
  return null;
});

// update product data
// 2nd gen
exports.productUpdateSecondGen = onDocumentUpdated({
  document: "objects/{objectId}/products/{productId}",
  region: "europe-central2",
  maxInstances: 5}, async (event) => {
  const product = event.data.after.data();
  // ...or the previous value before this update
  const previousValueProduct = event.data.before.data();
  const objectId = event.params.objectId;
  const productId = event.params.productId;
  // update data in Algolia
  const productAlgolia = {
    objectID: `${objectId}-${productId}`,
    productId,
    name: product.name,
    price: product.price,
    orderNumber: product.orderNumber,
    unit: product.unit,
    availability: product.availability,
    seller: product.objectName,
    sellerId: objectId,
    path: product.catalogId.replace(/#/g, "/"),
  };
  // add brand if changed
  if (product.brand) {
    productAlgolia.brand = product.brand;
  }
  if (product.brandSite) {
    productAlgolia.brandSite = product.brandSite;
  }
  // ru locale
  if (product.nameRu) {
    productAlgolia.nameRu = product.nameRu;
  }
  // add subCategory
  if (product.tags) {
    // productAlgolia.subCategory = product.tagsNames.map((item) => item.name);
    productAlgolia.subCategory = product.tags;
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
  return null;
});

// delete product
// 2nd gen
exports.productDeleteSecondGen = onDocumentDeleted({
  document: "objects/{objectId}/products/{productId}",
  region: "europe-central2",
  maxInstances: 5}, async (event) => {
  const objectId = event.params.objectId;
  const productId = event.params.productId;
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
// 2nd gen
exports.catalogCreateSecondGen = onDocumentCreated({
  document: "catalogs/{catalogId}",
  region: "europe-central2",
  maxInstances: 5}, async (event) => {
  const catalog = event.data.data();
  const catalogId = event.params.catalogId;
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
// 2nd gen
exports.catalogUpdateSecondGen = onDocumentUpdated({
  document: "catalogs/{catalogId}",
  region: "europe-central2",
  maxInstances: 5}, async (event) => {
  const catalog = event.data.after.data();
  // ...or the previous value before this update
  const previousValueCatalog = event.data.before.data();
  const catalogId = event.params.catalogId;
  // const objectId = event.params.objectId;
  const catalogAlgolia = {
    objectID: catalogId,
    name: catalog.name,
    orderNumber: catalog.orderNumber,
    hierarchicalUrl: catalog.pathArray.map((catalog) => catalog.name).join(" > "),
  };
  // add photos if changed
  if (catalog.photoId) {
    for (const zoom of [1, 2]) {
      const imgUrl = await photoCheckUrl(`photos/c/${catalogId.replace(/#/g, "-")}/${catalog.photoId}/${zoom}.jpg`, true);
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
// 2nd gen
exports.catalogDeleteSecondGen = onDocumentDeleted({
  document: "catalogs/{catalogId}",
  region: "europe-central2",
  maxInstances: 5}, async (event) => {
  // const objectId = event.params.objectId;
  const catalogId = event.params.catalogId;
  // delete from Algolia
  await catalogsIndex.deleteObject(catalogId);
  // delete photo catalog
  // await bucket.deleteFiles({
  //   prefix: `photos/o/${objectId}/c/${catalogId}`,
  // });
  await deletePhotoStorage(`photos/c/${catalogId.replace(/#/g, "-")}`);
  return null;
});
