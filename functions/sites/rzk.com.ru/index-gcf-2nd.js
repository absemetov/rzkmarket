// 2nd generation functions
const {onRequest} = require("firebase-functions/v2/https");
const {getFirestore} = require("firebase-admin/firestore");
const {getStorage} = require("firebase-admin/storage");
const bucket = getStorage().bucket();
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
// locale
const i18n = new TelegrafI18n({
  directory: path.resolve(__dirname, "locales"),
});
// site env
const envSite = {
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
  data: {},
};
const app = express();

app.use((req, res, next) => {
  // parse params
  envSite.data.lang = process.env.BOT_LANG;
  envSite.data.domain = req.header("x-forwarded-host");
  const match = req.url.match(/\/(ru)?\/?(.*)?/);
  // let url = req.url;
  if (match[1] === "ru" && process.env.BOT_LANG === "uk") {
    envSite.data.lang = "ru-ua";
  }
  envSite.data.url = match[2] ? "/" + match[2] : "";
  // if (url === "/") {
  //   url = "";
  // }
  envSite.data.urlUk = "https://" + envSite.data.domain + envSite.data.url;
  envSite.data.urlRu = "https://" + envSite.data.domain + "/ru" + envSite.data.url;
  const i18nContext = i18n.createContext(envSite.data.lang);
  envSite.i18n = i18nContext.repository[envSite.data.lang];
  // tralling slashes
  if (req.path.substr(-1) == "/" && req.path.length > 1) {
    const query = req.url.slice(req.path.length);
    return res.redirect(301, req.path.slice(0, -1) + query);
  } else {
    next();
  }
});
app.use(cors({origin: true}));
app.use(cookieParser());

