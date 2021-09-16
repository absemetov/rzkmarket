const functions = require("firebase-functions");
const firebase = require("firebase-admin");
firebase.initializeApp();
const {Telegraf, Scenes: {Stage}} = require("telegraf");
const firestoreSession = require("telegraf-session-firestore");
const {start} = require("./bot_start_scene");
const {monoScene, monoActions} = require("./bot_mono_scene");
const {upload} = require("./bot_upload_scene");
const {catalogScene, catalogsActions} = require("./bot_catalog_scene");
// const {getMainKeyboard} = require("./bot_keyboards.js");
// const {MenuMiddleware} = require("telegraf-inline-menu");
// Stage scenes
const stage = new Stage([start, monoScene, upload, catalogScene]);
const token = functions.config().bot.token;
const bot = new Telegraf(token, {
  handlerTimeout: 540000,
});
// Firestore session
bot.use(firestoreSession(firebase.firestore().collection("sessions")));

bot.use(async (ctx, next) => {
  if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
    console.log(" Bot scene another callbackQuery happened", ctx.callbackQuery.data.length, ctx.callbackQuery.data);
  }
  return next();
});

// Actions catalog, mono
// (routeName)/(param)?(args)
// Parse callback data
const parseUrl = async (ctx, next) => {
  ctx.state.routeName = ctx.match[1];
  ctx.state.param = ctx.match[2];
  const args = ctx.match[3];
  // parse url params
  const params = new Map();
  if (args) {
    for (const paramsData of args.split("&")) {
      params.set(paramsData.split("=")[0], paramsData.split("=")[1]);
    }
  }
  ctx.state.params = params;
  return next();
};
// scenes
bot.use(stage.middleware());
// eslint-disable-next-line no-useless-escape
bot.action(/^([a-zA-Z0-9-_]+)\/?([a-zA-Z0-9-_]+)?\??([a-zA-Z0-9-_=&\/:~+]+)?/,
    parseUrl, ...catalogsActions, ...monoActions);

bot.start((ctx) => ctx.scene.enter("start"));
// bot.hears("mono", (ctx) => ctx.scene.enter("mono"));
bot.hears("where", (ctx) => ctx.reply("You are in outside"));
// mono menu
// const monoMiddleware = new MenuMiddleware("mono/", menuMono);
// console.log(menuMiddleware.tree());
// bot.command("mono", async (ctx) => monoMiddleware.replyToContext(ctx));
// bot.use(monoMiddleware.middleware());
// mono scene
bot.command("mono", async (ctx) => ctx.scene.enter("monoScene"));
// Upload scene
bot.command("upload", async (ctx) => ctx.scene.enter("upload"));
// Catalog scene
bot.command("catalog", async (ctx) => ctx.scene.enter("catalog"));

// if session destroyed show main keyboard
// bot.on("text", async (ctx) => ctx.reply("Menu test", getMainKeyboard));

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
