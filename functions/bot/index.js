const functions = require("firebase-functions");
const {Telegraf} = require("telegraf");
const {startActions, startHandler, parseUrl, isAdmin, uploadPhotoObj} = require("./bot_start_scene");
const {monoHandler, monoActions} = require("./bot_mono_scene");
const {uploadActions, uploadForm} = require("./bot_upload_scene");
const {ordersActions, orderWizard} = require("./bot_orders_scene");
const {uploadPhotoProduct, uploadPhotoCat, catalogsActions, cartWizard} = require("./bot_catalog_scene");
const {store, photoCheckUrl} = require("./bot_store_cart");
const {searchIndex, searchHandle, searchActions} = require("./bot_search");
const {URL} = require("url");
const bot = new Telegraf(process.env.BOT_TOKEN, {
  handlerTimeout: 540000,
});
// midleware admin
bot.use(isAdmin);
// session msg
bot.use(async (ctx, next) => {
  let urlMsq;
  if (ctx.callbackQuery && "data" in ctx.callbackQuery && process.env.FUNCTIONS_EMULATOR) {
    console.log("=============callbackQuery happened", ctx.callbackQuery.data.length, ctx.callbackQuery.data);
    // test msg session parse hidden url
    urlMsq = ctx.callbackQuery.message.caption_entities && ctx.callbackQuery.message.caption_entities.at(-1).url;
  } else {
    // change ctx if edited
    const msg = ctx.message || ctx.editedMessage;
    urlMsq = msg && msg.reply_to_message && msg.reply_to_message.entities && msg.reply_to_message.entities.at(-1).url;
  }
  const url = new URL(urlMsq ? urlMsq : "http://t.me");
  ctx.state.sessionMsg = {
    url,
    linkHTML() {
      return `<a href="${this.url.href}">\u200c</a>`;
    },
  };
  return next();
});
// route actions
bot.action(/^([a-zA-Z0-9-_]+)\/?([a-zA-Z0-9-_]+)?\??([a-zA-Z0-9-_=&/:~+]+)?/,
    parseUrl, ...startActions, ...catalogsActions, ...ordersActions, ...monoActions, ...uploadActions, ...searchActions);
// start bot
bot.start(async (ctx) => {
  await startHandler(ctx);
  // save user data
  const userData = await store.findRecord(`users/${ctx.from.id}`);
  if (!userData) {
    await store.createRecord(`users/${ctx.from.id}`, {
      firstName: ctx.from.first_name,
    });
  }
});
// rzk shop
// test force reply
bot.command("force", async (ctx) => {
  const inlineKeyboard = [];
  const addButton = {text: "Test btn", callback_data: "objects"};
  inlineKeyboard.push([addButton]);
  const projectImg = await photoCheckUrl();
  // locale ctx.i18n.t("test")
  ctx.state.sessionMsg.url.searchParams.set("message", "Nadir Genius");
  await ctx.replyWithPhoto(projectImg,
      {
        caption: "<b>Выберите склад</b>" + ctx.state.sessionMsg.linkHTML(),
        parse_mode: "html",
        reply_markup: {
          inline_keyboard: inlineKeyboard,
        },
      });
  ctx.state.sessionMsg.url.searchParams.set("search", true);
  await ctx.replyWithHTML("<b>Что вы ищете?</b>" + ctx.state.sessionMsg.linkHTML(),
      {
        reply_markup: {
          force_reply: true,
        },
      });
});
bot.command("objects", async (ctx) => {
  await startHandler(ctx);
});
// search products
bot.command("search", async (ctx) => {
  await searchIndex(ctx);
});
// monobank
bot.command("mono", async (ctx) => {
  await monoHandler(ctx);
});
// edited message for search
bot.on("edited_message", async (ctx) => {
  if (ctx.state.sessionMsg.url.searchParams.has("search")) {
    await searchHandle(ctx, ctx.editedMessage.text);
    return;
  }
  await ctx.reply("Commands /objects /search");
});
// check session vars
bot.on(["text", "contact"], async (ctx) => {
  // create object parce url
  const sheetUrl = ctx.state.isAdmin && ctx.message.text && ctx.message.text.match(/d\/(.*)\//);
  if (sheetUrl) {
    // save sheetId to session
    // await store.createRecord(`users/${ctx.from.id}`, {"session": {"sheetId": sheetUrl[1]}});
    await uploadForm(ctx, sheetUrl[1]);
    return;
  }
  // get session scene
  const sessionFire = await store.findRecord(`users/${ctx.from.id}`, "session");
  // edit order wizard
  if (sessionFire && sessionFire.scene === "editOrder") {
    await orderWizard[sessionFire.cursor](ctx);
    return;
  }
  if (ctx.message.text === "Отмена") {
    await ctx.reply("Для продолжения нажмите /objects", {
      reply_markup: {
        remove_keyboard: true,
      }});
    await store.createRecord(`users/${ctx.from.id}`, {"session": {"scene": null}});
    // ctx.session.scene = null;
    return;
  }
  // wizard
  if (sessionFire && sessionFire.scene === "wizardOrder") {
    await cartWizard[sessionFire.cursor](ctx);
    return;
  }
  // algolia search test
  // if (sessionFire && sessionFire.scene === "search") {
  if (ctx.state.sessionMsg.url.searchParams.has("search")) {
    await searchHandle(ctx, ctx.message.text);
    return;
  }
  await ctx.reply("Commands /objects /search");
});
// upload photo
bot.on("photo", async (ctx) => {
  const sessionFire = await store.findRecord(`users/${ctx.from.id}`, "session");
  if (sessionFire && sessionFire.scene === "uploadPhotoProduct") {
    await ctx.reply("uploadPhotoProduct start");
    await uploadPhotoProduct(ctx, sessionFire.objectId, sessionFire.productId);
    return;
  }
  if (sessionFire && sessionFire.scene === "uploadPhotoCat") {
    await ctx.reply("uploadPhotoCat start");
    await uploadPhotoCat(ctx, sessionFire.objectId, sessionFire.catalogId);
    return;
  }
  if (sessionFire && sessionFire.scene === "uploadPhotoObj") {
    await ctx.reply("uploadPhotoObj start");
    await uploadPhotoObj(ctx, sessionFire.objectId);
    return;
  }
  await ctx.reply("session scene is null");
});
// error handler
bot.catch((error) => {
  if (error instanceof Error && error.message.includes("message is not modified")) {
    // ignore
    return false;
  }
  // throw error;
  console.log("Telegraf error", error);
});

// memory value 128MB 256MB 512MB 1GB 2GB 4GB 8GB
const runtimeOpts = {
  timeoutSeconds: 540,
  memory: "1GB",
};
// Enable graceful stop
// process.once("SIGINT", () => bot.stop("SIGINT"));
// process.once("SIGTERM", () => bot.stop("SIGTERM"));
// use warsaw region("europe-central2")
exports.handle = functions.region("europe-central2").
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
