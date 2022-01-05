const functions = require("firebase-functions");
const firebase = require("firebase-admin");
const express = require("express");
const exphbs = require("express-handlebars");
const {store} = require("../.././bot_store_cart.js");
const {roundNumber} = require("../.././bot_start_scene");
const botConfig = functions.config().env.bot;
const {createHash, createHmac} = require("crypto");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const app = express();
app.set("trust proxy", 1);
app.use(cookieParser());
// Configure template Engine and Main Template File
const hbs = exphbs.create({
  extname: ".hbs",
});
app.engine("hbs", hbs.engine);
// Setting template Engine
app.set("view engine", "hbs");
app.set("views", "./sites/rzk.com.ru/views");

// show objects
app.get("/", async (req, res) => {
  // Cookies that have not been signed
  console.log("Cookies: ", req.cookies);
  // Cookies that have been signed
  console.log("Signed Cookies: ", req.signedCookies);
  const objects = await store.findAll("objects");
  // Set Cache-Control
  res.set("Cache-Control", "public, max-age=300, s-maxage=600");
  res.render("index", {objects});
});

// show object
app.get("/o/:objectId", async (req, res) => {
  const object = await store.findRecord(`objects/${req.params.objectId}`);
  // Set Cache-Control
  res.set("Cache-Control", "public, max-age=300, s-maxage=600");
  res.render("object", {title: object.name, object});
});

// show catalogs
app.get("/o/:objectId/c/:catalogId?", async (req, res) => {
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
      url: `/o/${object.id}/c/${doc.id}`,
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
        url: `/o/${object.id}/c/${currentCatalog.id}?tag=${tag.id}`,
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
        url: `/o/${object.id}/p/${product.id}`,
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
          url: `/o/${object.id}/c/${currentCatalog.id}?endBefore=${endBeforeSnap.id}${tagUrl}`,
        });
      }
      // startAfter
      const startAfterSnap = productsSnapshot.docs[productsSnapshot.docs.length - 1];
      const ifAfterProducts = await mainQuery.startAfter(startAfterSnap).limit(1).get();
      if (!ifAfterProducts.empty) {
        prevNextLinks.push({
          text: "➡️ Вперед",
          url: `/o/${object.id}/c/${currentCatalog.id}?startAfter=${startAfterSnap.id}${tagUrl}`,
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
app.get("/o/:objectId/p/:productId", async (req, res) => {
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

// login with telegram
app.get("/login", async (req, res) => {
  if (checkSignature(req.query)) {
    console.log(req.query.id);
    const token = jwt.sign({id: req.query.id}, "YOUR_SECRET_KEY");
    return res.cookie("access_token", token, {
      httpOnly: true,
      secure: !process.env.FUNCTIONS_EMULATOR,
    }).status(200).json({message: "Logged in successfully 😊 👌"});
  }
  // id: '94899148',
  // first_name: 'Nadir',
  // last_name: 'Absemetov',
  // username: 'absemetov',
  // photo_url: 'https://t.me/i/userpic/320/XwwSUj6w6zhMF0-u3p2gUo2MJhMYvZu7lhdWhsdAXlI.jpg',
  // auth_date: '1641368285'
  // data is authenticated
  // create session, redirect user etc.
  // data is not authenticated
  // Set Cache-Control
  res.set("Cache-Control", "public, max-age=300, s-maxage=600");
  res.render("login");
});

const authorization = (req, res, next) => {
  const token = req.cookies.access_token;
  console.log("token", token);
  if (!token) {
    return res.sendStatus(403);
  }
  try {
    const data = jwt.verify(token, "YOUR_SECRET_KEY");
    req.userId = data.id;
    console.log("id", data.id);
    return next();
  } catch {
    return res.sendStatus(403);
  }
};

app.get("/protected", authorization, (req, res) => {
  return res.json({user: {id: req.userId}});
});

app.get("/logout", authorization, (req, res) => {
  return res
      .clearCookie("access_token")
      .status(200)
      .json({message: "Successfully logged out 😏 🍀"});
});
// We'll destructure req.query to make our code clearer
const checkSignature = ({hash, ...userData}) => {
  // create a hash of a secret that both you and Telegram know. In this case, it is your bot token
  const secretKey = createHash("sha256")
      .update(botConfig.token)
      .digest();
  // this is the data to be authenticated i.e. telegram user id, first_name, last_name etc.
  const dataCheckString = Object.keys(userData)
      .sort()
      .map((key) => (`${key}=${userData[key]}`))
      .join("\n");
  // run a cryptographic hash function over the data to be authenticated and the secret
  const hmac = createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");
  // compare the hash that you calculate on your side (hmac) with what Telegram sends you (hash) and return the result
  return hmac === hash;
};

// config GCP
const runtimeOpts = {
  timeoutSeconds: 540,
  memory: "1GB",
};

exports.express = functions.runWith(runtimeOpts).https.onRequest(app);
