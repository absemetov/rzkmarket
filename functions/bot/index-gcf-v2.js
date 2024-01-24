// 2nd generation functions
const {onRequest} = require("firebase-functions/v2/https");
// const functions = require("firebase-functions");
const {Telegraf} = require("telegraf");
const {startActions, startHandler, parseUrl, isAdmin} = require("./bot_start_scene");
const {monoHandler, monoActions} = require("./bot_mono_scene");
const {esp32Handler, esp32Actions} = require("./bot_esp32_scene");
const {uploadActions, uploadForm, changeProduct, changeCatalog, uploadProductsTrigger} = require("./bot_upload_scene");
const {ordersActions, orderWizard} = require("./bot_orders_scene");
const {catalogsActions, cartWizard} = require("./bot_catalog_scene");
const {store, uploadPhotoObj, uploadPhotoProduct, uploadPhotoCat, uploadBanner, changeBanner} = require("./bot_store_cart");
const {searchProductHandle, searchProductAction, searchOrderHandle, searchOrderAction} = require("./bot_search");
const {sitesActions, siteEditHandle} = require("./bot_sites_scene");
const {URL} = require("url");
const bot = new Telegraf(process.env.BOT_TOKEN);
// midleware admin
bot.use(isAdmin);
// session msg
bot.use(async (ctx, next) => {
  let urlMsq;
  if (ctx.callbackQuery) {
    // console.log(ctx.callbackQuery.message.caption && ctx.callbackQuery.message.caption.length);
    // console.log("=============callbackQuery happened", ctx.callbackQuery.data.length, ctx.callbackQuery.data);
    // test msg session parse hidden url
    urlMsq = ctx.callbackQuery.message.caption_entities && ctx.callbackQuery.message.caption_entities.at(-1).url;
    if (!urlMsq) {
      urlMsq = ctx.callbackQuery.message.entities && ctx.callbackQuery.message.entities.at(-1).url;
    }
  } else {
    // change ctx if edited
    const msg = ctx.message || ctx.editedMessage;
    // console.log(msg.reply_to_message.reply_markup.inline_keyboard);
    urlMsq = msg && msg.reply_to_message && msg.reply_to_message.entities && msg.reply_to_message.entities.at(-1).url;
  }
  const url = new URL(urlMsq ? urlMsq : "http://t.me");
  // rnd error message is not modified not show
  const rnd = Math.random().toFixed(4).substring(2);
  url.searchParams.set("rnd", rnd);
  // check TTL
  if (url.searchParams.get("TTL") == 0) {
    url.searchParams.delete("sQty");
    url.searchParams.delete("sId");
    url.searchParams.delete("sObjectId");
    url.searchParams.delete("cRowN");
    url.searchParams.delete("ePrice");
    url.searchParams.delete("ePurchase");
    url.searchParams.delete("eCurrency");
    url.searchParams.delete("search_text");
    url.searchParams.delete("search_order_text");
    url.searchParams.delete("page");
    url.searchParams.delete("page_order");
    url.searchParams.delete("productAddedQty");
    url.searchParams.delete("productAddedId");
    url.searchParams.delete("productAddedObjectId");
    url.searchParams.delete("tag");
    url.searchParams.delete("pName");
    url.searchParams.delete("pPrice");
    url.searchParams.delete("pUnit");
    url.searchParams.delete("pCart");
    url.searchParams.delete("cPrice");
    url.searchParams.delete("TTL");
  }
  if (url.searchParams.get("TTL") == 1) {
    url.searchParams.set("TTL", 0);
  }
  ctx.state.sessionMsg = {
    url,
    linkHTML() {
      return `<a href="${this.url.href}">\u200c</a>`;
      // return `<a href="${this.url.href}">${this.url.href}</a>`;
    },
    create(searchParams) {
      if (searchParams) {
        this.url = new URL(`http://t.me?${searchParams}`);
      }
    },
  };
  return next();
});
// route actions
bot.on("callback_query",
    parseUrl, ...startActions, ...catalogsActions, ...ordersActions, ...monoActions, ...uploadActions, searchProductAction, searchOrderAction, ...esp32Actions, ...sitesActions);
