const functions = require("firebase-functions");
const {Telegraf} = require("telegraf");
const {startActions, startHandler, parseUrl, isAdmin, uploadPhotoObj} = require("./bot_start_scene");
const {monoHandler, monoActions} = require("./bot_mono_scene");
const {uploadActions, uploadForm} = require("./bot_upload_scene");
const {ordersActions, orderWizard} = require("./bot_orders_scene");
const {uploadPhotoProduct, uploadPhotoCat, catalogsActions, cartWizard} = require("./bot_catalog_scene");
const {store, photoCheckUrl} = require("./bot_store_cart");
const algoliasearch = require("algoliasearch");
const bot = new Telegraf(process.env.BOT_TOKEN, {
  handlerTimeout: 540000,
});
// midleware admin
bot.use(isAdmin);
// helper route
bot.use(async (ctx, next) => {
  if (ctx.callbackQuery && "data" in ctx.callbackQuery && process.env.FUNCTIONS_EMULATOR) {
    console.log("=============callbackQuery happened", ctx.callbackQuery.data.length, ctx.callbackQuery.data);
  }
  return next();
});
// route actions
bot.action(/^([a-zA-Z0-9-_]+)\/?([a-zA-Z0-9-_]+)?\??([a-zA-Z0-9-_=&/:~+]+)?/,
    parseUrl, ...startActions, ...catalogsActions, ...ordersActions, ...monoActions, ...uploadActions);
// start bot
bot.start(async (ctx) => {
  // deep linking parsing
  const pathProduct = ctx.message.text.match(/o_([a-zA-Z0-9-_]+)_p_([a-zA-Z0-9-_]+)/);
  const pathCatalog = ctx.message.text.match(/o_([a-zA-Z0-9-_]+)_c_([a-zA-Z0-9-_]+)/);
  const inlineKeyboardArray = [];
  let caption = "";
  if (pathProduct) {
    const productId = pathProduct[2];
    const objectId = pathProduct[1];
    const product = await store.findRecord(`objects/${objectId}/products/${productId}`);
    const object = await store.findRecord(`objects/${objectId}`);
    if (object) {
      if (product) {
        inlineKeyboardArray.push([{text: `📦 ${product.name} (${product.id})`,
          callback_data: `p/${product.id}?o=${objectId}`}]);
      } else {
        inlineKeyboardArray.push([{text: "🗂 Каталог товаров",
          callback_data: `c?o=${objectId}`}]);
      }
      caption = `<b>${object.name}\n` +
        `Контакты: ${object.phoneArray.join()}\n` +
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
        inlineKeyboardArray.push([{text: `🗂 ${catalog.name}`,
          callback_data: `c/${catalogId}?o=${objectId}`}]);
      } else {
        inlineKeyboardArray.push([{text: "🗂 Каталог товаров",
          callback_data: `c?o=${objectId}`}]);
      }
      caption = `<b>${object.name}\n` +
        `Контакты: ${object.phoneArray.join()}\n` +
        `Адрес: ${object.address}\n` +
        `Описание: ${object.description}</b>`;
    }
  }
  if (caption) {
    const publicImgUrl = await photoCheckUrl();
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
  // save user data
  const userData = await store.findRecord(`users/${ctx.from.id}`);
  if (!userData) {
    await store.createRecord(`users/${ctx.from.id}`, {
      firstName: ctx.from.first_name,
      message: ctx.message.text,
    });
  }
});
// rzk shop
bot.command("objects", async (ctx) => {
  await startHandler(ctx);
});
// monobank
bot.command("mono", async (ctx) => {
  await monoHandler(ctx);
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
  if (sessionFire && sessionFire.scene === "search") {
    const client = algoliasearch(process.env.ALGOLIA_ID, process.env.ALGOLIA_ADMIN_KEY);
    const index = client.initIndex("products");
    const inlineKeyboard = [];
    try {
      const resalt = await index.search(ctx.message.text);
      for (const product of resalt.hits) {
        const addButton = {text: `${product.objectID} ${product.name} ${product.price} ${product.currency}`,
          callback_data: `p/${product.objectID}?o=absemetov`};
        inlineKeyboard.push([addButton]);
      }
      await ctx.reply(`Search resalts: ${resalt.nbHits}`, {
        reply_markup: {
          inline_keyboard: inlineKeyboard,
        },
      });
    } catch (error) {
      await ctx.reply(`Algolia error: ${error}`);
    }
    return;
  }
  await ctx.reply("session scene is null");
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
