const {onRequest} = require("firebase-functions/v2/https");
const {getFirestore} = require("firebase-admin/firestore");
const express = require("express");
const exphbs = require("express-handlebars");
const app = express();
const locale = {
  "Uk": {
    code: "Код товару",
    name: "Найменування",
    price: "Ціна",
    products: "Товари",
  },
  "Ru": {
    code: "Код товара",
    name: "Наименование",
    price: "Цена",
    products: "Товары и услуги",
  },
};
// tralling slashes set domain and locale
app.use((req, res, next) => {
  // parse params
  req.data = {};
  req.data.domain = req.header("x-forwarded-host");
  req.data.lang = process.env.BOT_LANG;
  const match = req.url.match(/\/(ru)?\/?(.*)?/);
  // let url = "";
  // if (match) {
  //   req.data.lang = "ru";
  //   url = match[2] || "";
  // }
  if (match[1] === "ru" && process.env.BOT_LANG === "uk") {
    req.data.lang = "ru-ua";
  }
  req.data.url = match[2] ? "/" + match[2] : "";
  // if (url === "/") {
  //   url = "";
  // }
  req.data.urlUk = "https://" + req.data.domain + req.data.url;
  req.data.urlRu = "https://" + req.data.domain + "/ru" + req.data.url;
  req.data.langUpper = req.data.lang.charAt(0).toUpperCase() + req.data.lang.slice(1, 2);
  if (req.path.substr(-1) == "/" && req.path.length > 1) {
    const query = req.url.slice(req.path.length);
    return res.redirect(301, req.path.slice(0, -1) + query);
  } else {
    next();
  }
});
const hbs = exphbs.create({
  extname: ".hbs",
  helpers: {
    equals(value1, value2) {
      return value1 === value2;
    },
  },
});
app.engine("hbs", hbs.engine);
app.set("view engine", "hbs");
app.set("views", "./sites/brands/views");
// index page
app.get("/:lang(ru)?", async (req, res) => {
  const siteSnap = await getFirestore().doc(`sites/${req.data.domain}`).get();
  if (siteSnap.exists) {
    const siteFire = siteSnap.data();
    const pagesSnap = await getFirestore().collection("sites").doc(req.data.domain).collection("pages").orderBy("orderBy", "asc").get();
    const pages = [];
    for (const model of pagesSnap.docs) {
      pages.push({
        id: model.id,
        name: model.data()[`name${req.data.langUpper}`],
        preview: model.data()[`preview${req.data.langUpper}`],
        img: model.data().img,
      });
    }
    const site = {
      name: siteFire[`name${req.data.langUpper}`],
      title: siteFire[`title${req.data.langUpper}`],
      about: siteFire[`about${req.data.langUpper}`],
      description: siteFire[`desc${req.data.langUpper}`],
      contact: siteFire.contact,
      gtag: siteFire.gtag,
      data: req.data,
      lang: process.env.BOT_LANG,
      pages,
    };
    return res.render("index", {site});
  } else {
    return res.status(404).send(`<h1>404! Brand page not found <a href="${process.env.BOT_SITE}">${process.env.BOT_SITE}</a></h1>`);
  }
});

// show page
app.get("/:lang(ru)?/pages/:pageId", async (req, res) => {
  const pageId = req.params.pageId;
  const siteSnap = await getFirestore().doc(`sites/${req.data.domain}`).get();
  const pageSnap = await getFirestore().doc(`sites/${req.data.domain}/pages/${pageId}`).get();
  if (pageSnap.exists) {
    const pageFire = pageSnap.data();
    const siteFire = siteSnap.data();
    const site = {
      name: siteFire[`name${req.data.langUpper}`],
      gtag: siteFire.gtag,
      title: pageFire[`title${req.data.langUpper}`],
      contact: siteFire.contact,
      description: pageFire[`desc${req.data.langUpper}`] || siteFire[`desc${req.data.langUpper}`],
      data: req.data,
      lang: process.env.BOT_LANG,
      currency: process.env.BOT_CURRENCY,
      locale: locale[req.data.langUpper],
      rzkDomain: process.env.BOT_SITE,
    };
    const products = [];
    if (pageFire.catalogId) {
      const query = getFirestore().collectionGroup("products").where("catalogId", "==", pageFire.catalogId).orderBy("orderNumber").limit(50);
      // get products
      const productsSnapshot = await query.get();
      // generate products array
      for (const product of productsSnapshot.docs) {
        products.push({
          id: product.id,
          name: site.data.lang === "ru-ua" ? (product.data().nameRu || product.data().name) : product.data().name,
          price: product.data().price,
          objectId: product.data().objectId,
        });
      }
    }
    const page = {
      name: pageFire[`name${req.data.langUpper}`],
      about: pageFire[`about${req.data.langUpper}`],
      products,
    };
    return res.render("page", {site, page});
  } else {
    return res.status(404).send(`<h1>404! Brand page not found <a href="${process.env.BOT_SITE}">${process.env.BOT_SITE}</a></h1>`);
  }
});
// second gen
exports.siteBrand = onRequest({region: "europe-central2", memory: "1GiB", maxInstances: 10}, app);
