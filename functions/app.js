const functions = require("firebase-functions");

const { Nuxt } = require('nuxt-start');
const nuxtConfig = require('./nuxt.config.js');
const config = {
  ...nuxtConfig,
  dev: false,
  debug: true,
};

const nuxt = new Nuxt(config);

exports.app = functions.https.onRequest(async (req, res) => {
  await nuxt.ready();
  //res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
  nuxt.render(req, res);
});
