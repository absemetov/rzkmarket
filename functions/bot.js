const functions = require("firebase-functions");
const firebase = require("firebase-admin");
const {Telegraf, session} = require("telegraf");
// const firestoreSession = require("telegraf-session-firestore");
firebase.initializeApp();
const bucket = firebase.storage().bucket();
const {startActions, startHandler, parseUrl, isAdmin} = require("./bot_start_scene");
const {monoHandler, monoActions} = require("./bot_mono_scene");
const {uploadActions} = require("./bot_upload_scene");
const {ordersActions, orderWizard} = require("./bot_orders_scene");
const {uploadPhotoProduct, uploadPhotoCat, catalogsActions, cartWizard} = require("./bot_catalog_scene");
const {store} = require("./bot_keyboards.js");
const botConfig = functions.config().env.bot;
// const {MenuMiddleware} = require("telegraf-inline-menu");
const bot = new Telegraf(botConfig.token, {
  handlerTimeout: 540000,
});
// const stage = new Stage([upload, catalogScene, orderWizard]);
// cart session instance
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
    parseUrl, ...startActions, ...catalogsActions, ...ordersActions, ...uploadActions, ...monoActions);
// start bot
bot.start(async (ctx) => {
  // set user data
  let userName = "";
  if (ctx.from.first_name) {
    userName += ctx.from.first_name;
  }
  if (ctx.from.last_name) {
    userName += " " + ctx.from.last_name;
  }
  if (ctx.from.username) {
    userName += " @" + ctx.from.username;
  }
  // await ctx.state.cart.setUserName(userName);
  await store.createRecord(`users/${ctx.from.id}`, {userName});
  // deep linking parsing
  const link = ctx.message.text.split(" ")[1];
  const path = link.split("OBJECT");
  const catalogId = path[0];
  const objectId = path[1];
  if (catalogId && objectId) {
    const catalog = await store.findRecord(`objects/${objectId}/catalogs/${catalogId}`);
    const object = await store.findRecord(`objects/${objectId}`);
    const inlineKeyboardArray = [];
    if (catalog && object) {
      inlineKeyboardArray.push([{text: `🗂 Перейти в каталог ${catalog.name}`,
        callback_data: `c/${catalogId}?o=${objectId}`}]);
      const publicImgUrl = bucket.file(botConfig.logo).publicUrl();
      const caption = `<b>${botConfig.name} > ${object.name}\n` +
        `Контакты: ${object.phoneNumber}\n` +
        `Адрес: ${object.address}\n` +
        `Описание: ${object.description}</b>`;
      await ctx.replyWithPhoto(publicImgUrl,
          {
            caption,
            parse_mode: "html",
            reply_markup: {
              inline_keyboard: inlineKeyboardArray,
            },
          });
    } else {
      startHandler(ctx);
    }
  } else {
    startHandler(ctx);
  }
});
// rzk shop
bot.command("objects", async (ctx) => {
  startHandler(ctx);
});
// monobank
bot.command("mono", async (ctx) => {
  // ctx.scene.enter("monoScene");
  monoHandler(ctx);
});
// Upload scene
// bot.command("upload", (ctx) => {
// await ctx.state.cart.setSessionData({scene: "upload"});
// ctx.session.scene = "upload";
// ctx.reply("Вставьте ссылку Google Sheet", {
// reply_markup: {
// keyboard: [["Отмена"]],
// resize_keyboard: true,
// }});
// session.scene = "upload";
// ctx.scene.enter("upload");
// });
// Catalog scene
// bot.command("catalog", async (ctx) => ctx.scene.enter("catalog"));

// if session destroyed show main keyboard
bot.on(["text", "contact"], async (ctx) => {
  // const session = await ctx.state.cart.getSessionData();
  // const sessionFire = await ctx.state.cart.getSessionData();
  const sessionFire = await store.findRecord(`users/${ctx.from.id}`, "session");
  if (ctx.message.text === "Отмена") {
    ctx.reply("Для продолжения нажмите /objects", {
      reply_markup: {
        remove_keyboard: true,
      }});
    // await ctx.state.cart.setSessionData({scene: null});
    await store.createRecord(`users/${ctx.from.id}`, {"session": {"scene": null}});
    ctx.session.scene = null;
    return;
  }
  // if (ctx.session.scene === "upload") {
  //   await uploadHandler(ctx);
  //   return;
  // }
  if (sessionFire.scene === "wizardOrder") {
    await cartWizard[sessionFire.cursor](ctx);
    return;
  }
  if (ctx.session.scene === "editOrder") {
    await orderWizard[ctx.session.cursor](ctx);
    return;
  }
  // startHandler(ctx);
});

bot.on("photo", (ctx) => {
  if (ctx.session.scene === "uploadPhotoProduct") {
    uploadPhotoProduct(ctx);
  }
  if (ctx.session.scene === "uploadPhotoCat") {
    uploadPhotoCat(ctx);
  }
});
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
