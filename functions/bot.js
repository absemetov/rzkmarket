const functions = require("firebase-functions");
const firebase = require("firebase-admin");
const {Telegraf} = require("telegraf");
// const firestoreSession = require("telegraf-session-firestore");
firebase.initializeApp();
const {startActions, startHandler, parseUrl, cart, botConfig, isAdmin} = require("./bot_start_scene");
const {monoHandler, monoActions} = require("./bot_mono_scene");
const {uploadHandler} = require("./bot_upload_scene");
const {ordersActions} = require("./bot_orders_scene");
const {uploadPhotoProduct, catalogsActions, orderWizard} = require("./bot_catalog_scene");
// const {getMainKeyboard} = require("./bot_keyboards.js");
// const {MenuMiddleware} = require("telegraf-inline-menu");
const bot = new Telegraf(botConfig.token, {
  handlerTimeout: 540000,
});
// const stage = new Stage([upload, catalogScene, orderWizard]);
// cart session instance
bot.use(cart, isAdmin);
bot.use(async (ctx, next) => {
  if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
    console.log("callbackQuery happened", ctx.callbackQuery.data.length, ctx.callbackQuery.data);
  }
  console.log(ctx.state.isAdmin);
  return next();
});
// use session lazy
// bot.use(firestoreSession(firebase.firestore().collection("sessions"), {lazy: true}));
// Actions catalog, mono
// (routeName)/(param)?(args)
// scenes
// bot.use();
// eslint-disable-next-line no-useless-escape
bot.action(/^([a-zA-Z0-9-_]+)\/?([a-zA-Z0-9-_]+)?\??([a-zA-Z0-9-_=&\/:~+]+)?/,
    parseUrl, ...startActions, ...catalogsActions, ...ordersActions, ...monoActions);
bot.start(async (ctx) => {
  startHandler(ctx);
});
// bot.hears("mono", (ctx) => ctx.scene.enter("mono"));
// bot.hears("where", async (ctx) => {
//   const session = await ctx.session;
//   ctx.reply("You are in" + session.scene);
// });
// mono menu
// const monoMiddleware = new MenuMiddleware("mono/", menuMono);
// console.log(menuMiddleware.tree());
// bot.command("mono", async (ctx) => monoMiddleware.replyToContext(ctx));
// bot.use(monoMiddleware.middleware());
// mono scene
bot.command("mono", async (ctx) => {
  // ctx.scene.enter("monoScene");
  monoHandler(ctx);
});
// Upload scene
bot.command("upload", async (ctx) => {
  await ctx.state.cart.setSessionData({scene: "upload"});
  ctx.reply("Вставьте ссылку Google Sheet", {
    reply_markup: {
      keyboard: [["Отмена"]],
      resize_keyboard: true,
    }});
  // session.scene = "upload";
  // ctx.scene.enter("upload");
});
// Catalog scene
// bot.command("catalog", async (ctx) => ctx.scene.enter("catalog"));

// if session destroyed show main keyboard
bot.on(["text", "contact"], async (ctx) => {
  const session = await ctx.state.cart.getSessionData();
  if (ctx.message.text === "Отмена") {
    ctx.reply("Для продолжения нажмите /start", {
      reply_markup: {
        remove_keyboard: true,
      }});
    await ctx.state.cart.setSessionData({scene: null});
    return;
  }
  if (session.scene === "upload") {
    await uploadHandler(ctx);
  }
  if (session.scene === "createOrder") {
    await orderWizard[session.cursor](ctx);
  }
});

bot.on("photo", (ctx) => uploadPhotoProduct(ctx));
// bot.telegram.sendMessage(94899148, "Bot Rzk.com.ua ready!" );

bot.catch((error) => {
  if (error instanceof Error && error.message.includes("message is not modified")) {
    // ignore
    return false;
  }
  // throw error;
  console.log("Telegraf error", error);
});

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

exports.bot = functions.runWith(runtimeOpts).https.onRequest(async (req, res) => {
  try {
    await bot.handleUpdate(req.body);
  } finally {
    res.status(200).end();
  }
});
