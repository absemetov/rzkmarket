// generate robots.txt
if (process.argv[3] === "robots") {
  const fs = require("fs");
  const writeStream = fs.createWriteStream("sites/rzk.com.ru/robots.txt");
  writeStream.write(`User-agent: * 
Disallow: /search
Disallow: /o/*/cart
Disallow: /delivery-info
Disallow: /return-policy
Disallow: /login
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
  const sitemap = require("algolia-sitemap");
  // get current param
  require("dotenv").config({path: `./functions/.env.${process.argv[2]}`});

  // You need an API key with `browse` permission
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
  });
}
