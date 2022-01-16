const functions = require("firebase-functions");
const firebase = require("firebase-admin");
const express = require("express");
const exphbs = require("express-handlebars");
const {store, cart} = require("../.././bot_store_cart.js");
const {roundNumber} = require("../.././bot_start_scene");
const botConfig = functions.config().env.bot;
const {createHash, createHmac} = require("crypto");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const jsonParser = bodyParser.json();
const Validator = require("validatorjs");
const busboy = require("busboy");
const app = express();
app.use(cookieParser());
// Configure template Engine and Main Template File
const hbs = exphbs.create({
  extname: ".hbs",
});
app.engine("hbs", hbs.engine);
// Setting template Engine
app.set("view engine", "hbs");
app.set("views", "./sites/rzk.com.ru/views");

// auth midleware
const auth = (req, res, next) => {
  req.user = {};
  try {
    const token = req.cookies.__session;
    const authData = jwt.verify(token, botConfig.token);
    req.user.auth = authData.auth;
    req.user.uid = authData.uid;
  } catch {
    req.user.auth = false;
    req.user.uid = null;
  }
  return next();
};

// show objects
app.get("/", auth, async (req, res) => {
  const objects = await store.findAll("objects");
  // generate cart link
  for (const obj of objects) {
    const cartProducts = await store.findRecord(`objects/${obj.id}/carts/${req.user.uid}`, "products");
    obj.cartCountGoods = cartProducts && Object.keys(cartProducts).length || 0;
  }
  // Set Cache-Control
  // res.set("Cache-Control", "public, max-age=300, s-maxage=600");
  res.render("index", {objects, user: req.user});
});

// show object
app.get("/o/:objectId", auth, async (req, res) => {
  const object = await store.findRecord(`objects/${req.params.objectId}`);
  // count cart items
  let cartCount = 0;
  if (req.user.uid) {
    cartCount = await cart.cartCount(object.id, req.user.uid);
  }
  object.cartCount = cartCount;
  // Set Cache-Control
  // res.set("Cache-Control", "public, max-age=300, s-maxage=600");
  res.render("object", {title: object.name, object, user: req.user});
});

// show catalogs
app.get("/o/:objectId/c/:catalogId?", auth, async (req, res) => {
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
      const productObj = {
        id: product.id,
        name: product.data().name,
        price: roundNumber(product.data().price * object[product.data().currency]),
        unit: product.data().unit,
        url: `/o/${objectId}/p/${product.id}`,
      };
      if (req.user.uid) {
        const cartProduct = await store.findRecord(`objects/${objectId}/carts/${req.user.uid}`,
            `products.${product.id}`);
        if (cartProduct) {
          productObj.qty = cartProduct.qty;
          productObj.sum = roundNumber(cartProduct.qty * cartProduct.price);
        }
      }
      // add to array
      products.push(productObj);
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
  // count cart items
  let cartCount = 0;
  if (req.user.uid) {
    cartCount = await cart.cartCount(object.id, req.user.uid);
  }
  object.cartCount = cartCount;
  // Set Cache-Control
  // res.set("Cache-Control", "public, max-age=300, s-maxage=600");
  res.render("catalog", {
    title,
    object,
    currentCatalog,
    catalogs,
    products,
    tags,
    prevNextLinks,
    user: req.user,
    currencyName: botConfig.currency,
  });
});

// show product
app.get("/o/:objectId/p/:productId", auth, async (req, res) => {
  const objectId = req.params.objectId;
  const productId = req.params.productId;
  const object = await store.findRecord(`objects/${objectId}`);
  const product = await store.findRecord(`objects/${objectId}/products/${productId}`);
  product.price = roundNumber(product.price * object[product.currency]);
  // get cart qty
  if (req.user.uid) {
    const cartProduct = await store.findRecord(`objects/${objectId}/carts/${req.user.uid}`,
        `products.${product.id}`);
    if (cartProduct) {
      product.qty = cartProduct.qty;
      product.sum = roundNumber(cartProduct.qty * cartProduct.price);
    }
  }
  // count cart items
  let cartCount = 0;
  if (req.user.uid) {
    cartCount = await cart.cartCount(object.id, req.user.uid);
  }
  object.cartCount = cartCount;
  // Set Cache-Control
  // res.set("Cache-Control", "public, max-age=300, s-maxage=600");
  res.render("product", {
    title: `${product.name} - ${object.name}`,
    description: `${product.name} - ${object.name}`,
    keywords: `${product.name}, ${object.name}`,
    object,
    product,
    user: req.user,
    currencyName: botConfig.currency,
  });
});

