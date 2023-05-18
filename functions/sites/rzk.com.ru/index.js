const functions = require("firebase-functions");
const firebase = require("firebase-admin");
const firestore = require("firebase-admin/firestore");
const bucket = firebase.storage().bucket();
const express = require("express");
const exphbs = require("express-handlebars");
const {store, cart, roundNumber} = require("../.././bot/bot_store_cart.js");
const {algoliaIndexProducts} = require("../.././bot/bot_search");
const {createHash, createHmac} = require("crypto");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const jsonParser = express.json();
const Validator = require("validatorjs");
const busboy = require("busboy");
const moment = require("moment");
const cors = require("cors");
const TelegrafI18n = require("telegraf-i18n");
const path = require("path");
const {createPdf} = require("./createPdf.js");
const isbot = require("isbot");
// const fs = require("fs");
// const Translit = require("cyrillic-to-translit-js");
// const cyrillicToTranslit = new Translit();
// const cyrillicToTranslitUk = new Translit({preset: "uk"});
// locale
const i18n = new TelegrafI18n({
  directory: path.resolve(__dirname, "locales"),
});
const i18nContext = i18n.createContext(process.env.BOT_LANG);
// site env
const envSite = {
  i18n: i18nContext.repository[process.env.BOT_LANG],
  siteName: process.env.SITE_NAME,
  lang: process.env.BOT_LANG,
  currency: process.env.BOT_CURRENCY,
  priceCurrency: process.env.SITE_CURRENCY,
  gtag: process.env.SITE_GTAG,
  gmaps: process.env.BOT_GMAPS,
  email: process.env.BOT_EMAIL,
  botName: process.env.BOT_NAME,
  chatName: process.env.SITE_CHAT_NAME,
  phoneregexp: process.env.BOT_PHONEREGEXP,
  phonetemplate: process.env.BOT_PHONETEMPLATE,
  domain: process.env.BOT_SITE,
  devPrefix: process.env.ALGOLIA_PREFIX,
  channel: process.env.BOT_CHANNEL,
  postId: process.env.SITE_POST_ID,
};
const app = express();
// tralling slashes
app.use((req, res, next) => {
  if (req.path.substr(-1) == "/" && req.path.length > 1) {
    const query = req.url.slice(req.path.length);
    res.redirect(301, req.path.slice(0, -1) + query);
  } else {
    next();
  }
});
app.use(cors({origin: true}));
app.use(cookieParser());
// Configure template Engine and Main Template File
// function cyrillicUrl(value) {
//   // return cyrillicToTranslitUk.transform(cyrillicToTranslit.transform(value, "-")).toLowerCase();
//   return translit(value);
// }
const hbs = exphbs.create({
  extname: ".hbs",
  helpers: {
    formatNumber(value) {
      return value.toLocaleString("ru-Ru");
    },
    year() {
      return new Date().getFullYear();
    },
    photoProxy(src, locale) {
      // proxy img for Crimea
      // return locale === "ru" ? src.replace("storage", "i0.wp.com/storage") : src;
      return src.replace("storage.googleapis.com", "i0.wp.com/storage.googleapis.com");
    },
    not(value1, value2) {
      return value1 !== value2;
    },
    equals(value1, value2) {
      return value1 === value2;
    },
    last(value1, value2) {
      return value1 + 1 !== value2;
    },
    inc(value, inc) {
      return value + inc;
    },
    url(value) {
      return encodeURIComponent(value);
    },
    encodeUrl(botName, objectId, type, elementId, domain) {
      const param = btoa(`o_${objectId}_${type}_${elementId}`);
      if (type === "c" && param.length > 64) {
        return encodeURIComponent(`${domain}/o/${objectId}/c/${elementId.replace(/#/g, "/")}`);
      }
      if (type === "p" && param.length > 64) {
        return encodeURIComponent(`${domain}/o/${objectId}/p/${elementId}`);
      }
      return encodeURIComponent(`https://t.me/${botName}?start=${param}`);
    },
    encode(...value) {
      // delete options element
      return encodeURIComponent(value.filter((n) =>n).slice(0, -1).join(" - "));
    },
  },
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
    const authData = jwt.verify(token, process.env.BOT_TOKEN);
    req.user.auth = authData.auth;
    req.user.uid = authData.uid;
    req.user.firstName = authData.firstName;
  } catch {
    req.user.auth = false;
    req.user.uid = null;
  }
  envSite.user = req.user;
  envSite.notBot = !isbot(req.get("user-agent"));
  return next();
};

