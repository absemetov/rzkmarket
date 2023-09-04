const {google} = require("googleapis");
const algoliasearch = require("algoliasearch");
const sitemap = require("algolia-sitemap");
require("dotenv").config({path: `./functions/.env.${process.argv[2]}`});
// generate robots.txt
if (process.argv[3] === "robots") {
  const fs = require("fs");
  const writeStream = fs.createWriteStream("sites/rzk.com.ru/robots.txt");
  writeStream.write(`User-agent: * 
Disallow: /search
Disallow: /delivery-info
Disallow: /return-policy
Disallow: /login
Disallow: /*?*startAfter=
Disallow: /*?*endBefore=
Sitemap: https://rzk.com.${process.argv[2]}/sitemaps/${process.argv[2]}/sitemap-index.xml

User-agent: Yahoo
Disallow: /

User-agent: MJ12bot
Disallow: /

User-agent: Mediapartners-Google
Disallow: /

User-agent: AhrefsBot
Disallow: /`);
  writeStream.end();
}

// generate sitemap
const alreadyAdded = {};
function hitToParams(params) {
  // const catalog = params["categories.lvl5"] || params["categories.lvl4"] || params["categories.lvl3"] || params["categories.lvl2"] || params["categories.lvl1"] || params["categories.lvl0"];
  const locs = [];
  // const category = `${process.env.BOT_SITE}/search/${catalog.split(" > ").map(encodeURIComponent).join("/")}`;
  const catalog = `${process.env.BOT_SITE}/o/${params.sellerId}/c/${params.path}`;
  const product = `${process.env.BOT_SITE}/o/${params.sellerId}/p/${params.productId}`;
  if (!alreadyAdded[catalog]) {
    locs.push(
        ...[
          {loc: catalog},
          {loc: product},
        ],
    );
  } else {
    locs.push(
        ...[
          {loc: product},
        ],
    );
  }
  alreadyAdded[catalog] = catalog;
  return locs;
}

if (process.argv[3] === "sitemap") {
  const algoliaConfig = {
    appId: process.env.ALGOLIA_ID,
    apiKey: process.env.ALGOLIA_ADMIN_KEY,
    indexName: "products",
  };

  sitemap({
    algoliaConfig,
    hitToParams,
    // The URL of the sitemaps directory
    sitemapLoc: `${process.env.BOT_SITE}/sitemaps/${process.argv[2]}`,
    // The directory with all sitemaps (default: `sitemaps`)
    outputFolder: `sites/rzk.com.ru/sitemaps/${process.argv[2]}`,
  }).then(() => {
    console.log("Done generating sitemaps");
  }).catch(console.error);
}

// test merchant api
const uploadToMerchnt = async () => {
  const content = google.content("v2.1");
  // add scope content in admin.google!!!
  const auth = new google.auth.JWT({
    keyFile: "./functions/bot/rzk-com-ua-d1d3248b8410.json",
    scopes: ["https://www.googleapis.com/auth/content"],
    subject: "nadir@absemetov.org.ua",
  });
  google.options({auth});
  const client = algoliasearch(process.env.ALGOLIA_ID, process.env.ALGOLIA_ADMIN_KEY);
  const index = client.initIndex("products");
  const promises = [];
  await index.browseObjects({
    query: "",
    facetFilters: [["seller:RZK Дніпро"]],
    attributesToRetrieve: ["productId", "brand", "sellerId", "img1", "name", "nameRu", "price"],
    shouldStop: () => true,
    batch: (hits) => {
      for (const params of hits) {
        promises.push(content.products.insert({
          merchantId: "120890507",
          resource: {
            "channel": "online",
            "contentLanguage": "uk",
            "offerId": params.productId,
            "targetCountry": "UA",
            "title": `${params.brand ? params.brand + " " : ""}${params.name} (${params.productId})`,
            "brand": `${params.brand ? params.brand : "RZK Маркет Україна"}`,
            "description": "Купити розетки та вимикачі Viko, Gunsan, Nilson оптом!",
            "link": `https://rzk.com.ua/o/${params.sellerId}/p/${params.productId}`,
            "imageLink": params.img1 ? params.img1 : "https://rzk.com.ua/icons/flower3.svg",
            "availability": "in stock",
            "condition": "new",
            "price": {
              // "value": roundNumber(product.price * object.currencies[product.currency]),
              "value": params.price,
              "currency": "UAH",
            },
          },
        }));
        if (params.nameRu) {
          promises.push(content.products.insert({
            merchantId: "120890507",
            resource: {
              "channel": "online",
              "contentLanguage": "ru",
              "offerId": params.productId,
              "targetCountry": "UA",
              "title": `${params.brand ? params.brand + " " : ""}${params.nameRu} (${params.productId})`,
              "brand": `${params.brand ? params.brand : "RZK Маркет Украина"}`,
              "description": "Купить розетки и выключатели Viko, Gunsan, Nilson оптом!",
              "link": `https://rzk.com.ua/ru/o/${params.sellerId}/p/${params.productId}`,
              "imageLink": params.img1 ? params.img1 : "https://rzk.com.ua/icons/flower3.svg",
              "availability": "in stock",
              "condition": "new",
              "price": {
                // "value": roundNumber(product.price * object.currencies[product.currency]),
                "value": params.price,
                "currency": "UAH",
              },
            },
          }));
        }
      }
    },
  }).then(() => console.log("browse done!"));
  await Promise.all(promises).then(() => {
    console.log(`then ${promises.length}`);
  });
};

// upload goods to merchant center
if (process.argv[3] === "merchant") {
  uploadToMerchnt();
}
