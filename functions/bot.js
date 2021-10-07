const functions = require("firebase-functions");
const firebase = require("firebase-admin");
firebase.initializeApp();
const {Telegraf, Scenes: {Stage}} = require("telegraf");
const firestoreSession = require("telegraf-session-firestore");
const {startActions, parseUrl, cart} = require("./bot_start_scene");
const {monoActions} = require("./bot_mono_scene");
const {upload} = require("./bot_upload_scene");
const {catalogScene, catalogsActions, orderWizard} = require("./bot_catalog_scene");
// const {getMainKeyboard} = require("./bot_keyboards.js");
// const {MenuMiddleware} = require("telegraf-inline-menu");
// bot.rzkcrimeabot.token
// bot.rzkmarketbot.token
const token = functions.config().bot.rzkdevbot.token;
// config bot
const bot = new Telegraf(token, {
  handlerTimeout: 540000,
});
// Firestore session
// Stage scenes
const stage = new Stage([upload, catalogScene, orderWizard]);
bot.use(cart);
bot.use(firestoreSession(firebase.firestore().collection("sessions")), stage.middleware());
// Actions catalog, mono
// (routeName)/(param)?(args)
// scenes
// bot.use();
// eslint-disable-next-line no-useless-escape
bot.action(/^([a-zA-Z0-9-_]+)\/?([a-zA-Z0-9-_]+)?\??([a-zA-Z0-9-_=&\/:~+]+)?/,
    parseUrl, ...startActions, ...catalogsActions, ...monoActions);
bot.start(async (ctx) => {
  await ctx.replyWithPhoto("https://picsum.photos/450/150/?random",
      {
        caption: "Welcome to Rzk Market Ukraine 🇺🇦",
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[
            {text: "📁 Catalog", callback_data: "c"},
            {text: "🛒 Cart", callback_data: "cart"},
          ]],
        },
      });
  // set commands
  await ctx.telegram.setMyCommands([
    {"command": "start", "description": "RZK Market Shop"},
    {"command": "upload", "description": "Upload goods"},
    {"command": "mono", "description": "Monobank exchange rates "},
  ]);
});
// bot.hears("mono", (ctx) => ctx.scene.enter("mono"));
bot.hears("where", (ctx) => ctx.reply("You are in main menu"));
// mono menu
// const monoMiddleware = new MenuMiddleware("mono/", menuMono);
// console.log(menuMiddleware.tree());
// bot.command("mono", async (ctx) => monoMiddleware.replyToContext(ctx));
// bot.use(monoMiddleware.middleware());
// mono scene
bot.command("mono", async (ctx) => {
  // ctx.scene.enter("monoScene");
  ctx.reply("Выберите валюту", {
    reply_markup: {
      inline_keyboard: [
        [
          {text: "🇱🇷 USD", callback_data: "mono/USD"},
          {text: "🇪🇺 EUR", callback_data: "mono/EUR"},
          {text: "🇷🇺 RUB", callback_data: "mono/RUB"},
        ],
        [
          {text: "Monobank.com.ua", url: "https://monobank.com.ua"},
        ],
      ],
    }});
});
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