// start bot
bot.start(async (ctx) => {
  const startParam = ctx.message.text && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(ctx.message.text.substring(7)) && atob(ctx.message.text.substring(7));
  await startHandler(ctx, startParam);
  // save user data
  // TODO check exist user
  const user = await store.findRecord(`users/${ctx.from.id}`);
  if (!user) {
    if (startParam) {
      // add start param
      await store.createRecord(`users/${ctx.from.id}`, {
        from: {...ctx.from, startParam},
        createdAt: Math.floor(Date.now() / 1000),
      });
    } else {
      await store.createRecord(`users/${ctx.from.id}`, {
        from: {...ctx.from},
        createdAt: Math.floor(Date.now() / 1000),
      });
    }
  }
});

// New 16.11.2023 upload catalogs
// bot.command("upload_catalogs", async (ctx) => {
//   await uploadCatalogs(ctx);
// });

// light control
bot.command("light", async (ctx) => {
  await esp32Handler(ctx);
});
// show obj
bot.command("catalogs", async (ctx) => {
  await startHandler(ctx);
});
// search products deprecated!!!
// bot.command("search", async (ctx) => {
//   await searchFormProduct(ctx);
// });
// monobank
bot.command("mono", async (ctx) => {
  await monoHandler(ctx);
});
// share phone number
bot.on("contact", async (ctx) => {
  const userSessionScene = await store.findRecord(`users/${ctx.from.id}/sessions/scene`);
  const scene = userSessionScene?.name;
  if (scene === "wizardOrder") {
    const cursor = ctx.state.sessionMsg.url.searchParams.get("cursor");
    await cartWizard[cursor](ctx, ctx.message.contact.phone_number);
    return;
  }
});
// check session vars
bot.on(["text"], async (ctx) => {
  // create object parce url
  // const scene = ctx.state.sessionMsg.url.searchParams.get("scene");
  // use fire session
  const userSessionScene = await store.findRecord(`users/${ctx.from.id}/sessions/scene`);
  const scene = userSessionScene?.name;
  // import session vars
  ctx.state.sessionMsg.create(userSessionScene?.searchParams);
  const sheetUrl = ctx.state.isAdmin && ctx.message.text && ctx.message.text.match(/.*docs\.google\.com\/spreadsheets\/d\/([\w]*)\/?/);
  if (sheetUrl) {
    await uploadForm(ctx, sheetUrl[1]);
    return;
  }
  // upload products from page name
  if (scene === "uploadProducts") {
    const objectId = ctx.state.sessionMsg.url.searchParams.get("oId");
    await uploadProductsTrigger(ctx, ctx.message.text, objectId);
    await store.defaultSession(ctx);
    return;
  }
  // edit banner
  if (scene === "changeBanner") {
    await changeBanner(ctx, ctx.message.text, scene);
    await store.defaultSession(ctx);
    return;
  }
  // change name and price
  if (scene === "changeProduct") {
    await changeProduct(ctx, ctx.message.text);
    return;
  }
  // change price in cart deprecated!!!
  // if (scene === "changeCartProductPrice") {
  //   await changeCartProductPrice(ctx, message.text);
  //   return;
  // }

  // edit catalog desc, siteDesc
  if (scene === "upload-eCat") {
    await changeCatalog(ctx, ctx.message.text);
    await store.defaultSession(ctx);
    return;
  }
  // edit catalog postId
  // if (scene === "upload-postId") {
  //   await changeCatalog(ctx, message.text);
  //   return;
  // }
  // algolia search test
  if (scene === "search") {
    ctx.state.sessionMsg.url.searchParams.set("search_text", ctx.message.text);
    ctx.state.sessionMsg.url.searchParams.set("TTL", 1);
    await searchProductHandle(ctx);
    return;
  }
  // search orders
  if (scene === "searchOrder") {
    ctx.state.sessionMsg.url.searchParams.set("search_order_text", ctx.message.text);
    await searchOrderHandle(ctx);
    await store.defaultSession(ctx);
    return;
  }
  // edit order wizard
  if (scene === "editOrder") {
    const cursor = ctx.state.sessionMsg.url.searchParams.get("cursor");
    await orderWizard[cursor](ctx, ctx.message.text);
    return;
  }
  // wizard create order
  if (scene === "wizardOrder") {
    const cursor = ctx.state.sessionMsg.url.searchParams.get("cursor");
    await cartWizard[cursor](ctx, ctx.message.text);
    return;
  }
  // edit sites
  if (scene === "editSite") {
    await siteEditHandle(ctx, ctx.message.text);
    return;
  }
  await ctx.reply("Use command /catalogs");
});
// upload photos
bot.on("photo", async (ctx) => {
  // const sessionFire = await store.findRecord(`users/${ctx.from.id}`, "session");
  // const scene = ctx.state.sessionMsg.url.searchParams.get("scene");
  // use fire session
  const userSessionScene = await store.findRecord(`users/${ctx.from.id}/sessions/scene`);
  const scene = userSessionScene?.name;
  // import session vars
  ctx.state.sessionMsg.create(userSessionScene?.searchParams);
  const objectId = ctx.state.sessionMsg.url.searchParams.get("oId");
  const productId = ctx.state.sessionMsg.url.searchParams.get("upload-productId");
  const catalogId = ctx.state.sessionMsg.url.searchParams.get("upload-catalogId");

  if (scene === "upload-prod") {
    await ctx.reply("uploadPhotoProduct start");
    await uploadPhotoProduct(ctx, objectId, productId);
    ctx.state.sessionMsg.url.searchParams.delete("upload-productId");
    await store.defaultSession(ctx);
    return;
  }
  if (scene === "upload-cat") {
    await ctx.reply("uploadPhotoCat start");
    await uploadPhotoCat(ctx, catalogId);
    ctx.state.sessionMsg.url.searchParams.delete("upload-catalogId");
    await store.defaultSession(ctx);
    return;
  }
  if (scene === "upload-obj") {
    await ctx.reply("uploadPhotoObj start");
    await uploadPhotoObj(ctx, objectId);
    await store.defaultSession(ctx);
    return;
  }
  if (scene === "upload-lg-banner") {
    await ctx.reply("upload-lg-banner start");
    await uploadBanner(ctx, "lg");
    await store.defaultSession(ctx);
    return;
  }
  if (scene === "upload-md-banner") {
    await ctx.reply("upload-md-banner start");
    await uploadBanner(ctx, "md");
    await store.defaultSession(ctx);
    return;
  }
  // ctx.state.sessionMsg.url.searchParams.delete("scene");
  await ctx.reply("session scene is null");
});
// error handler
bot.catch((error) => {
  console.log("Telegraf error", error);
});

// memory value 128MB 256MB 512MB 1GB 2GB 4GB 8GB
// const runtimeOpts = {
//   memory: "1GB",
// };
// run bot in Warsaw
// exports.botFunction = functions.region("europe-central2").
//     runWith(runtimeOpts).https.onRequest(async (req, res) => {
//       try {
//         // launch local env
//         if (process.env.FUNCTIONS_EMULATOR) {
//           bot.launch();
//         } else {
//           await bot.handleUpdate(req.body);
//         }
//       } finally {
//         res.status(200).end();
//       }
//     });
// 2nd gen function
exports.botFunctionSecondGen = onRequest({region: "europe-central2", maxInstances: 10, memory: "1GiB"}, async (req, res) => {
  try {
    // launch local env
    // if (process.env.FUNCTIONS_EMULATOR) {
    //   bot.launch();
    // } else {
    //   await bot.handleUpdate(req.body);
    // }
    await bot.handleUpdate(req.body);
  } finally {
    res.status(200).end();
  }
});
