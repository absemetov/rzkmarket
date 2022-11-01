const functions = require("firebase-functions");
const {Telegraf} = require("telegraf");
const {startActions, startHandler, parseUrl, isAdmin} = require("./bot_start_scene");
const {monoHandler, monoActions} = require("./bot_mono_scene");
const {uploadActions, uploadForm} = require("./bot_upload_scene");
const {ordersActions, orderWizard} = require("./bot_orders_scene");
const {catalogsActions, cartWizard} = require("./bot_catalog_scene");
const {store, uploadPhotoObj, uploadPhotoProduct, uploadPhotoCat} = require("./bot_store_cart");
const {searchFormProduct, searchProductHandle, searchProductAction, searchOrderHandle, searchOrderAction} = require("./bot_search");
const {URL} = require("url");
const bot = new Telegraf(process.env.BOT_TOKEN);
// midleware admin
bot.use(isAdmin);
// session msg
bot.use(async (ctx, next) => {
  let urlMsq;
  if (ctx.callbackQuery) {
    // console.log("=============callbackQuery happened", ctx.callbackQuery.data.length, ctx.callbackQuery.data);
    // test msg session parse hidden url
    urlMsq = ctx.callbackQuery.message.caption_entities && ctx.callbackQuery.message.caption_entities.at(-1).url;
    if (!urlMsq) {
      urlMsq = ctx.callbackQuery.message.entities && ctx.callbackQuery.message.entities.at(-1).url;
    }
  } else {
    // change ctx if edited
    const msg = ctx.message || ctx.editedMessage;
    urlMsq = msg && msg.reply_to_message && msg.reply_to_message.entities && msg.reply_to_message.entities.at(-1).url;
  }
  const url = new URL(urlMsq ? urlMsq : "http://t.me");
  // rnd error message is not modified not show
  const rnd = Math.random().toFixed(4).substring(2);
  url.searchParams.set("rnd", rnd);
  ctx.state.sessionMsg = {
    url,
    linkHTML() {
      return `<a href="${this.url.href}">\u200c</a>`;
      // return `<a href="${this.url.href}">${this.url.href}</a>`;
    },
  };
  return next();
});
// route actions
// bot.action(/^([a-zA-Z0-9-_]+)\/?([a-zA-Z0-9-_]+)?\??([a-zA-Z0-9-_=&/:~+]+)?/,
//     parseUrl, ...startActions, ...catalogsActions, ...ordersActions, ...monoActions, ...uploadActions, ...searchActions);
bot.on("callback_query",
    parseUrl, ...startActions, ...catalogsActions, ...ordersActions, ...monoActions, ...uploadActions, searchProductAction, searchOrderAction);