// login with telegram
app.get("/login", auth, async (req, res) => {
  if (req.user.auth) {
    return res.redirect("/");
  }
  if (checkSignature(req.query)) {
    // migrate cart if exist from all objects!!!
    if (req.user.uid) {
      const objects = await store.findAll("objects");
      // use for of for async func
      for (const obj of objects) {
        const products = await store.findRecord(`objects/${obj.id}/carts/${req.user.uid}`, "products");
        const productsImp = await store.findRecord(`objects/${obj.id}/carts/${req.query.id}`, "products");
        if (products) {
          if (productsImp) {
            await store.updateRecord(`objects/${obj.id}/carts/${req.query.id}`, {products});
          } else {
            await store.createRecord(`objects/${obj.id}/carts/${req.query.id}`, {products});
          }
        }
        await store.getQuery(`objects/${obj.id}/carts/${req.user.uid}`).delete();
      }
    }
    // create token
    const token = jwt.sign({uid: req.query.id, auth: true}, botConfig.token);
    // save token to cookie
    return res.cookie("__session", token, {
      httpOnly: true,
      secure: true,
      maxAge: 18 * 24 * 60 * 60 * 1000,
    }).redirect("/");
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
  // res.set("Cache-Control", "public, max-age=300, s-maxage=600");
  res.render("login");
});

app.get("/logout", auth, (req, res) => {
  return res
      .clearCookie("__session")
      .redirect("/");
});

// show cart
app.get("/o/:objectId/cart", auth, async (req, res) => {
  const objectId = req.params.objectId;
  const object = await store.findRecord(`objects/${objectId}`);
  const title = `Корзина - ${object.name}`;
  const products = [];
  if (req.user.uid) {
    const cartProducts = await cart.products(objectId, req.user.uid);
    for (const [index, product] of cartProducts.entries()) {
      const productObj = {
        index: index + 1,
        id: product.id,
        name: product.name,
        price: product.price,
        unit: product.unit,
        url: `/o/${objectId}/p/${product.id}`,
      };
      if (req.user.uid) {
        const cartProduct = await store.findRecord(`objects/${objectId}/carts/${req.user.uid}`,
            `products.${product.id}`);
        if (cartProduct) {
          productObj.qty = cartProduct.qty;
          productObj.sum = roundNumber(cartProduct.qty * cartProduct.price);
        }
      }
      // add to array
      products.push(productObj);
    }
    // count cart items
    object.cartCount = cartProducts && Object.keys(cartProducts).length || 0;
  }
  res.render("cart", {
    title,
    object,
    products,
    user: req.user,
    currencyName: botConfig.currency,
  });
});
// create order
app.get("/o/:objectId/cart/purchase", auth, async (req, res) => {
  const objectId = req.params.objectId;
  const object = await store.findRecord(`objects/${objectId}`);
  const title = `Оформление заказа - ${object.name}`;
  // count cart items
  let cartCount = 0;
  if (req.user.uid) {
    cartCount = await cart.cartCount(object.id, req.user.uid);
  }
  object.cartCount = cartCount;
  res.render("purchase", {
    title,
    object,
    user: req.user,
    phoneregexp: botConfig.phoneregexp,
    phonetemplate: botConfig.phonetemplate,
    carriers: Array.from(store.carriers(), ([id, name]) => ({id, name})),
    payments: Array.from(store.payments(), ([id, name]) => ({id, name})),
  });
});
// save order
app.post("/cart/purchase", auth, (req, res) => {
  const bb = busboy({headers: req.headers});
  const fields = {};
  bb.on("field", (fieldname, val) => {
    /**
     *  TODO(developer): Process submitted field values here
     */
    fields[fieldname] = val;
  });
  bb.on("close", () => {
    return res.json({...fields, ...req.user});
  });
  bb.end(req.rawBody);
});
// cart add product
app.post("/cart/add", auth, jsonParser, async (req, res) => {
  // validate data
  const rulesProductRow = {
    "objectId": "required|alpha_dash|max:9",
    "id": "required|alpha_dash|max:16",
    "name": "required|string",
    "price": "required|numeric",
    "unit": "required|in:м,шт",
    "qty": "required|integer|min:0",
  };
  const validateProductRow = new Validator(req.body, rulesProductRow);
  if (validateProductRow.fails()) {
    let errorRow = "";
    for (const [key, error] of Object.entries(validateProductRow.errors.all())) {
      errorRow += `Key ${key} => ${error} \n`;
    }
    return res.status(422).json({error: errorRow});
  }
  // check uid
  if (!req.user.uid) {
    const newCartRef = firebase.firestore().collection("objects").doc(req.body.objectId).collection("carts").doc();
    const token = jwt.sign({uid: newCartRef.id, auth: false}, botConfig.token);
    req.user.uid = newCartRef.id;
    req.user.auth = false;
    // save token to cookie
    res.cookie("__session", token, {
      httpOnly: true,
      secure: true,
      maxAge: 15 * 24 * 60 * 60 * 1000,
    });
  }
  // add to cart
  let products = {};
  // add product
  if (req.body.qty) {
    if (req.body.added) {
      products = {
        [req.body.id]: {
          qty: req.body.qty,
        },
      };
    } else {
      products = {
        [req.body.id]: {
          name: req.body.name,
          price: req.body.price,
          unit: req.body.unit,
          qty: req.body.qty,
          createdAt: Math.floor(Date.now() / 1000),
        },
      };
    }
    await store.createRecord(`objects/${req.body.objectId}/carts/${req.user.uid}`, {products});
  }
  // remove product
  if (req.body.added && !req.body.qty) {
    await store.createRecord(`objects/${req.body.objectId}/carts/${req.user.uid}`,
        {"products": {
          [req.body.id]: firebase.firestore.FieldValue.delete(),
        }});
  }
  let cartCount = 0;
  if (req.user.uid) {
    cartCount = await cart.cartCount(req.body.objectId, req.user.uid);
  }
  return res.json({cartCount});
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
