const sitemap = require("algolia-sitemap");
const path = require("path");
// You need an API key with `browse` permission
const algoliaConfig = {
  appId: "YSHMAC99ZS",
  apiKey: "33c383b85b76ea888ae8e4c8d1fa26c4",
  indexName: "products",
};

function hitToParams({productId, brand}) {
  if (brand === "Gunsan") {
    return {loc: `https://rzk.com.ua/o/dnipro/p/${productId}`};
  }
}

sitemap({
  algoliaConfig,
  hitToParams,
  // The URL of the sitemaps directory
  sitemapLoc: "https://rzk.com.ua/sitemaps",
  // The directory with all sitemaps (default: `sitemaps`)
  outputFolder: path.resolve("../../../sites/rzk.com.ru/sitemaps"),
});
