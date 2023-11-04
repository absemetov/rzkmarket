const {onRequest} = require("firebase-functions/v2/https");
const {getFirestore} = require("firebase-admin/firestore");
const express = require("express");
const exphbs = require("express-handlebars");
const app = express();
// tralling slashes set domain and locale
const locale = {
  "Uk": {
    "contact": "Контакти",
    "products": "Продукція",
    "about": "Компанія",
  },
  "Ru": {
    "contact": "Контакты",
    "products": "Продукция",
    "about": "О компании",
  },
};
app.use((req, res, next) => {
  // parse params
  req.data = {};
  req.data.domain = req.header("x-forwarded-host");
  req.data.lang = "uk";
  const match = req.url.match(/^\/([A-Z]{2})([/?].*)?$/i);
  let url = req.url;
  if (match) {
    req.data.lang = "ru";
    url = match[2] || "";
  }
  if (url === "/") {
    url = "";
  }
  req.data.urlUk = "https://" + req.data.domain + url;
  req.data.urlRu = "https://" + req.data.domain + "/ru" + url;
  req.data.langUpper = req.data.lang.charAt(0).toUpperCase() + req.data.lang.slice(1);
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
      description: siteFire[`siteDesc${req.data.langUpper}`],
      rzkId: siteFire.rzkId,
      gtag: siteFire.gtag,
      ...req.data,
      pages,
      locale: locale[req.data.langUpper],
    };
    return res.render("index", {site});
  } else {
    return res.status(404).send("<h1>404! Page not found <a href=\"//rzk.com.ua\">rzk.com.ua</a></h1>");
  }
});

// show page
app.get("/:lang(ru)?/pages/:pageId", async (req, res) => {
  const pageId = req.params.pageId;
  const siteSnap = await getFirestore().doc(`sites/${req.data.domain}`).get();
  const pageSnap = await getFirestore().doc(`sites/${req.data.domain}/pages/${pageId}`).get();
  const pageFire = pageSnap.data();
  const siteFire = siteSnap.data();
  const site = {
    name: siteFire[`name${req.data.langUpper}`],
    rzkId: siteFire.rzkId,
    gtag: siteFire.gtag,
    title: pageFire[`title${req.data.langUpper}`] + " - " + siteFire[`title${req.data.langUpper}`],
    description: pageFire[`siteDesc${req.data.langUpper}`],
    ...req.data,
    locale: locale[req.data.langUpper],
  };
  const page = {
    name: pageFire[`name${req.data.langUpper}`],
    about: pageFire[`about${req.data.langUpper}`],
  };
  return res.render("page", {site, page});
});
// second gen
exports.siteBrand = onRequest({region: "europe-central2", memory: "1GiB", maxInstances: 10}, app);