// show objects
app.get("/", auth, async (req, res) => {
  const catalogs = [];
  // get algolia catalogs
  if (envSite.notBot) {
    const catalogsAlgolia = await algoliaIndexProducts.search("", {
      hitsPerPage: 0,
      facets: ["categories.lvl0"],
    });
    for (const [catName, catCount] of Object.entries(catalogsAlgolia.facets["categories.lvl0"] || {})) {
      // const tagId = cyrillicUrl(tagName);
      // const tagId = encodeURIComponent(tagName);
      const catObj = {
        name: catName,
        count: catCount,
        url: encodeURIComponent(catName),
      };
      catalogs.push(catObj);
    }
  }
  const objects = await store.findAll("objects");
  // generate cart link
  for (const object of objects) {
    object.cartInfo = await cart.cartInfo(object.id, req.user.uid);
    if (object.photoId) {
      object.img1 = bucket.file(`photos/o/${object.id}/logo/${object.photoId}/1.jpg`).publicUrl();
      object.img2 = bucket.file(`photos/o/${object.id}/logo/${object.photoId}/2.jpg`).publicUrl();
    } else {
      object.img1 = "/icons/shop.svg";
      object.img2 = "/icons/shop.svg";
    }
  }
  // banners
  const banners = await store.findAll("banners");
  res.render("index", {objects, catalogs, banners, envSite});
});

// search products
app.get("/search*", auth, async (req, res) => {
  // const client = algoliasearch(process.env.ALGOLIA_ID, process.env.ALGOLIA_ADMIN_KEY);
  // const index = client.initIndex("products");
  // const query = req.query.q;
  // const page = req.query.p;
  // // get search resalts
  // const resalt = await index.search(query, {
  //   page,
  //   hitsPerPage: 40,
  // });
  res.render("search", {envSite});
});

// show object
app.get("/o/:objectId", auth, async (req, res) => {
  const object = await store.findRecord(`objects/${req.params.objectId}`);
  if (object) {
    // count cart items
    object.cartInfo = await cart.cartInfo(object.id, req.user.uid);
    if (object.photoId) {
      object.img1 = bucket.file(`photos/o/${object.id}/logo/${object.photoId}/1.jpg`).publicUrl();
      object.img2 = bucket.file(`photos/o/${object.id}/logo/${object.photoId}/2.jpg`).publicUrl();
    } else {
      object.img1 = "/icons/shop.svg";
      object.img2 = "/icons/shop.svg";
    }
    res.render("object", {
      title: `${object.description} - ${object.name}`,
      description: object.address,
      object,
      envSite});
  } else {
    // return res.redirect("/");
    console.log(`404 error: ${req.url}`);
    return res.status(404).send(`<h1>404! Page not found <a href="${envSite.domain}">${envSite.domain}</a></h1>`);
  }
});
// show

