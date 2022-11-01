const sitemap = require("algolia-sitemap");
// get current param
require("dotenv").config({path: `./functions/.env.${process.argv[2]}`});
// You need an API key with `browse` permission
const algoliaConfig = {
  appId: process.env.ALGOLIA_ID,
  apiKey: process.env.ALGOLIA_ADMIN_KEY,
  indexName: "products",
};

const alreadyAdded = {};

function hitToParams(params) {
  const catalog = params["categories.lvl5"] || params["categories.lvl4"] || params["categories.lvl3"] || params["categories.lvl2"] || params["categories.lvl1"] || params["categories.lvl0"];
  const locs = [];
  const category = `${process.env.BOT_SITE}/search/${catalog.split(" > ").map(encodeURIComponent).join("/")}`;
  const product = `${process.env.BOT_SITE}/o/${params.sellerId}/p/${params.productId}`;
  if (!alreadyAdded[category]) {
    locs.push(
        ...[
          {loc: category},
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
  alreadyAdded[category] = category;
  return locs;
}

sitemap({
  algoliaConfig,
  hitToParams,
  // The URL of the sitemaps directory
  sitemapLoc: `${process.env.BOT_SITE}/sitemaps/${process.argv[2]}`,
  // The directory with all sitemaps (default: `sitemaps`)
  outputFolder: `sites/rzk.com.ru/sitemaps/${process.argv[2]}`,
});