// start bot
bot.start(async (ctx) => {
  await startHandler(ctx);
  // save user data
  // const userData = await store.findRecord(`users/${ctx.from.id}`);
  // if (!userData) {
  await store.createRecord(`users/${ctx.from.id}`, {
    from: {...ctx.from},
    createdAt: Math.floor(Date.now() / 1000),
  });
  // }
});
// show obj
bot.command("objects", async (ctx) => {
  await startHandler(ctx);
});
// search products
bot.command("search", async (ctx) => {
  await searchFormProduct(ctx);
});
// monobank
bot.command("mono", async (ctx) => {
  await monoHandler(ctx);
});
// share phone number
bot.on("contact", async (ctx) => {
  if (ctx.state.sessionMsg.url.searchParams.get("scene") === "wizardOrder") {
    const cursor = ctx.state.sessionMsg.url.searchParams.get("cursor");
    // await cartWizard[sessionFire.cursor](ctx);
    await cartWizard[cursor](ctx, ctx.message.contact.phone_number);
    return;
  }
});
// check session vars
bot.on(["text", "edited_message"], async (ctx) => {
  // create object parce url
  const message = ctx.message || ctx.editedMessage;
  const sheetUrl = ctx.state.isAdmin && message.text && message.text.match(/d\/(.*)\//);
  if (sheetUrl) {
    // save sheetId to session
    // await store.createRecord(`users/${ctx.from.id}`, {"session": {"sheetId": sheetUrl[1]}});
    await uploadForm(ctx, sheetUrl[1]);
    return;
  }
  // algolia search test
  // if (sessionFire && sessionFire.scene === "search") {
  if (ctx.state.sessionMsg.url.searchParams.get("scene") === "search") {
    // ctx.state.routeName = "search";
    // parseUrl(ctx, "search");
    ctx.state.sessionMsg.url.searchParams.set("search_text", message.text);
    await searchProductHandle(ctx);
    return;
  }
  // search orders
  if (ctx.state.sessionMsg.url.searchParams.get("scene") === "searchOrder") {
    ctx.state.sessionMsg.url.searchParams.set("search_order_text", message.text);
    await searchOrderHandle(ctx);
    return;
  }
  // get session scene
  // const sessionFire = await store.findRecord(`users/${ctx.from.id}`, "session");
  // edit order wizard
  if (ctx.state.sessionMsg.url.searchParams.get("scene") === "editOrder") {
    const cursor = ctx.state.sessionMsg.url.searchParams.get("cursor");
    await orderWizard[cursor](ctx, message.text);
    return;
  }
  // wizard create order
  // if (sessionFire && sessionFire.scene === "wizardOrder") {
  if (ctx.state.sessionMsg.url.searchParams.get("scene") === "wizardOrder") {
    const cursor = ctx.state.sessionMsg.url.searchParams.get("cursor");
    // await cartWizard[sessionFire.cursor](ctx);
    await cartWizard[cursor](ctx, message.text);
    return;
  }
  if (message.text === "Отмена") {
    await ctx.reply("Для продолжения нажмите /objects", {
      reply_markup: {
        remove_keyboard: true,
      }});
    // await store.createRecord(`users/${ctx.from.id}`, {"session": {"scene": null}});
    // ctx.session.scene = null;
    return;
  }
  await ctx.reply("Commands /objects /search");
});
// upload photos
bot.on("photo", async (ctx) => {
  // const sessionFire = await store.findRecord(`users/${ctx.from.id}`, "session");
  const scene = ctx.state.sessionMsg.url.searchParams.get("scene");
  const objectId = ctx.state.sessionMsg.url.searchParams.get("objectId");
  const productId = ctx.state.sessionMsg.url.searchParams.get("upload-productId");
  const catalogId = ctx.state.sessionMsg.url.searchParams.get("upload-catalogId");

  if (scene === "upload-prod") {
    await ctx.reply("uploadPhotoProduct start");
    await uploadPhotoProduct(ctx, objectId, productId);
    ctx.state.sessionMsg.url.searchParams.delete("scene");
    ctx.state.sessionMsg.url.searchParams.delete("upload-productId");
    return;
  }
  if (scene === "upload-cat") {
    await ctx.reply("uploadPhotoCat start");
    await uploadPhotoCat(ctx, objectId, catalogId);
    ctx.state.sessionMsg.url.searchParams.delete("scene");
    ctx.state.sessionMsg.url.searchParams.delete("upload-catalogId");
    return;
  }
  if (scene === "upload-obj") {
    await ctx.reply("uploadPhotoObj start");
    await uploadPhotoObj(ctx, objectId);
    ctx.state.sessionMsg.url.searchParams.delete("scene");
    return;
  }
  await ctx.reply("session scene is null");
});
// error handler
bot.catch((error) => {
  // if (error instanceof Error && error.message.includes("message is not modified")) {
  //   // ignore
  //   return false;
  // }
  // throw error;
  console.log("Telegraf error", error);
});

// memory value 128MB 256MB 512MB 1GB 2GB 4GB 8GB
const runtimeOpts = {
  memory: "1GB",
};
// run bot in Warsaw
exports.botFunction = functions.region("europe-central2").
    runWith(runtimeOpts).https.onRequest(async (req, res) => {
      try {
        // launch local env
        if (process.env.FUNCTIONS_EMULATOR) {
          await bot.launch();
        } else {
          await bot.handleUpdate(req.body);
        }
      } finally {
        res.status(200).end();
      }
    });