// Configure template Engine and Main Template File
const hbs = exphbs.create({
  extname: ".hbs",
  helpers: {
    orderStatus(statusId) {
      return store.statuses().get(statusId);
    },
    moment(timestamp) {
      return moment.unix(timestamp).locale(process.env.BOT_LANG).fromNow();
    },
    sum(price, qty) {
      return roundNumber(price * qty).toLocaleString("ru-Ru");
    },
    formatNumber(value) {
      return value.toLocaleString("ru-Ru");
    },
    year() {
      return new Date().getFullYear();
    },
    photoProxy(src, locale) {
      // proxy img for Crimea
      return src?.replace("storage.googleapis.com", "i0.wp.com/storage.googleapis.com");
    },
    not(value1, value2) {
      return value1 !== value2;
    },
    equals(value1, value2) {
      return value1 === value2;
    },
    last(value1, value2, number) {
      return value1 + number <= value2;
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
        return encodeURIComponent(`${domain}/c/${elementId.replace(/#/g, "/")}`);
      }
      if (type === "p" && param.length > 64) {
        return encodeURIComponent(`${domain}/o/${objectId}/p/${elementId}`);
      }
      return encodeURIComponent(`https://t.me/${botName}?start=${param}`);
    },
    encode(...value) {
      // delete options element
      return encodeURIComponent(value.filter((n) => n).slice(0, -1).join(" - "));
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

// main page
app.get("/:lang(ru)?", auth, async (req, res) => {
  // new catalogs
  const catalogs = [];
  const catalogsSnapshot = await getFirestore().collection("catalogs").where("parentId", "==", null).orderBy("orderNumber").get();
  catalogsSnapshot.docs.forEach((catalog) => {
    catalogs.push({
      name: catalog.data().name,
      url: `/c/${catalog.id}`,
    });
  });
  // banners
  const banners = await store.findAll("banners");
  // TODO products sail
  // const startAfter = req.query.startAfter;
  // const objectId = req.query.objectId;
  const products = [];
  let nextUrl = null;
  // numberOrders or numberSail
  const mainQuery = getFirestore().collectionGroup("products").orderBy("numberSails", "desc");
  let query = mainQuery;
  // if (startAfter) {
  //   const startAfterProduct = await getFirestore().collection("objects").doc(objectId).collection("products").doc(startAfter).get();
  //   query = query.startAfter(startAfterProduct);
  // }
  // prev button
  query = query.limit(20);
  // get products
  const productsSnapshot = await query.get();
  for (const product of productsSnapshot.docs) {
    const productObj = {
      id: product.id,
      name: envSite.data.lang === "ru-ua" ? (product.data().nameRu || product.data().name) : product.data().name,
      brand: product.data().brand ? product.data().brand : null,
      brandSite: product.data().brandSite ? product.data().brandSite : null,
      price: product.data().price,
      unit: product.data().unit,
      url: `/o/${product.data().objectId}/p/${product.id}`,
      img1: "/icons/flower3.svg",
      img2: "/icons/flower3.svg",
      objectId: product.data().objectId,
      objectName: product.data().objectName,
      availability: product.data().availability,
    };
    // set photo
    if (product.data().mainPhoto) {
      productObj.img1 = bucket.file(`photos/o/${product.data().objectId}/p/${product.id}/${product.data().mainPhoto}/1.jpg`).publicUrl();
      productObj.img2 = bucket.file(`photos/o/${product.data().objectId}/p/${product.id}/${product.data().mainPhoto}/2.jpg`).publicUrl();
    }

    // add to array
    products.push(productObj);
  }
  // Set load more button and tags Algolia
  if (!productsSnapshot.empty) {
    // startAfter
    const startAfterSnap = productsSnapshot.docs[productsSnapshot.docs.length - 1];
    const ifAfterProducts = await mainQuery.startAfter(startAfterSnap).limit(1).get();
    if (!ifAfterProducts.empty) {
      nextUrl = `products?startAfter=${startAfterSnap.id}&objectId=${startAfterSnap.data().objectId}`;
    }
  }
  // cart count
  const cartInfo = await cart.cartInfo(req.user.uid);
  // render main page
  return res.render("index", {
    catalogs,
    banners,
    cartInfo,
    envSite,
    products,
    nextUrl,
  });
});

// infiniti scroll products
app.get("/products", async (req, res) => {
  const startAfter = req.query.startAfter;
  const objectId = req.query.objectId;
  const products = [];
  let nextURL = null;
  // numberOrders or numberSail
  const mainQuery = getFirestore().collectionGroup("products").orderBy("numberSails", "desc");
  let query = mainQuery;
  if (startAfter) {
    const startAfterProduct = await getFirestore().collection("objects").doc(objectId).collection("products").doc(startAfter).get();
    query = query.startAfter(startAfterProduct);
  }
  query = query.limit(20);
  // get products
  const productsSnapshot = await query.get();
  for (const product of productsSnapshot.docs) {
    const productObj = {
      id: product.id,
      name: envSite.data.lang === "ru-ua" ? (product.data().nameRu || product.data().name) : product.data().name,
      brand: product.data().brand ? product.data().brand : null,
      brandSite: product.data().brandSite ? product.data().brandSite : null,
      price: product.data().price,
      unit: product.data().unit,
      url: `/o/${product.data().objectId}/p/${product.id}`,
      img1: "/icons/flower3.svg",
      img2: "/icons/flower3.svg",
      objectId: product.data().objectId,
      objectName: product.data().objectName,
      availability: product.data().availability,
    };
    // set photo
    if (product.data().mainPhoto) {
      productObj.img1 = bucket.file(`photos/o/${product.data().objectId}/p/${product.id}/${product.data().mainPhoto}/1.jpg`)
          .publicUrl();
      productObj.img2 = bucket.file(`photos/o/${product.data().objectId}/p/${product.id}/${product.data().mainPhoto}/2.jpg`)
          .publicUrl();
    }
    // add to array
    products.push(productObj);
  }
  // Set load more button and tags Algolia
  if (!productsSnapshot.empty) {
    // startAfter
    const startAfterSnap = productsSnapshot.docs[productsSnapshot.docs.length - 1];
    const ifAfterProducts = await mainQuery.startAfter(startAfterSnap).limit(1).get();
    if (!ifAfterProducts.empty) {
      nextURL = `products?startAfter=${startAfterSnap.id}&objectId=${startAfterSnap.data().objectId}`;
    }
  }
  return res.json({products, nextURL});
});

// search products
app.get("/search*", auth, async (req, res) => {
  return res.render("search", {envSite});
});

// show object
app.get("/:lang(ru)?/o/:objectId", auth, async (req, res) => {
  const object = await store.findRecord(`objects/${req.params.objectId}`);
  if (object) {
    if (object.photoId) {
      object.img1 = bucket.file(`photos/o/${object.id}/logo/${object.photoId}/1.jpg`).publicUrl();
      object.img2 = bucket.file(`photos/o/${object.id}/logo/${object.photoId}/2.jpg`).publicUrl();
    } else {
      object.img1 = "/icons/shop.svg";
      object.img2 = "/icons/shop.svg";
    }
    if (envSite.data.lang === "ru-ua") {
      object.name = object.nameRu || object.name;
      object.description = object.descriptionRu || object.description;
      object.address = object.addressRu || object.address;
      object.siteDesc = object.siteDescRu || object.siteDesc;
    }
    const cartInfo = await cart.cartInfo(req.user.uid);
    return res.render("object", {
      cartInfo,
      title: `${object.description} - ${object.name}`,
      description: object.siteDesc,
      object,
      envSite});
  } else {
    // return res.redirect("/");
    console.log(`404 error: ${req.url}`);
    return res.status(404).send(`<h1>404! Page not found <a href="${envSite.domain}">${envSite.domain}</a></h1>`);
  }
});

// show catalogs
app.get("/:lang(ru)?/c/:catalogPath(*)?", auth, async (req, res) => {
  const catalogId = req.params.catalogPath && req.params.catalogPath.replace(/\/+$/, "").replace(/\//g, "#") || null;
  const selectedTag = req.query.tag;
  const startAfter = req.query.startAfter;
  const endBefore = req.query.endBefore;
  const objectId = req.query.objectId;
  let currentCatalog = null;
  let title = envSite.i18n.aCatGoods();
  const catalogs = [];
  const tags = [];
  // get catalog sibl
  const catalogsSiblingsSnapshot = await getFirestore().collection("catalogs").where("parentId", "==", catalogId).orderBy("orderNumber").get();
  catalogsSiblingsSnapshot.docs.forEach((doc) => {
    const catalogSibl = {
      id: doc.id,
      name: envSite.data.lang === "ru-ua" ? (doc.data().nameRu || doc.data().name) : doc.data().name,
      url: `/c/${doc.id.replace(/#/g, "/")}`,
    };
    if (doc.data().photoId) {
      catalogSibl.img1 = bucket.file(`photos/c/${doc.id.replace(/#/g, "-")}/${doc.data().photoId}/1.jpg`).publicUrl();
      catalogSibl.img2 = bucket.file(`photos/c/${doc.id.replace(/#/g, "-")}/${doc.data().photoId}/2.jpg`).publicUrl();
    } else {
      catalogSibl.img1 = "/icons/folder2.svg";
      catalogSibl.img2 = "/icons/folder2.svg";
    }
    catalogs.push(catalogSibl);
  });
  // products query
  const products = [];
  const prevLink = {};
  const nextLink = {};
  const tagActive = {};
  if (catalogId) {
    currentCatalog = await store.findRecord(`catalogs/${catalogId}`);
    if (!currentCatalog) {
      console.log(`404 error: ${req.url}`);
      return res.status(404).send(`<h1>404! Page not found <a href="${envSite.domain}">${envSite.domain}</a></h1>`);
    }
    // set page description
    if (envSite.data.lang === "ru-ua") {
      currentCatalog.name = currentCatalog.nameRu || currentCatalog.name;
      currentCatalog.desc = currentCatalog.descRu || currentCatalog.desc;
      currentCatalog.siteDesc = currentCatalog.siteDescRu || currentCatalog.siteDesc;
      currentCatalog.siteTitle = currentCatalog.siteTitleRu || currentCatalog.siteTitle;
    }
    // generate title
    title = `${currentCatalog.name} ${envSite.i18n.btnBuy().toLowerCase()} ${envSite.i18n.siteCatTitle()}`;
    let mainQuery = getFirestore().collectionGroup("products").where("catalogId", "==", catalogId).orderBy("orderNumber");
    // Filter by tag
    let tagUrl = "";
    if (selectedTag) {
      mainQuery = mainQuery.where("tags", "array-contains", selectedTag);
      tagUrl = `&tag=${selectedTag}`;
    }
    // paginate goods, copy main query
    let query = mainQuery;
    if (startAfter) {
      const startAfterProduct = await getFirestore().collection("objects").doc(objectId).collection("products").doc(startAfter).get();
      query = query.startAfter(startAfterProduct);
    }
    // prev button
    if (endBefore) {
      const endBeforeProduct = await getFirestore().collection("objects").doc(objectId).collection("products").doc(endBefore).get();
      query = query.endBefore(endBeforeProduct).limitToLast(40);
    } else {
      query = query.limit(40);
    }
    // get products
    const productsSnapshot = await query.get();
    // generate products array
    for (const product of productsSnapshot.docs) {
      const productObj = {
        id: product.id,
        name: envSite.data.lang === "ru-ua" ? (product.data().nameRu || product.data().name) : product.data().name,
        brand: product.data().brand ? product.data().brand : null,
        brandSite: product.data().brandSite ? product.data().brandSite : null,
        price: product.data().price,
        unit: product.data().unit,
        url: `/o/${product.data().objectId}/p/${product.id}`,
        img1: "/icons/flower3.svg",
        img2: "/icons/flower3.svg",
        objectId: product.data().objectId,
        objectName: product.data().objectName,
        availability: product.data().availability,
      };
      // set photo
      if (product.data().mainPhoto) {
        productObj.img1 = bucket.file(`photos/o/${product.data().objectId}/p/${product.id}/${product.data().mainPhoto}/1.jpg`)
            .publicUrl();
        productObj.img2 = bucket.file(`photos/o/${product.data().objectId}/p/${product.id}/${product.data().mainPhoto}/2.jpg`)
            .publicUrl();
      }
      // add to array
      products.push(productObj);
    }
    // Set load more button and tags Algolia
    if (!productsSnapshot.empty) {
      // get algolia tags
      if (envSite.notBot) {
        const pathNames = currentCatalog.pathArray.map((catalog) => catalog.name);
        const tagsAlgolia = await algoliaIndexProducts.search("", {
          hitsPerPage: 0,
          facets: ["subCategory"],
          facetFilters: [[`categories.lvl${pathNames.length - 1}:${pathNames.join(" > ")}`]],
        });
        for (const [tagName, tagCount] of Object.entries(tagsAlgolia.facets.subCategory || {})) {
          const tagObj = {
            text: `${tagName} (${tagCount})`,
            url: `${req.path}?tag=${encodeURIComponent(tagName)}`,
          };
          // close tag
          if (tagName === selectedTag) {
            // generate title
            title = `${currentCatalog.name} ${tagName} ${envSite.i18n.btnBuy().toLowerCase()} ${envSite.i18n.siteCatTitle()}`;
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
      prevLink.hide = ifBeforeProducts.empty;
      prevLink.url = `${req.path}?endBefore=${endBeforeSnap.id}&objectId=${endBeforeSnap.data().objectId}${tagUrl}`;
      // startAfter
      const startAfterSnap = productsSnapshot.docs[productsSnapshot.docs.length - 1];
      const ifAfterProducts = await mainQuery.startAfter(startAfterSnap).limit(1).get();
      nextLink.hide = ifAfterProducts.empty;
      nextLink.url = `${req.path}?startAfter=${startAfterSnap.id}&objectId=${startAfterSnap.data().objectId}${tagUrl}`;
    }
  }
  // count cart items
  const cartInfo = await cart.cartInfo(req.user.uid);
  return res.render("catalog", {
    title: currentCatalog && currentCatalog.siteTitle ? currentCatalog.siteTitle : title,
    description: currentCatalog && currentCatalog.siteDesc ? currentCatalog.siteDesc : envSite.i18n.siteDesc(),
    cartInfo,
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

// show product
app.get("/:lang(ru)?/o/:objectId/p/:productId", auth, async (req, res) => {
  const objectId = req.params.objectId;
  const productId = req.params.productId;
  const product = await store.findRecord(`objects/${objectId}/products/${productId}`);
  if (product) {
    // set page description
    if (envSite.data.lang === "ru-ua") {
      product.name = product.nameRu || product.name;
      product.desc = product.descRu || product.desc;
    }
    product.img1 = "/icons/flower3.svg";
    product.img2 = "/icons/flower3.svg";
    product.url = `/o/${objectId}/p/${product.id}`;
    product.tagPath = product.pathArray[product.pathArray.length - 1].url;
    const photos = [];
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
    const cartInfo = await cart.cartInfo(req.user.uid);
    return res.render("product", {
      title: `${product.name}${product.brand ? ` ${product.brand}` : ""} ${productId} ${envSite.i18n.btnBuy().toLowerCase()} за ${product.price} ${envSite.currency} ${envSite.i18n.siteCatTitle()} - ${product.objectName}`,
      description: `${product.name}${product.brand ? ` ${product.brand}` : ""} ${productId} ${envSite.i18n.btnBuy().toLowerCase()} за ${product.price} ${envSite.currency} ${envSite.i18n.siteDesc()}`,
      product,
      photos,
      envSite,
      cartInfo,
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
  const order = await store.findRecord(`objects/${objectId}/orders/${orderId}`);
  if (order) {
    let totalQty = 0;
    let totalSum = 0;
    // delete store.sort() use orderBy firestore
    order.products.forEach((product, index) => {
      totalQty += product.qty;
      totalSum += product.qty * product.price;
    });
    const cartInfo = await cart.cartInfo(req.user.uid);
    res.setHeader("X-Robots-Tag", "noindex");
    return res.render("share-order", {
      title: `${envSite.i18n.order()} - #${order.userId}-${order.orderNumber}`,
      order,
      totalQty,
      totalSum: roundNumber(totalSum),
      envSite,
      cartInfo,
    });
  }
  return res.status(404).send(`<h1>404! Order not found <a href="${envSite.domain}">${envSite.domain}</a></h1>`);
});

// share cart
app.get("/share-cart/:cartId", auth, async (req, res) => {
  const cartId = req.params.cartId;
  const products = await cart.products(cartId);
  if (!products.length) {
    return res.status(404).send(`<h1>404! Cart not found <a href="${envSite.domain}">${envSite.domain}</a></h1>`);
  }
  res.setHeader("X-Robots-Tag", "noindex");
  const cartInfo = await cart.cartInfo(cartId);
  return res.render("share-cart", {
    title: `${envSite.i18n.aCart()} #${cartId}`,
    cartId,
    products,
    cartInfo,
    envSite,
  });
});

// login with telegram
// We'll destructure req.query to make our code clearer
const checkSignature = ({hash, ...userData}) => {
  // delete redirect field
  delete userData.r;
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

app.get("/:lang(ru)?/login", auth, async (req, res) => {
  // redirect params
  const redirectPage = req.query.r;
  if (req.query && checkSignature(req.query)) {
    // migrate cart
    // check if user not login!!!
    if (req.user.uid !== req.query.id) {
      // use for of for async func
      const cartProducts = await cart.products(req.user.uid);
      const cartProductsFromUser = await cart.products(req.query.id);
      // check empry cart!!! {} add keys lenght
      if (cartProducts.length) {
        if (!cartProductsFromUser.length) {
          for (const product of cartProducts) {
            await cart.add({
              userId: req.query.id,
              fromBot: false,
              product: {
                objectId: product.objectId,
                productId: product.productId,
                name: product.name,
                price: product.price,
                unit: product.unit,
                qty: product.qty,
                createdAt: Math.floor(Date.now() / 1000),
                updatedAt: Math.floor(Date.now() / 1000),
              },
            });
          }
        }
        // clear old cart
        await cart.clear(req.user.uid);
      }
    }
    // save user data
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
    }).redirect(redirectPage ? `/${redirectPage}` : "/");
  }
  const cartInfo = await cart.cartInfo(req.user.uid);
  return res.render("login", {title: envSite.i18n.aLogin, cartInfo, envSite, redirectPage});
});

app.get("/logout", auth, (req, res) => {
  return res
      .clearCookie("__session")
      .redirect("/login");
});

// create pdf
app.get("/pdf", auth, async (req, res) => {
  const docId = req.query.docId;
  const products = await cart.products(docId);
  const data = {
    client: "web",
    filename: `Cart-${docId}`,
    type: "cart",
    products,
    i18n: {
      cart: envSite.i18n.aCart(),
      prodCode: envSite.i18n.product.code(),
      prodName: envSite.i18n.product.name(),
      prodPrice: envSite.i18n.product.price(),
      tQty: envSite.i18n.tQty(),
      tSum: envSite.i18n.tSum(),
      cartLink: envSite.i18n.cartLink(),
      phones: envSite.i18n.phones,
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
  return res.json({...Object.assign({}, receipt)});
});

// show cart
app.get("/:lang(ru)?/cart", auth, async (req, res) => {
  const admin = req.user.uid === "94899148";
  const products = [];
  if (req.user.uid) {
    // get cart products
    const cartProducts = await cart.products(req.user.uid);
    for (const cartProduct of cartProducts) {
      // check cart products price exist...
      const product = await store.findRecord(`objects/${cartProduct.objectId}/products/${cartProduct.productId}`);
      if (product && product.availability) {
        // update price in cart
        const productOld = (Math.floor(Date.now() / 1000) - cartProduct.updatedAt) > 3600;
        if (productOld && product.price !== cartProduct.price && !admin) {
          cartProduct.price = product.price;
          await cart.update({
            userId: req.user.uid,
            product: {
              productId: product.id,
              objectId: product.objectId,
              price: product.price,
              updatedAt: Math.floor(Date.now() / 1000),
            },
          });
        }
        if (product) {
          product.img1 = "/icons/flower3.svg";
          product.img2 = "/icons/flower3.svg";
          if (product.mainPhoto) {
            product.img1 = bucket.file(`photos/o/${product.objectId}/p/${product.id}/${product.mainPhoto}/1.jpg`)
                .publicUrl();
            product.img2 = bucket.file(`photos/o/${product.objectId}/p/${product.id}/${product.mainPhoto}/2.jpg`)
                .publicUrl();
          }
          products.push({
            id: product.id,
            brand: product.brand ? product.brand : null,
            brandSite: product.brandSite ? product.brandSite : null,
            name: product.name,
            price: cartProduct.price,
            unit: product.unit,
            qty: cartProduct.qty,
            sum: roundNumber(cartProduct.qty * cartProduct.price),
            url: `/o/${product.objectId}/p/${product.id}`,
            img1: product.img1,
            img2: product.img2,
            objectId: product.objectId,
            objectName: product.objectName,
            availability: true,
          });
        }
      } else {
        // delete product
        await cart.delete({
          userId: req.user.uid,
          objectId: product.objectId,
          productId: product.id,
        });
      }
    }
  }
  res.setHeader("X-Robots-Tag", "noindex");
  const cartInfo = await cart.cartInfo(req.user.uid);
  return res.render("cart", {
    cartInfo,
    title: envSite.i18n.aCart(),
    products,
    carriers: Array.from(store.carriers(), ([id, obj]) => ({id, name: obj.name, reqNumber: obj.reqNumber ? 1 : 0})),
    payments: Array.from(store.payments(), ([id, name]) => ({id, name})),
    envSite,
    admin,
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
    fields.fromBot = false;
    fields.auth = req.user.auth;
    // save orders
    try {
      const ordersInfo = await cart.createOrder(req.user.uid, fields);
      return res.json({botName: envSite.botName, ordersInfo});
    } catch (error) {
      return res.status(422).json({error: {"cart": [error.message]}});
    }
  });
  bb.end(req.rawBody);
});

// add product to cart
app.post("/cart/add", auth, jsonParser, async (req, res) => {
  const {productId, qty, objectId} = req.body;
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
    const newCartRef = getFirestore().collection("carts").doc();
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
  const added = await store.findRecord(`carts/${req.user.uid}/items/${objectId}-${productId}`);
  // add to cart
  if (product) {
    if (added) {
      if (qty) {
        // new cart ins
        await cart.update({
          userId: req.user.uid,
          product: {
            productId,
            objectId,
            price: product.price,
            qty,
            updatedAt: Math.floor(Date.now() / 1000),
          },
        });
      } else {
        await cart.delete({
          userId: req.user.uid,
          objectId,
          productId,
        });
      }
    } else {
      // add new product
      if (qty) {
        await cart.add({
          userId: req.user.uid,
          fromBot: false,
          product: {
            objectId: product.objectId,
            productId: product.id,
            name: `${product.name}${product.brand ? " " + product.brand : ""}`,
            price: product.price,
            unit: product.unit,
            qty,
            createdAt: Math.floor(Date.now() / 1000),
            updatedAt: Math.floor(Date.now() / 1000),
          },
        });
      }
    }
  } else {
    if (added) {
      await cart.delete({
        userId: req.user.uid,
        objectId,
        productId,
      });
    }
  }
  // get cart info
  const cartInfo = await cart.cartInfo(req.user.uid);
  const price = product ? product.price : null;
  return res.json({cartInfo, price});
});

// payments-and-deliveries
app.get("/:lang(ru)?/delivery-info", auth, async (req, res) => {
  const cartInfo = await cart.cartInfo(req.user.uid);
  return res.render("delivery", {
    envSite,
    title: envSite.i18n.aDelivery,
    cartInfo,
    carriers: Array.from(store.carriers(), ([id, obj]) => ({id, name: obj.name, reqNumber: obj.reqNumber ? 1 : 0})),
    payments: Array.from(store.payments(), ([id, name]) => ({id, name})),
  });
});

// exchange-and-refund
app.get("/:lang(ru)?/return-policy", auth, async (req, res) => {
  const cartInfo = await cart.cartInfo(req.user.uid);
  return res.render("return_" + process.env.BOT_LANG, {envSite, cartInfo, title: envSite.i18n.aReturn});
});

// news page
app.get("/:lang(ru)?/news", auth, async (req, res) => {
  const startAfter = req.query.startAfter;
  const endBefore = req.query.endBefore;
  const prevLink = {};
  const nextLink = {};
  const newsInPage = 7;
  const mainQuery = getFirestore().collection("news").orderBy("createdAt", "desc");
  let query = mainQuery;
  if (startAfter) {
    const startAfterProduct = await getFirestore().collection("news").doc(startAfter).get();
    query = query.startAfter(startAfterProduct);
  }
  // prev button
  if (endBefore) {
    const endBeforeProduct = await getFirestore().collection("news").doc(endBefore).get();
    query = query.endBefore(endBeforeProduct).limitToLast(newsInPage);
  } else {
    query = query.limit(newsInPage);
  }
  const news = [];
  const newsSnapshot = await query.get();
  for (const model of newsSnapshot.docs) {
    news.push({
      id: model.id,
      title: envSite.data.lang === "ru-ua" ? (model.data().titleRu || model.data().title) : model.data().title,
      preview: envSite.data.lang === "ru-ua" ? (model.data().previewRu || model.data().preview) : model.data().preview,
      createdAt: moment.unix(model.data().createdAt.seconds).locale(envSite.data.lang === "ru-ua" ? "ru" : process.env.BOT_LANG).fromNow(),
    });
  }
  if (!newsSnapshot.empty) {
    // endBefore prev button e paaram
    const endBeforeSnap = newsSnapshot.docs[0];
    const ifBeforeProducts = await mainQuery.endBefore(endBeforeSnap).limitToLast(1).get();
    prevLink.hide = ifBeforeProducts.empty,
    prevLink.url = `${req.path}?endBefore=${endBeforeSnap.id}`;
    // startAfter
    const startAfterSnap = newsSnapshot.docs[newsSnapshot.docs.length - 1];
    const ifAfterProducts = await mainQuery.startAfter(startAfterSnap).limit(1).get();
    nextLink.hide = ifAfterProducts.empty;
    nextLink.url = `${req.path}?startAfter=${startAfterSnap.id}`;
  }
  return res.render("news/index", {
    title: envSite.i18n.tNews,
    news,
    envSite,
    prevLink,
    nextLink,
    loadMore: !prevLink.hide || !nextLink.hide,
  });
});
// show news
app.get("/:lang(ru)?/news/:newsId", auth, async (req, res) => {
  const news = await store.findRecord(`news/${req.params.newsId}`);
  if (envSite.data.lang === "ru-ua") {
    news.title = news.titleRu || news.title;
    news.description = news.descriptionRu || news.description;
    news.body = news.bodyRu || news.body;
  }
  return res.render("news/news", {
    title: `${news.title} - ${envSite.i18n.tNews()}`,
    description: news.desc,
    news,
    products: news.products,
    createdAt: moment.unix(news.createdAt.seconds).locale(envSite.data.lang === "ru-ua" ? "ru" : process.env.BOT_LANG).fromNow(),
    envSite,
  });
});

// not found route
app.get("*", (req, res) => {
  console.log(`404 error: ${req.path}`);
  return res.status(404).send(`<h1>404! Page not found <a href="${envSite.domain}">${envSite.domain}</a></h1>`);
});

// config GCP
exports.siteWarsawSecondGen = onRequest({region: "europe-central2", memory: "1GiB", maxInstances: 10}, app);
