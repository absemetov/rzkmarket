const functions = require("firebase-functions");
const {Telegraf} = require("telegraf");
const {startActions, startHandler, parseUrl, isAdmin} = require("./bot_start_scene");
const {monoHandler, monoActions} = require("./bot_mono_scene");
const {esp32Handler, esp32Actions} = require("./bot_esp32_scene");
const {uploadActions, uploadForm, changeProduct, changeCatalog, changeCartProductPrice} = require("./bot_upload_scene");
const {ordersActions, orderWizard} = require("./bot_orders_scene");
const {catalogsActions, cartWizard} = require("./bot_catalog_scene");
const {store, uploadPhotoObj, uploadPhotoProduct, uploadPhotoCat, uploadBanner, changeBanner} = require("./bot_store_cart");
const {searchFormProduct, searchProductHandle, searchProductAction, searchOrderHandle, searchOrderAction} = require("./bot_search");
const {URL} = require("url");
const bot = new Telegraf(process.env.BOT_TOKEN);
// midleware admin
bot.use(isAdmin);
// session msg
bot.use(async (ctx, next) => {
  let urlMsq;
  if (ctx.callbackQuery) {
    // console.log(ctx.callbackQuery.message.caption && ctx.callbackQuery.message.caption.length);
    // console.log("=============callbackQuery happened", ctx.callbackQuery.data.length, ctx.callbackQuery.data);
    // test msg session parse hidden url
    urlMsq = ctx.callbackQuery.message.caption_entities && ctx.callbackQuery.message.caption_entities.at(-1).url;
    if (!urlMsq) {
      urlMsq = ctx.callbackQuery.message.entities && ctx.callbackQuery.message.entities.at(-1).url;
    }
  } else {
    // change ctx if edited
    const msg = ctx.message || ctx.editedMessage;
    // console.log(msg.reply_to_message.reply_markup.inline_keyboard);
    urlMsq = msg && msg.reply_to_message && msg.reply_to_message.entities && msg.reply_to_message.entities.at(-1).url;
  }
  const url = new URL(urlMsq ? urlMsq : "http://t.me");
  // rnd error message is not modified not show
  const rnd = Math.random().toFixed(4).substring(2);
  url.searchParams.set("rnd", rnd);
  // check TTL
  if (url.searchParams.get("TTL") == 0) {
    url.searchParams.delete("sQty");
    url.searchParams.delete("sId");
    url.searchParams.delete("sObjectId");
    url.searchParams.delete("cRowN");
    url.searchParams.delete("ePrice");
    url.searchParams.delete("ePurchase");
    url.searchParams.delete("eCurrency");
    url.searchParams.delete("search_text");
    url.searchParams.delete("page");
    url.searchParams.delete("productAddedQty");
    url.searchParams.delete("productAddedId");
    url.searchParams.delete("productAddedObjectId");
    url.searchParams.delete("tag");
    url.searchParams.delete("pName");
    url.searchParams.delete("pPrice");
    url.searchParams.delete("pUnit");
    url.searchParams.delete("pCart");
    url.searchParams.delete("TTL");
  }
  if (url.searchParams.get("TTL") == 1) {
    url.searchParams.set("TTL", 0);
  }
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
bot.on("callback_query",
    parseUrl, ...startActions, ...catalogsActions, ...ordersActions, ...monoActions, ...uploadActions, searchProductAction, searchOrderAction, ...esp32Actions);
// start bot
bot.start(async (ctx) => {
  await startHandler(ctx);
  // save user data
  await store.createRecord(`users/${ctx.from.id}`, {
    from: {...ctx.from},
    createdAt: Math.floor(Date.now() / 1000),
  });
  // }
});
// light control
bot.command("light", async (ctx) => {
  await esp32Handler(ctx);
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
    await cartWizard[cursor](ctx, ctx.message.contact.phone_number);
    return;
  }
});
// check session vars
bot.on(["text", "edited_message"], async (ctx) => {
  // create object parce url
  const scene = ctx.state.sessionMsg.url.searchParams.get("scene");
  const message = ctx.message || ctx.editedMessage;
  const sheetUrl = ctx.state.isAdmin && message.text && message.text.match(/d\/(.*)\//);
  if (sheetUrl) {
    await uploadForm(ctx, sheetUrl[1]);
    return;
  }
  // delete banner
  if (scene === "delete-main-banner") {
    await changeBanner(ctx, message.text, scene);
    return;
  }
  // edit banner url
  if (scene === "setUrl-main-banner") {
    await changeBanner(ctx, message.text, scene);
    return;
  }
  // change name and price
  if (scene === "changeProduct") {
    await changeProduct(ctx, message.text);
    return;
  }
  // change price in cart
  if (scene === "changeCartProductPrice") {
    await changeCartProductPrice(ctx, message.text);
    return;
  }

  // edit catalog desc
  if (scene === "upload-desc") {
    await changeCatalog(ctx, message.text);
    return;
  }
  // edit catalog postId
  if (scene === "upload-postId") {
    await changeCatalog(ctx, message.text);
    return;
  }
  // algolia search test
  if (scene === "search") {
    ctx.state.sessionMsg.url.searchParams.set("search_text", message.text);
    ctx.state.sessionMsg.url.searchParams.set("TTL", 1);
    await searchProductHandle(ctx);
    return;
  }
  // search orders
  if (scene === "searchOrder") {
    ctx.state.sessionMsg.url.searchParams.set("search_order_text", message.text);
    await searchOrderHandle(ctx);
    return;
  }
  // edit order wizard
  if (scene === "editOrder") {
    const cursor = ctx.state.sessionMsg.url.searchParams.get("cursor");
    await orderWizard[cursor](ctx, message.text);
    return;
  }
  // wizard create order
  if (scene === "wizardOrder") {
    const cursor = ctx.state.sessionMsg.url.searchParams.get("cursor");
    await cartWizard[cursor](ctx, message.text);
    return;
  }
  if (message.text === "Отмена") {
    await ctx.reply("Для продолжения нажмите /objects", {
      reply_markup: {
        remove_keyboard: true,
      }});
    return;
  }
  await ctx.reply("Commands /objects /search");
});
// upload photos
bot.on("photo", async (ctx) => {
  // const sessionFire = await store.findRecord(`users/${ctx.from.id}`, "session");
  const scene = ctx.state.sessionMsg.url.searchParams.get("scene");
  const objectId = ctx.state.sessionMsg.url.searchParams.get("oId");
  const productId = ctx.state.sessionMsg.url.searchParams.get("upload-productId");
  const catalogId = ctx.state.sessionMsg.url.searchParams.get("upload-catalogId");

  if (scene === "upload-prod") {
    await ctx.reply("uploadPhotoProduct start");
    await uploadPhotoProduct(ctx, objectId, productId);
    ctx.state.sessionMsg.url.searchParams.delete("upload-productId");
    return;
  }
  if (scene === "upload-cat") {
    await ctx.reply("uploadPhotoCat start");
    await uploadPhotoCat(ctx, objectId, catalogId);
    ctx.state.sessionMsg.url.searchParams.delete("upload-catalogId");
    return;
  }
  if (scene === "upload-obj") {
    await ctx.reply("uploadPhotoObj start");
    await uploadPhotoObj(ctx, objectId);
    return;
  }
  if (scene === "upload-main-banner") {
    await ctx.reply("upload-main-banner start");
    await uploadBanner(ctx);
    return;
  }
  ctx.state.sessionMsg.url.searchParams.delete("scene");
  await ctx.reply("session scene is null");
});
// error handler
bot.catch((error) => {
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
