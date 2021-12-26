const functions = require("firebase-functions");
const {Telegraf, session} = require("telegraf");
const {startActions, startHandler, parseUrl, isAdmin, uploadPhotoObj, photoCheckUrl} = require("./bot_start_scene");
const {monoHandler, monoActions} = require("./bot_mono_scene");
const {createObject} = require("./bot_upload_scene");
const {ordersActions, orderWizard} = require("./bot_orders_scene");
const {uploadPhotoProduct, uploadPhotoCat, catalogsActions, cartWizard} = require("./bot_catalog_scene");
const {store} = require("./bot_store_cart.js");
const botConfig = functions.config().env.bot;
const bot = new Telegraf(botConfig.token, {
  handlerTimeout: 540000,
});
bot.use(session());
bot.use(isAdmin);
bot.use(async (ctx, next) => {
  if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
    console.log("=============callbackQuery happened", ctx.callbackQuery.data.length, ctx.callbackQuery.data);
  }
  // set session
  if (ctx.session === undefined) {
    ctx.session = {};
  }
  // set bot name user name and project logo
  // ctx.state.bot_first_name = bot.botInfo.first_name;
  ctx.state.bot_username = bot.botInfo.username;
  return next();
});
// route actions
// eslint-disable-next-line no-useless-escape
bot.action(/^([a-zA-Z0-9-_]+)\/?([a-zA-Z0-9-_]+)?\??([a-zA-Z0-9-_=&\/:~+]+)?/,
    parseUrl, ...startActions, ...catalogsActions, ...ordersActions, ...monoActions);
// start bot
bot.start(async (ctx) => {
  // deep linking parsing
  const pathProduct = ctx.message.text.match(/OBJECT([a-zA-Z0-9-_]+)PRODUCT([a-zA-Z0-9-_]+)/);
  const pathCatalog = ctx.message.text.match(/OBJECT([a-zA-Z0-9-_]+)CATALOG([a-zA-Z0-9-_]+)/);
  const inlineKeyboardArray = [];
  let caption = "";
  if (pathProduct) {
    const productId = pathProduct[2];
    const objectId = pathProduct[1];
    const product = await store.findRecord(`objects/${objectId}/products/${productId}`);
    const object = await store.findRecord(`objects/${objectId}`);
    if (object) {
      if (product) {
        inlineKeyboardArray.push([{text: `🗂 Перейти в товар ${product.name} (${product.id})`,
          callback_data: `p/${product.id}?o=${objectId}`}]);
      } else {
        inlineKeyboardArray.push([{text: "🗂 Перейти в каталоги",
          callback_data: `c?o=${objectId}`}]);
      }
      caption = `<b>${ctx.state.bot_first_name} > ${object.name}\n` +
        `Контакты: ${object.phoneNumber}\n` +
        `Адрес: ${object.address}\n` +
        `Описание: ${object.description}</b>`;
    }
  }
  if (pathCatalog) {
    const catalogId = pathCatalog[2];
    const objectId = pathCatalog[1];
    const catalog = await store.findRecord(`objects/${objectId}/catalogs/${catalogId}`);
    const object = await store.findRecord(`objects/${objectId}`);
    if (object) {
      if (catalog) {
        inlineKeyboardArray.push([{text: `🗂 Перейти в каталог ${catalog.name}`,
          callback_data: `c/${catalogId}?o=${objectId}`}]);
      } else {
        inlineKeyboardArray.push([{text: "🗂 Перейти в каталоги",
          callback_data: `c?o=${objectId}`}]);
      }
      caption = `<b>${ctx.state.bot_first_name} > ${object.name}\n` +
        `Контакты: ${object.phoneNumber}\n` +
        `Адрес: ${object.address}\n` +
        `Описание: ${object.description}</b>`;
    }
  }
  if (caption) {
    const publicImgUrl = await photoCheckUrl(botConfig.logo);
    await ctx.replyWithPhoto(publicImgUrl,
        {
          caption,
          parse_mode: "html",
          reply_markup: {
            inline_keyboard: inlineKeyboardArray,
          },
        });
  } else {
    await startHandler(ctx);
  }
  // admin notify
  await ctx.telegram.sendMessage(94899148, `<b>New subsc! <a href="tg://user?id=${ctx.from.id}">${ctx.from.id}</a>\n`+
  `Message: ${ctx.message.text}</b>`,
  {parse_mode: "html"});
});
// rzk shop
bot.command("objects", async (ctx) => {
  await startHandler(ctx);
});
// monobank
bot.command("mono", async (ctx) => {
  await monoHandler(ctx);
});
// update object info, upload products
bot.hears(/([a-zA-Z0-9-_]+)_([a-zA-Z0-9-_]+)/, async (ctx) => {
  await createObject(ctx, ctx.match[1], ctx.match[2]);
});
// check session vars
bot.on(["text", "contact"], async (ctx) => {
  if (ctx.session.scene === "editOrder") {
    await orderWizard[ctx.session.cursor](ctx);
    return;
  }
  if (ctx.message.text === "Отмена") {
    await ctx.reply("Для продолжения нажмите /objects", {
      reply_markup: {
        remove_keyboard: true,
      }});
    await store.createRecord(`users/${ctx.from.id}`, {"session": {"scene": null}});
    ctx.session.scene = null;
    return;
  }
  const sessionFire = await store.findRecord(`users/${ctx.from.id}`, "session");
  if (sessionFire.scene === "wizardOrder") {
    await cartWizard[sessionFire.cursor](ctx);
    return;
  }
  // create object
  const sheetUrl = ctx.message.text.match(/d\/(.*)\//);
  if (sheetUrl) {
    await createObject(ctx, null, sheetUrl[1]);
    return;
  }
  await ctx.reply("session scene is null");
});
// upload photo
bot.on("photo", async (ctx) => {
  const sessionFire = await store.findRecord(`users/${ctx.from.id}`, "session");
  if (sessionFire.scene === "uploadPhotoProduct") {
    await ctx.reply("uploadPhotoProduct start");
    await uploadPhotoProduct(ctx, sessionFire.objectId, sessionFire.productId);
    return;
  }
  if (sessionFire.scene === "uploadPhotoCat") {
    await ctx.reply("uploadPhotoCat start");
    await uploadPhotoCat(ctx, sessionFire.objectId, sessionFire.catalogId);
    return;
  }
  if (sessionFire.scene === "uploadPhotoObj") {
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
// launch local env
if (process.env.FUNCTIONS_EMULATOR) {
  bot.launch();
}
// memory value 128MB 256MB 512MB 1GB 2GB 4GB 8GB
const runtimeOpts = {
  timeoutSeconds: 540,
  memory: "1GB",
};
// Enable graceful stop
// process.once("SIGINT", () => bot.stop("SIGINT"));
// process.once("SIGTERM", () => bot.stop("SIGTERM"));
// use warsaw region("europe-central2")
exports.bot = functions.region("europe-central2").
    runWith(runtimeOpts).https.onRequest(async (req, res) => {
      try {
        await bot.handleUpdate(req.body);
      } finally {
        res.status(200).end();
      }
    });