// show catalogs
app.get("/o/:objectId/c/:catalogPath(*)?", auth, async (req, res) => {
  const objectId = req.params.objectId;
  // const catalogId = req.params.catalogPath ? req.params.catalogPath.replace(/\/$/, "").split("/")[req.params.catalogPath.replace(/\/$/, "").split("/").length - 1] : null;
  const catalogId = req.params.catalogPath && req.params.catalogPath.replace(/\/+$/, "").replace(/\//g, "#") || null;
  const selectedTag = req.query.tag;
  const startAfter = req.query.startAfter;
  const endBefore = req.query.endBefore;
  // const path = req.path.replace(/\/+$/, "");
  const object = await store.findRecord(`objects/${objectId}`);
  if (!object) {
    console.log(`404 error: ${req.path}`);
    return res.status(404).send(`<h1>404! Page not found <a href="${envSite.domain}">${envSite.domain}</a></h1>`);
  }
  let currentCatalog = null;
  let title = `${envSite.i18n.aCatGoods()} - ${object.name}`;
  const catalogs = [];
  const tags = [];
  // get catalog sibl
  const catalogsSiblingsSnapshot = await firebase.firestore().collection("objects").doc(objectId)
      .collection("catalogs").where("parentId", "==", catalogId).orderBy("orderNumber").get();
  catalogsSiblingsSnapshot.docs.forEach((doc) => {
    const catalogSibl = {
      id: doc.id,
      name: doc.data().name,
      url: `/o/${objectId}/c/${doc.id.replace(/#/g, "/")}`,
    };
    if (doc.data().photoId) {
      catalogSibl.img1 = bucket.file(`photos/o/${object.id}/c/${doc.id.replace(/#/g, "-")}/${doc.data().photoId}/1.jpg`).publicUrl();
      catalogSibl.img2 = bucket.file(`photos/o/${object.id}/c/${doc.id.replace(/#/g, "-")}/${doc.data().photoId}/2.jpg`).publicUrl();
    } else {
      catalogSibl.img1 = "/icons/folder2.svg";
      catalogSibl.img2 = "/icons/folder2.svg";
    }
    catalogs.push(catalogSibl);
  });
  // products query
  const products = [];
  let prevLink = {};
  let nextLink = {};
  const tagActive = {};
  if (catalogId) {
    currentCatalog = await store.findRecord(`objects/${objectId}/catalogs/${catalogId}`);
    if (!currentCatalog) {
      console.log(`404 error: ${req.url}`);
      return res.status(404).send(`<h1>404! Page not found <a href="${envSite.domain}">${envSite.domain}</a></h1>`);
    }
    // generate title
    title = `${currentCatalog.name} ${envSite.i18n.btnBuy().toLowerCase()} ${envSite.i18n.siteCatTitle()} - ${object.name}`;
    let mainQuery = firebase.firestore().collection("objects").doc(objectId).collection("products")
        .where("catalogId", "==", catalogId).orderBy("orderNumber");
    // Filter by tag
    let tagUrl = "";
    if (selectedTag) {
      mainQuery = mainQuery.where("tags", "array-contains", selectedTag);
      tagUrl = `&tag=${selectedTag}`;
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
      query = query.endBefore(endBeforeProduct).limitToLast(12);
    } else {
      query = query.limit(12);
    }
    // get products
    const productsSnapshot = await query.get();
    // generate products array
    for (const product of productsSnapshot.docs) {
      const productObj = {
        id: product.id,
        name: product.data().name,
        brand: product.data().brand ? product.data().brand : null,
        // price: roundNumber(product.data().price * object.currencies[product.data().currency]),
        price: product.data().price,
        unit: product.data().unit,
        url: `/o/${objectId}/p/${product.id}`,
        img1: "/icons/flower3.svg",
        img2: "/icons/flower3.svg",
        sellerId: objectId,
        availability: product.data().availability,
      };
      if (req.user.uid) {
        const cartProduct = await store.findRecord(`objects/${objectId}/carts/${req.user.uid}`,
            `products.${product.id}`);
        if (cartProduct) {
          productObj.qty = cartProduct.qty;
          productObj.sum = roundNumber(cartProduct.qty * cartProduct.price);
        }
      }
      if (product.data().mainPhoto) {
        productObj.img1 = bucket.file(`photos/o/${objectId}/p/${product.id}/${product.data().mainPhoto}/1.jpg`)
            .publicUrl();
        productObj.img2 = bucket.file(`photos/o/${objectId}/p/${product.id}/${product.data().mainPhoto}/2.jpg`)
            .publicUrl();
      }
      // add to array
      products.push(productObj);
    }
    // Set load more button and tags Algolia
    if (!productsSnapshot.empty) {
      // get algolia tags if siblings empty
      if (catalogsSiblingsSnapshot.empty && envSite.notBot) {
        const pathNames = currentCatalog.pathArray.map((catalog) => catalog.name);
        const tagsAlgolia = await algoliaIndexProducts.search("", {
          hitsPerPage: 0,
          facets: ["subCategory"],
          facetFilters: [[`seller:${object.name}`], [`categories.lvl${pathNames.length - 1}:${pathNames.join(" > ")}`]],
        });
        for (const [tagName, tagCount] of Object.entries(tagsAlgolia.facets.subCategory || {})) {
          // const tagId = cyrillicUrl(tagName);
          // const tagId = encodeURIComponent(tagName);
          const tagObj = {
            text: `${tagName} (${tagCount})`,
            url: `${req.path}?tag=${encodeURIComponent(tagName)}`,
          };
          // close tag
          if (tagName === selectedTag) {
            // generate title
            title = `${currentCatalog.name} ${tagName} ${envSite.i18n.btnBuy().toLowerCase()} ${envSite.i18n.siteCatTitle()} - ${object.name}`;
            tagObj.active = true;
            tagActive.name = `${tagName} (${tagCount})`;
            tagActive.path = req.path;
          }
          tags.push(tagObj);
        }
      }
      // endBefore prev button e paaram
      const endBeforeSnap = productsSnapshot.docs[0];
      const ifBeforeProducts = await mainQuery.endBefore(endBeforeSnap).limitToLast(1).get();
      prevLink = {
        hide: ifBeforeProducts.empty,
        url: `${req.path}?endBefore=${endBeforeSnap.id}${tagUrl}`,
      };
      // startAfter
      const startAfterSnap = productsSnapshot.docs[productsSnapshot.docs.length - 1];
      const ifAfterProducts = await mainQuery.startAfter(startAfterSnap).limit(1).get();
      nextLink = {
        hide: ifAfterProducts.empty,
        url: `${req.path}?startAfter=${startAfterSnap.id}${tagUrl}`,
      };
    }
  }
  // count cart items
  object.cartInfo = await cart.cartInfo(object.id, req.user.uid);
  res.render("catalog", {
    title,
    description: `${currentCatalog ? `${currentCatalog.name} ${envSite.i18n.btnBuy().toLowerCase()}` : envSite.i18n.aCatGoods()} ${envSite.i18n.siteCatDesc()}`,
    object,
    currentCatalog,
    catalogs,
    products,
    tags,
    tagActive,
    prevLink,
    nextLink,
    loadMore: !prevLink.hide || !nextLink.hide,
    envSite,
  });
});

// algolia instant search product shower
app.post("/o/:objectId/p/:productId", auth, async (req, res) => {
  const objectId = req.params.objectId;
  const productId = req.params.productId;
  // const object = await store.findRecord(`objects/${objectId}`);
  const product = await store.findRecord(`objects/${objectId}/products/${productId}`);
  const productAlgolia = {};
  productAlgolia.id = productId;
  productAlgolia.name = product.name;
  productAlgolia.unit = product.unit;
  productAlgolia.availability = product.availability;
  // productAlgolia.price = roundNumber(product.price * object.currencies[product.currency]);
  productAlgolia.price = product.price;
  // get cart qty
  if (req.user.uid) {
    const cartProduct = await store.findRecord(`objects/${objectId}/carts/${req.user.uid}`,
        `products.${product.id}`);
    if (cartProduct) {
      productAlgolia.qty = cartProduct.qty;
      productAlgolia.sum = roundNumber(cartProduct.qty * product.price);
    }
  }
  const cartInfo = await cart.cartInfo(objectId, req.user.uid);
  return res.json({...productAlgolia, cartInfo});
});

// show product
app.get("/o/:objectId/p/:productId", auth, async (req, res) => {
  const objectId = req.params.objectId;
  const productId = req.params.productId;
  const object = await store.findRecord(`objects/${objectId}`);
  const product = await store.findRecord(`objects/${objectId}/products/${productId}`);
  if (object && product) {
    // product.price = roundNumber(product.price * object.currencies[product.currency]);
    product.img1 = "/icons/flower3.svg";
    product.img2 = "/icons/flower3.svg";
    product.sellerId = objectId;
    product.url = `/o/${objectId}/p/${product.id}`;
    product.tagPath = product.pathArray[product.pathArray.length - 1].url;
    const photos = [];
    // get cart qty
    if (req.user.uid) {
      const cartProduct = await store.findRecord(`objects/${objectId}/carts/${req.user.uid}`,
          `products.${product.id}`);
      if (cartProduct) {
        product.qty = cartProduct.qty;
        product.sum = roundNumber(cartProduct.qty * product.price);
      }
    }
    if (product.mainPhoto) {
      product.img1 = bucket.file(`photos/o/${objectId}/p/${product.id}/${product.mainPhoto}/1.jpg`).publicUrl();
      product.img2 = bucket.file(`photos/o/${objectId}/p/${product.id}/${product.mainPhoto}/2.jpg`).publicUrl();
      for (const imageId of product.photos) {
        if (product.mainPhoto !== imageId) {
          const img1 = bucket.file(`photos/o/${objectId}/p/${product.id}/${imageId}/1.jpg`).publicUrl();
          const img2 = bucket.file(`photos/o/${objectId}/p/${product.id}/${imageId}/2.jpg`).publicUrl();
          photos.push({
            img1,
            img2,
          });
        }
      }
    }
    // count cart items
    object.cartInfo = await cart.cartInfo(object.id, req.user.uid);
    res.render("product", {
      title: `${product.name}${product.brand ? ` ${product.brand}` : ""} ${productId} ${envSite.i18n.btnBuy().toLowerCase()} за ${product.price} ${envSite.currency} ${envSite.i18n.siteCatTitle()} - ${object.name}`,
      description: `${product.name}${product.brand ? ` ${product.brand}` : ""} ${productId} ${envSite.i18n.btnBuy().toLowerCase()} за ${product.price} ${envSite.currency} ${envSite.i18n.siteCatDesc()}`,
      object,
      product,
      photos,
      envSite,
    });
  } else {
    console.log(`404 error: ${req.path}`);
    return res.status(404).send(`<h1>404! Page not found <a href="${envSite.domain}">${envSite.domain}</a></h1>`);
  }
});

// share order
app.get("/o/:objectId/s/:orderId", auth, async (req, res) => {
  const objectId = req.params.objectId;
  const orderId = req.params.orderId;
  const object = await store.findRecord(`objects/${objectId}`);
  object.cartInfo = await cart.cartInfo(object.id, req.user.uid);
  const order = await store.findRecord(`objects/${objectId}/orders/${orderId}`);
  if (order) {
    const shareOrder = {
      orderNumber: store.formatOrderNumber(order.userId, order.orderNumber),
      lastName: order.lastName,
      firstName: order.firstName,
      createdAt: moment.unix(order.createdAt).locale(process.env.BOT_LANG).fromNow(),
      status: store.statuses().get(order.statusId),
    };
    // products
    let totalQty = 0;
    let totalSum = 0;
    const products = [];
    store.sort(order.products).forEach((product, index) => {
      products.push({
        index: index + 1,
        name: product.name,
        id: product.id,
        price: product.price,
        qty: product.qty,
        unit: product.unit,
        sum: roundNumber(product.price * product.qty),
        url: `/o/${objectId}/p/${product.id}`,
      });
      totalQty += product.qty;
      totalSum += product.qty * product.price;
    });
    res.setHeader("X-Robots-Tag", "noindex");
    return res.render("share-order", {
      title: `${envSite.i18n.order()} - ${object.name} #${shareOrder.orderNumber}`,
      object,
      shareOrder,
      products,
      totalQty,
      totalSum: roundNumber(totalSum),
      envSite,
    });
  }
  res.send("Order not found");
});

// share cart
app.get("/o/:objectId/share-cart/:cartId", auth, async (req, res) => {
  const objectId = req.params.objectId;
  const cartId = req.params.cartId;
  const object = await store.findRecord(`objects/${objectId}`);
  object.cartInfo = await cart.cartInfo(object.id, req.user.uid);
  const cartData = await store.findRecord(`objects/${objectId}/carts/${cartId}`);
  const cartProducts = store.sort(cartData.products);
  if (cartProducts.length) {
    const products = [];
    let totalQty = 0;
    let totalSum = 0;
    cartProducts.forEach((product, index) => {
      products.push({
        index: index + 1,
        name: product.name,
        id: product.id,
        price: product.price,
        qty: product.qty,
        unit: product.unit,
        sum: roundNumber(product.price * product.qty),
        url: `/o/${objectId}/p/${product.id}`,
      });
      totalQty += product.qty;
      totalSum += product.qty * product.price;
    });
    // render
    res.setHeader("X-Robots-Tag", "noindex");
    return res.render("share-cart", {
      title: `${envSite.i18n.aCart()} - ${object.name} #${cartId}`,
      object,
      cartId,
      updatedAt: moment.unix(cartData.updatedAt).locale(process.env.BOT_LANG).fromNow(),
      products,
      totalQty,
      totalSum: roundNumber(totalSum),
      envSite,
    });
  }
  res.send("Cart not found");
});

// login with telegram
// We'll destructure req.query to make our code clearer
const checkSignature = ({hash, ...userData}) => {
  // create a hash of a secret that both you and Telegram know. In this case, it is your bot token
  const secretKey = createHash("sha256")
      .update(process.env.BOT_TOKEN)
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

app.get("/login/:objectId?", auth, async (req, res) => {
  const objectId = req.params.objectId;
  // redirect params
  const redirectPage = req.query.r;
  if (req.query && checkSignature(req.query)) {
    // migrate cart if exist from all objects!!!
    if (req.user.uid) {
      const objects = await store.findAll("objects");
      // use for of for async func
      for (const obj of objects) {
        const products = await store.findRecord(`objects/${obj.id}/carts/${req.user.uid}`, "products");
        const productsImp = await store.findRecord(`objects/${obj.id}/carts/${req.query.id}`, "products");
        // check empry cart!!! {} add keys lenght
        if (products && Object.keys(products).length) {
          if (productsImp) {
            await store.updateRecord(`objects/${obj.id}/carts/${req.query.id}`, {products});
          } else {
            await store.createRecord(`objects/${obj.id}/carts/${req.query.id}`, {products});
          }
        }
        await store.getQuery(`objects/${obj.id}/carts/${req.user.uid}`).delete();
      }
    }
    // save user data
    // const userData = await store.findRecord(`users/${req.query.id}`);
    await store.createRecord(`users/${req.query.id}`, {
      from: {...req.query},
    });
    // create token
    const token = jwt.sign({uid: req.query.id, auth: true, firstName: req.query.first_name}, process.env.BOT_TOKEN);
    // save token to cookie
    // for localhost disable secure opt
    return res.cookie("__session", token, {
      httpOnly: true,
      // secure: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    }).redirect(objectId ? `/o/${objectId}/cart` : "/");
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
  res.render("login", {title: envSite.i18n.aLogin, envSite, redirectPage});
});

app.get("/logout", auth, (req, res) => {
  return res
      .clearCookie("__session")
      .redirect("/login");
});

// create pdf
app.get("/o/:objectId/pdf", auth, async (req, res) => {
  const objectId = req.params.objectId;
  const docId = req.query.docId;
  const object = await store.findRecord(`objects/${objectId}`);
  const products = await cart.products(objectId, docId);
  const data = {
    client: "web",
    filename: `Cart-${docId}`,
    type: "cart",
    products,
    object,
    i18n: {
      cart: envSite.i18n.aCart(),
      prodCode: envSite.i18n.product.code(),
      prodName: envSite.i18n.product.name(),
      prodPrice: envSite.i18n.product.price(),
      tQty: envSite.i18n.tQty(),
      tSum: envSite.i18n.tSum(),
      cartLink: envSite.i18n.cartLink(),
    },
    siteName: process.env.SITE_NAME,
    currency: process.env.BOT_CURRENCY,
    domain: process.env.BOT_SITE,
  };
  // generate pdf
  createPdf(res, data);
});

// render json cart
app.get("/o/:objectId/cart/json", auth, async (req, res) => {
  const objectId = req.params.objectId;
  const cash = req.query.cash;
  const change = req.query.change;
  const object = await store.findRecord(`objects/${objectId}`);
  const cartInfo = await cart.cartInfo(object.id, "94899148");
  const receipt = [];
  // products.push({type: 0, content: "", bold: 1, align: 1, format: 0});
  // products.push({type: 0, content: "rzk.com.ru", bold: 1, align: 1, format: 0});
  // products.push({type: 0, content: "Товарный чек", bold: 1, align: 1, format: 4});
  // html
  const cartProducts = await cart.products(objectId, "94899148");
  let productText = "";
  for (const [index, cartProduct] of cartProducts.entries()) {
    // products.push({type: 0, content: cartProduct.name, bold: 0, align: 0, format: 4});
    // products.push({type: 0, content: `${cartProduct.price} * ${cartProduct.qty} = ${roundNumber(cartProduct.qty * cartProduct.price)} р.`, bold: 0, align: 2, format: 4});
    productText += `<span style="font-size:1px;">${index + 1}) ${cartProduct.name} (${cartProduct.id})</span>
    <div style="text-align: right">
      <span style="font-weight:bold; font-size:1px;">
        ${cartProduct.price}₽ * ${cartProduct.qty}${cartProduct.unit} = ${roundNumber(cartProduct.qty * cartProduct.price)}₽
      </span>
    </div>`;
  }
  // products.push({type: 0, content: `Количество: ${cartInfo.totalQty}`, bold: 0, align: 2, format: 4});
  // products.push({type: 0, content: `Сумма: ${cartInfo.totalSum} руб.`, bold: 0, align: 2, format: 4});
  // products.push({type: 0, content: "Телеграм бот @RzkCrimeaBot", bold: 1, align: 1, format: 4});
  // empty line
  receipt.push({type: 4, content: `
  <center><span style="font-weight:bold; font-size:15px;">RZK Маркет Крым</span></center>
  <center><span style="font-weight:bold; font-size:5px;">г. Саки, Рынок, б.1108</span></center>
  <center><span style="font-weight:bold; font-size:5px;">+7 978 89 86 431</span></center>
  <center><span style="font-weight:bold; font-size:5px;">Товарный чек ${new Date().toLocaleString("ru-RU", {timeZone: "Europe/Moscow"})}</span></center>
  <center>------------------------------------------------------------</center>
  ${productText}
  <center>------------------------------------------------------------</center>
  <div style="text-align: right"><span style="font-size:5px;">Количество: ${cartInfo.totalQty}</span></div>
  <div style="text-align: right"><span style="font-weight:bold; font-size:10px;">ИТОГ: ${cartInfo.totalSum}₽</span></div>
  <center>------------------------------------------------------------</center>
  ${ + change ? `
  <div style="text-align: right"><span style="font-size:5px;">Наличными: ${cash}₽</span></div>
  <div style="text-align: right"><span style="font-size:5px;">Сдача: ${change}₽</span></div>
  <center>------------------------------------------------------------</center>` : ""}
  <center><span style="font-weight:bold; font-size:5px;">Телеграм бот @RzkCrimeaBot</span></center>
  <center><span style="font-weight:bold; font-size:5px;">Сайт Rzk.com.ru</span></center>`});
  receipt.push({type: 0, content: "", bold: 0, align: 0});
  receipt.push({type: 0, content: "", bold: 0, align: 0});
  // sending QR entry
  // products.push({type: 3, value: "https://rzk.com.ru", size: 20, align: 1});
  res.json({...Object.assign({}, receipt)});
});

// show cart
app.get("/o/:objectId/cart", auth, async (req, res) => {
  const objectId = req.params.objectId;
  const object = await store.findRecord(`objects/${objectId}`);
  const admin = req.user.uid === "94899148";
  // import products from URL
  // TODO check is array
  const productsImportParam = req.query.products !== undefined && (Array.isArray(req.query.products) ? req.query.products : [req.query.products]);
  const importCart = req.query.import;
  const clearCart = req.query.clear;
  // clear cart
  if (clearCart) {
    await cart.clear(objectId, req.user.uid);
    res.redirect(`/o/${objectId}/cart`);
  }
  // import cart
  if (importCart) {
    // first clear cart
    await cart.clear(objectId, req.user.uid);

    if (productsImportParam) {
      for (const productStr of productsImportParam) {
        const [id, qty] = productStr.split(" ");
        const productFire = await store.findRecord(`objects/${objectId}/products/${id}`);
        const qtyNumber = + qty;
        if (productFire && qtyNumber) {
          // productFire.price = roundNumber(productFire.price * object.currencies[productFire.currency]);
          await cart.add({
            objectId,
            userId: req.user.uid,
            fromBot: false,
            product: {
              [id]: {
                name: `${productFire.name}${productFire.brand ? " " + productFire.brand : ""}`,
                price: productFire.price,
                unit: productFire.unit,
                qty: qtyNumber,
                createdAt: Math.floor(Date.now() / 1000),
              },
            },
          });
        }
      }
    }
    res.redirect(`/o/${objectId}/cart`);
  }
  // parse products
  const productsImport = [];
  if (productsImportParam) {
    for (const productStr of productsImportParam) {
      const [id, qty] = productStr.split(" ");
      if (id && + qty) {
        productsImport.push({id, qty});
      }
    }
  }
  const productParam = productsImport.map((prod) => `products=${prod.id}+${prod.qty}`).join("&");
  const products = [];
  if (req.user.uid) {
    // get cart products
    const cartProducts = await cart.products(objectId, req.user.uid);
    for (const cartProduct of cartProducts) {
      // check cart products price exist...
      const product = await store.findRecord(`objects/${objectId}/products/${cartProduct.id}`);
      if (product && product.availability) {
        // update price in cart
        const productOld = (Math.floor(Date.now() / 1000) - cartProduct.updatedAt) > 3600;
        if (productOld && product.price !== cartProduct.price && !admin) {
          // const price = roundNumber(product.price * object.currencies[product.currency]);
          // cartProduct.price = price;
          cartProduct.price = product.price;
          // products this is name field!!!
          // const products = {
          //   [product.id]: {
          //     price: product.price,
          //   },
          // };
          // await store.createRecord(`objects/${objectId}/carts/${req.user.uid}`, {products});
          await cart.update({
            objectId,
            userId: req.user.uid,
            product: {
              [product.id]: {
                // price,
                price: product.price,
                updatedAt: Math.floor(Date.now() / 1000),
              },
            },
          });
        }
        if (product) {
          product.img1 = "/icons/flower3.svg";
          product.img2 = "/icons/flower3.svg";
          if (product.mainPhoto) {
            product.img1 = bucket.file(`photos/o/${objectId}/p/${product.id}/${product.mainPhoto}/1.jpg`)
                .publicUrl();
            product.img2 = bucket.file(`photos/o/${objectId}/p/${product.id}/${product.mainPhoto}/2.jpg`)
                .publicUrl();
          }
          products.push({
            id: product.id,
            brand: product.brand ? product.brand : null,
            name: product.name,
            price: cartProduct.price,
            unit: product.unit,
            qty: cartProduct.qty,
            sum: roundNumber(cartProduct.qty * cartProduct.price),
            url: `/o/${objectId}/p/${product.id}`,
            img1: product.img1,
            img2: product.img2,
            sellerId: objectId,
            availability: true,
          });
        }
      } else {
        // delete product
        await cart.delete({
          objectId,
          userId: req.user.uid,
          id: cartProduct.id,
        });
      }
    }
  }
  object.cartInfo = await cart.cartInfo(object.id, req.user.uid);
  res.setHeader("X-Robots-Tag", "noindex");
  res.render("cart", {
    cart: true,
    title: `${envSite.i18n.aCart()} - ${object.name}`,
    object,
    products,
    productsImport,
    productParam,
    carriers: Array.from(store.carriers(), ([id, obj]) => ({id, name: obj.name, reqNumber: obj.reqNumber ? 1 : 0})),
    payments: Array.from(store.payments(), ([id, name]) => ({id, name})),
    envSite,
    admin,
  });
});

// create order
// app.get("/o/:objectId/cart/purchase", auth, async (req, res) => {
//   const objectId = req.params.objectId;
//   const object = await store.findRecord(`objects/${objectId}`);
//   const title = `Оформление заказа - ${object.name}`;
//   // count cart items
//   object.cartInfo = await cart.cartInfo(object.id, req.user.uid);
//   res.render("purchase", {
//     title,
//     object,
//     phoneregexp: process.env.BOT_PHONEREGEXP,
//     phonetemplate: process.env.BOT_PHONETEMPLATE,
//     carriers: Array.from(store.carriers(), ([id, obj]) => ({id, name: obj.name, reqNumber: obj.reqNumber ? 1 : 0})),
//     payments: Array.from(store.payments(), ([id, name]) => ({id, name})),
//     envSite,
//   });
// });

// save order
app.post("/o/:objectId/cart/purchase", auth, (req, res) => {
  const bb = busboy({headers: req.headers});
  const fields = {};
  bb.on("field", (fieldname, val) => {
    /**
     *  TODO(developer): Process submitted field values here
     */
    if (fieldname === "carrierId" || fieldname === "carrierNumber" || fieldname === "paymentId") {
      val = + val;
    }
    if (val) {
      fields[fieldname] = val;
    }
  });
  bb.on("close", async () => {
    // validate fields
    const rulesOrder = {
      "lastName": "required|string",
      "firstName": "required|string",
      "phoneNumber": ["required", `regex:/${process.env.BOT_PHONEREGEXP}`],
      "address": "required|string",
      "carrierId": "required|integer",
      "paymentId": "required|integer",
      "comment": "string",
    };
    // add carrier number
    if (fields.carrierId && store.carriers().get(+ fields.carrierId).reqNumber) {
      rulesOrder.carrierNumber = "required|integer|min:1";
    }
    const validateOrder = new Validator(fields, rulesOrder, {
      "regex": `The :attribute phone number is not in the format ${process.env.BOT_PHONETEMPLATE}`,
    });
    if (validateOrder.fails()) {
      return res.status(422).json({error: {...validateOrder.errors.all()}});
    }
    // add phone code
    const checkPhone = fields.phoneNumber.match(process.env.BOT_PHONEREGEXP);
    fields.phoneNumber = `${process.env.BOT_PHONECODE}${checkPhone[2]}`;
    const objectId = req.params.objectId;
    const cartProducts = await store.findRecord(`objects/${objectId}/carts/${req.user.uid}`, "products");
    if (cartProducts && Object.keys(cartProducts).length) {
      const objectId = req.params.objectId;
      const object = await store.findRecord(`objects/${objectId}`);
      const newOrderRef = firebase.firestore().collection("objects").doc(objectId).collection("orders").doc();
      // if useer auth
      const userId = req.user.auth ? + req.user.uid : 94899148;
      await store.createRecord(`users/${userId}`, {orderCount: firestore.FieldValue.increment(1)});
      const userData = await store.findRecord(`users/${userId}`);
      await newOrderRef.set({
        userId,
        objectId,
        objectName: object.name,
        orderNumber: userData.orderCount,
        statusId: 1,
        fromBot: false,
        products: cartProducts,
        createdAt: Math.floor(Date.now() / 1000),
        ...fields,
      });
      await cart.clear(objectId, req.user.uid);
      return res.json({orderId: newOrderRef.id, objectId});
    } else {
      return res.status(422).json({error: {0: "Cart empty!"}});
    }
  });
  bb.end(req.rawBody);
});

// add product to cart
app.post("/o/:objectId/cart/add", auth, jsonParser, async (req, res) => {
  const objectId = req.params.objectId;
  const {productId, qty} = req.body;
  // validate data
  const rulesProductRow = {
    "qty": "required|integer|min:0|max:10000",
  };
  const validateProductRow = new Validator(req.body, rulesProductRow);
  if (validateProductRow.fails()) {
    let errorRow = "";
    for (const [key, error] of Object.entries(validateProductRow.errors.all())) {
      errorRow += `Key ${key} => ${error} \n`;
    }
    return res.status(422).json({error: errorRow});
  }
  // check uid or create new
  if (!req.user.uid) {
    const newCartRef = firebase.firestore().collection("objects").doc(objectId).collection("carts").doc();
    const token = jwt.sign({uid: newCartRef.id, auth: false}, process.env.BOT_TOKEN);
    req.user.uid = newCartRef.id;
    req.user.auth = false;
    // save token to cookie
    res.cookie("__session", token, {
      httpOnly: true,
      // secure: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }
  // get product data
  const product = await store.findRecord(`objects/${objectId}/products/${productId}`);
  const added = await store.findRecord(`objects/${objectId}/carts/${req.user.uid}`, `products.${productId}`);
  // add to cart
  // await cart.add({objectId, userId: req.user.uid, added ? product.id : product, qty});
  if (product) {
    // const object = await store.findRecord(`objects/${objectId}`);
    // const price = product.price = roundNumber(product.price * object.currencies[product.currency]);
    if (added) {
      if (qty) {
        // new cart ins
        await cart.update({
          objectId,
          userId: req.user.uid,
          product: {
            [productId]: {
              // price,
              price: product.price,
              qty,
              updatedAt: Math.floor(Date.now() / 1000),
            },
          },
        });
      } else {
        await cart.delete({
          objectId,
          userId: req.user.uid,
          id: productId,
        });
      }
    } else {
      // add new product
      if (qty) {
        await cart.add({
          objectId,
          userId: req.user.uid,
          fromBot: false,
          product: {
            [productId]: {
              name: `${product.name}${product.brand ? " " + product.brand : ""}`,
              // price,
              price: product.price,
              unit: product.unit,
              qty,
              createdAt: Math.floor(Date.now() / 1000),
            },
          },
        });
      }
    }
  } else {
    if (added) {
      await cart.delete({
        objectId,
        userId: req.user.uid,
        id: productId,
      });
    }
  }
  const cartInfo = await cart.cartInfo(objectId, req.user.uid);
  const price = product ? product.price : null;
  return res.json({cartInfo, price});
});

// payments-and-deliveries
app.get("/delivery-info", (req, res) => {
  res.render("delivery", {
    envSite,
    title: envSite.i18n.aDelivery,
    carriers: Array.from(store.carriers(), ([id, obj]) => ({id, name: obj.name, reqNumber: obj.reqNumber ? 1 : 0})),
    payments: Array.from(store.payments(), ([id, name]) => ({id, name})),
  });
});

// exchange-and-refund
app.get("/return-policy", (req, res) => {
  res.render("return_" + process.env.BOT_LANG, {envSite, title: envSite.i18n.aReturn});
});

// not found route
app.get("*", (req, res) => {
  console.log(`404 error: ${req.path}`);
  return res.status(404).send(`<h1>404! Page not found <a href="${envSite.domain}">${envSite.domain}</a></h1>`);
});

// config GCP
const runtimeOpts = {
  memory: "1GB",
};

exports.siteFunction = functions.runWith(runtimeOpts).https.onRequest(app);
