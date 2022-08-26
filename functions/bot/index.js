const functions = require("firebase-functions");
const {Telegraf} = require("telegraf");
const {startActions, startHandler, searchHandler, parseUrl, isAdmin, uploadPhotoObj} = require("./bot_start_scene");
const {monoHandler, monoActions} = require("./bot_mono_scene");
const {uploadActions, uploadForm} = require("./bot_upload_scene");
const {ordersActions, orderWizard} = require("./bot_orders_scene");
const {uploadPhotoProduct, uploadPhotoCat, catalogsActions, cartWizard} = require("./bot_catalog_scene");
const {store} = require("./bot_store_cart");
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
  function signQuestion(sign, text) {
    const signUrl = "http://t.me/";
    const signTextLink = `[\u200c](${signUrl}${sign})`;
    return signTextLink + text;
  }
  const finalQuestion = signQuestion("#sE1R2w", "What is your name?");
  await ctx.replyWithMarkdownV2(`A Reply ${finalQuestion}`, {
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
  await searchHandler(ctx);
});
// monobank
bot.command("mono", async (ctx) => {
  await monoHandler(ctx);
});
// check session vars
bot.on(["text", "contact"], async (ctx) => {
  // force repl
  if (ctx.message.reply_to_message) {
    console.log(ctx.message.reply_to_message);
    const sign = getSignOfMessage(ctx.message.reply_to_message);
    // Now here we check the sign of reply_to_message NOT the text of reply_to_message ;)
    console.log(sign);
  }

  function getSignOfMessage(msg) {
    const signUrl = "http://t.me/#sE1R2w";
    let sign;
    if (msg.entities) {
      const e = msg.entities.find((i) => i.type=="text_link" && i.url && i.url.indexOf(signUrl)>0);
      console.log(e);
      if (e) {
        sign=e.url.substr(e.url.indexOf("#"));
      }
    }
    return sign;
  }
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
