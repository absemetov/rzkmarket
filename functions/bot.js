const functions = require("firebase-functions");
const firebase = require("firebase-admin");
firebase.initializeApp();
const {Telegraf} = require("telegraf");
// const firestoreSession = require("telegraf-session-firestore");
const {startActions, parseUrl, cart} = require("./bot_start_scene");
const {monoHandler, monoActions} = require("./bot_mono_scene");
const {uploadHandler} = require("./bot_upload_scene");
const {uploadPhotoProduct, catalogsActions, orderWizard} = require("./bot_catalog_scene");
// const {getMainKeyboard} = require("./bot_keyboards.js");
// const {MenuMiddleware} = require("telegraf-inline-menu");
// bot.rzkcrimeabot.token
// bot.rzkmarketbot.token
let token = functions.config().bot.rzkmarketbot.token;
// dev bot
if (process.env.FUNCTIONS_EMULATOR) {
  token = functions.config().bot.rzkdevbot.token;
}
// config bot
const bot = new Telegraf(token, {
  handlerTimeout: 540000,
});
// Firestore session
// Stage scenes
// const stage = new Stage([upload, catalogScene, orderWizard]);
// cart session instance
bot.use(cart);
// use session lazy
// bot.use(firestoreSession(firebase.firestore().collection("sessions"), {lazy: true}));
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
  if (session.scene === "order") {
    await orderWizard[session.cursor](ctx);
    console.log("order session");
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
