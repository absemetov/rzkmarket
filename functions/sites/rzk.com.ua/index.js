const functions = require("firebase-functions");
const firebase = require("firebase-admin");
const express = require("express");
const exphbs = require("express-handlebars");
const {store} = require("../.././bot_store_cart.js");
const {roundNumber} = require("../.././bot_start_scene");
const botConfig = functions.config().env.bot;
const app = express();
// const serviceAccount = require("./rzk-warsaw-ru-firebase-adminsdk-nzfp6-0e594387ad.json");
// Initialize Firebase
// const rzkWarsawRu = admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
// }, "warsaw");
// Configure template Engine and Main Template File
const hbs = exphbs.create({
  extname: ".hbs",
});
app.engine("hbs", hbs.engine);
// Setting template Engine
app.set("view engine", "hbs");
app.set("views", "./sites/rzk.com.ua/views");

// show objects
app.get("/", async (req, res) => {
  const objects = await store.findAll("objects");
  // Set Cache-Control
  res.set("Cache-Control", "public, max-age=300, s-maxage=600");
  res.render("index", {objects});
});

// show object
app.get("/:objectId", async (req, res) => {
  const object = await store.findRecord(`objects/${req.params.objectId}`);
  // Set Cache-Control
  res.set("Cache-Control", "public, max-age=300, s-maxage=600");
  res.render("object", {title: object.name, object});
});

// show catalogs
app.get("/:objectId/c/:catalogId?", async (req, res) => {
  const objectId = req.params.objectId;
  const catalogId = req.params.catalogId;
  const selectedTag = req.query.tag;
  const startAfter = req.query.startAfter;
  const endBefore = req.query.endBefore;
  const object = await store.findRecord(`objects/${objectId}`);
  const currentCatalog = await store.findRecord(`objects/${objectId}/catalogs/${catalogId}`);
  let title = `Каталог - ${object.name}`;
  const catalogsSiblingsSnapshot = await firebase.firestore().collection("objects").doc(objectId)
      .collection("catalogs").where("parentId", "==", catalogId ? catalogId : null).orderBy("orderNumber").get();
  const catalogs = [];
  catalogsSiblingsSnapshot.docs.forEach((doc) => {
    catalogs.push({
      id: doc.id,
      name: doc.data().name,
      url: `/${object.id}/c/${doc.id}`,
    });
  });
  // products query
  const products = [];
  const prevNextLinks = [];
  const tags = [];
  if (currentCatalog) {
    title = `${currentCatalog.name} - ${object.name}`;
    let mainQuery = firebase.firestore().collection("objects").doc(objectId)
        .collection("products").where("catalog.id", "==", currentCatalog.id).orderBy("orderNumber");
    // Filter by tag
    let tagUrl = "";
    if (selectedTag) {
      mainQuery = mainQuery.where("tags", "array-contains", selectedTag);
      tagUrl = `&tag=${selectedTag}`;
    }
    for (const tag of currentCatalog.tags || []) {
      tags.push({
        text: `${tag.id === selectedTag ? "✅ " : ""} ${tag.name}`,
        url: `/${object.id}/c/${currentCatalog.id}?tag=${tag.id}`,
      });
      if (tag.id === selectedTag) {
        title = `${currentCatalog.name} - ${tag.name} - ${object.name}`;
      }
    }
    // paginate goods, copy main query
    let query = mainQuery;
    if (startAfter) {
      const startAfterProduct = await firebase.firestore().collection("objects").doc(objectId)
          .collection("products").doc(startAfter).get();
      query = query.startAfter(startAfterProduct);
    }
    // prev button
    if (endBefore) {
      const endBeforeProduct = await firebase.firestore().collection("objects").doc(objectId)
          .collection("products").doc(endBefore).get();
      query = query.endBefore(endBeforeProduct).limitToLast(10);
    } else {
      query = query.limit(10);
    }
    // get products
    const productsSnapshot = await query.get();
    // generate products array
    for (const product of productsSnapshot.docs) {
      products.push({
        id: product.id,
        name: product.data().name,
        price: roundNumber(product.data().price * object[product.data().currency]),
        currencyName: botConfig.currency,
        url: `/${object.id}/p/${product.id}`,
      });
    }
    // Set load more button
    if (!productsSnapshot.empty) {
      // endBefore prev button e paaram
      const endBeforeSnap = productsSnapshot.docs[0];
      const ifBeforeProducts = await mainQuery.endBefore(endBeforeSnap).limitToLast(1).get();
      if (!ifBeforeProducts.empty) {
        prevNextLinks.push({
          text: "⬅️ Назад",
          url: `/${object.id}/c/${currentCatalog.id}?endBefore=${endBeforeSnap.id}${tagUrl}`,
        });
      }
      // startAfter
      const startAfterSnap = productsSnapshot.docs[productsSnapshot.docs.length - 1];
      const ifAfterProducts = await mainQuery.startAfter(startAfterSnap).limit(1).get();
      if (!ifAfterProducts.empty) {
        prevNextLinks.push({
          text: "➡️ Вперед",
          url: `/${object.id}/c/${currentCatalog.id}?startAfter=${startAfterSnap.id}${tagUrl}`,
        });
      }
    }
  }
  // Set Cache-Control
  res.set("Cache-Control", "public, max-age=300, s-maxage=600");
  res.render("catalog", {
    title,
    object,
    currentCatalog,
    catalogs,
    products,
    tags,
    prevNextLinks,
  });
});
// show product
app.get("/:objectId/p/:productId", async (req, res) => {
  const objectId = req.params.objectId;
  const productId = req.params.productId;
  const object = await store.findRecord(`objects/${objectId}`);
  const product = await store.findRecord(`objects/${objectId}/products/${productId}`);
  product.price = roundNumber(product.price * object[product.currency]);
  product.currencyName = botConfig.currency;
  // Set Cache-Control
  res.set("Cache-Control", "public, max-age=300, s-maxage=600");
  res.render("product", {
    title: `${product.name} - ${object.name}`,
    object,
    product,
  });
});

const runtimeOpts = {
  timeoutSeconds: 540,
  memory: "1GB",
};

exports.express = functions.runWith(runtimeOpts).https.onRequest(app);
