const functions = require("firebase-functions");
const firebase = require("firebase-admin");
const {Telegraf, Markup, Scenes: {Stage}} = require("telegraf");
const firestoreSession = require("telegraf-session-firestore");
const {start} = require("./bot_start_scene");
const {mono, menuMono} = require("./bot_mono_scene");
const {upload} = require("./bot_upload_scene");
const {getMainKeyboard} = require("./bot_keyboards.js");
const {MenuMiddleware} = require("telegraf-inline-menu");
const download = require("./download.js");
const fs = require("fs");

firebase.initializeApp();

const token = functions.config().bot.token;

const bot = new Telegraf(token, {
  handlerTimeout: 540000,
});

const stage = new Stage([start, mono, upload]);

const firestore = firebase.firestore();

bot.use(firestoreSession(firestore.collection("sessions")));

bot.use(stage.middleware());

bot.start((ctx) => ctx.scene.enter("start"));

bot.hears("mono", (ctx) => ctx.scene.enter("mono"));

bot.hears("upload", async (ctx) => ctx.scene.enter("upload"));

bot.hears("where", (ctx) => ctx.reply("You are in outside"));

// mono menu
const monoMiddleware = new MenuMiddleware("/", menuMono);
// console.log(menuMiddleware.tree());
bot.use(async (ctx, next) => {
  if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
    console.log("another callbackQuery happened", ctx.callbackQuery.data.length, ctx.callbackQuery.data);
  }
  return next();
});

bot.command("mono", async (ctx) => monoMiddleware.replyToContext(ctx));
bot.use(monoMiddleware.middleware());
// mono menu

// Catalog menu
bot.command("catalog", async (ctx) => {
  const catalogsSnapshot = await firestore.collection("catalogs")
      .where("parentId", "==", null).orderBy("orderNumber").get();
  // generate catalogs array
  const catalogsArray = [];
  catalogsSnapshot.docs.forEach((doc) => {
    catalogsArray.push(Markup.button.callback(doc.data().name, `c/${doc.id}`));
  });
  return ctx.replyWithMarkdown("RZK Market Catalog", Markup.inlineKeyboard(catalogsArray));
});

// Catalog controller
bot.action(/c\/([a-zA-Z0-9-_]+)?/, async (ctx) => {
  const inlineKeyboardArray =[];
  let currentCatalog = null;
  let textMessage = "";
  let backButton = "";
  console.log(ctx.match[1]);
  if (ctx.match[1]) {
    const currentCatalogSnapshot = await firestore.collection("catalogs").doc(ctx.match[1]).get();
    currentCatalog = {id: currentCatalogSnapshot.id, ...currentCatalogSnapshot.data()};
  }
  // generate catalogs
  const catalogsSnapshot = await firestore.collection("catalogs")
      .where("parentId", "==", currentCatalog ? currentCatalog.id : null).orderBy("orderNumber").get();
  catalogsSnapshot.docs.forEach((doc) => {
    inlineKeyboardArray.push(Markup.button.callback("Catalog: " + doc.data().name, `c/${doc.id}`));
  });
  // add back button
  if (currentCatalog) {
    textMessage = `RZK Market Catalog *${currentCatalog.name}*`;
    // generate Products array
    const query = firestore.collection("products").where("catalog.id", "==", currentCatalog.id)
        .orderBy("orderNumber").limit(5);
    // get query prodycts
    const productsSnapshot = await query.get();
    // generate products array
    for (const product of productsSnapshot.docs) {
      inlineKeyboardArray.push(Markup.button.callback("Product: " + product.data().name, `p/${product.id}`));
    }
    // add back button
    if (currentCatalog.parentId) {
      backButton = Markup.button.callback("Back", `c/${currentCatalog.parentId}`);
    } else {
      backButton = Markup.button.callback("Back", "c/");
    }
    inlineKeyboardArray.push(backButton);
  } else {
    textMessage = "RZK Market Catalog";
  }
  const extraObject = {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(inlineKeyboardArray,
        {wrap: (btn, index, currentRow) => {
          return index <= 20;
        }}),
  };
  await ctx.editMessageText(`${textMessage}`, extraObject);
  await ctx.answerCbQuery();
});

// Product controller
bot.action(/p\/([a-zA-Z0-9-_]+)/, async (ctx) => {
  // await ctx.telegram.deleteMyCommands;
  await ctx.telegram.setMyCommands([{"command": "mono", "description": "Monobank exchange rates "},
    {"command": "catalog", "description": "RZK Market Catalog"}]);
  const inlineKeyboardArray = [];
  const productSnapshot = await firestore.collection("products").doc(ctx.match[1]).get();
  const product = {id: productSnapshot.id, ...productSnapshot.data()};
  inlineKeyboardArray.push(Markup.button.callback("Upload photo", `uploadPhotos/${product.id}`));
  if (product.photos && product.photos.length) {
    inlineKeyboardArray.push(Markup.button.callback("Show photos", `showPhotos/${product.id}`));
  }
  inlineKeyboardArray.push(Markup.button.callback("Back", `c/${product.catalog.id}`));
  const extraObject = {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(inlineKeyboardArray,
        {wrap: (btn, index, currentRow) => {
          return index <= 20;
        }}),
  };
  await ctx.editMessageText(`${product.name} ${product.price}`, extraObject);
  await ctx.answerCbQuery();
});

// Upload Main photo product
bot.action(/showPhotos\/([a-zA-Z0-9-_]+)/, async (ctx) => {
  const productId = ctx.match[1];
  const productRef = firestore.collection("products").doc(productId);
  const productSnapshot = await productRef.get();
  const product = {id: productSnapshot.id, ...productSnapshot.data()};
  const bucket = firebase.storage().bucket();
  for (const photoId of product.photos) {
    const publicUrl = bucket.file(`photos/products/${product.id}/2/${photoId}.jpg`)
        .publicUrl();
    await ctx.replyWithPhoto({url: publicUrl}, {
      caption: product.mainPhoto === photoId ? `Main Photo ${product.name}` : `${product.name}`,
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        Markup.button.callback("Set main", `setMainPhoto/${product.id}/${photoId}`),
        Markup.button.callback("Delete", `deletePhoto/${product.id}/${photoId}`),
      ]),
    });
  }
  await ctx.answerCbQuery();
});

// Set Main photo product
bot.action(/setMainPhoto\/([a-zA-Z0-9-_]+)\/([a-zA-Z0-9-_]+)/, async (ctx) => {
  const productId = ctx.match[1];
  const fileId = ctx.match[2];
  const productRef = firestore.collection("products").doc(productId);
  await productRef.update({
    mainPhoto: fileId,
  });
  ctx.reply(`Main photo updated, productId ${productId} ${fileId}`);
  await ctx.answerCbQuery();
});

// delete Photo
bot.action(/deletePhoto\/([a-zA-Z0-9-_]+)\/([a-zA-Z0-9-_]+)/, async (ctx) => {
  // init storage
  const bucket = firebase.storage().bucket();
  const productId = ctx.match[1];
  const deleteFileId = ctx.match[2];
  const productRef = firestore.collection("products").doc(productId);
  const productSnapshot = await productRef.get();
  // if delete main Photo
  if (productSnapshot.data().mainPhoto === deleteFileId) {
    await productRef.update({
      mainPhoto: firebase.firestore.FieldValue.delete(),
      photos: firebase.firestore.FieldValue.arrayRemove(deleteFileId),
    });
  } else {
    await productRef.update({
      photos: firebase.firestore.FieldValue.arrayRemove(deleteFileId),
    });
  }
  await bucket.deleteFiles(`photos/products/${productId}/3/${deleteFileId}.jpg`);
  await bucket.deleteFiles(`photos/products/${productId}/2/${deleteFileId}.jpg`);
  await bucket.deleteFiles(`photos/products/${productId}/1/${deleteFileId}.jpg`);
  ctx.deleteMessage();
  await ctx.answerCbQuery();
});

// upload photos limit 5
bot.action(/uploadPhotos\/([a-zA-Z0-9-_]+)/, async (ctx) => {
  ctx.session.productId = ctx.match[1];
  ctx.reply(`Please add photo to productId ${ctx.session.productId}`);
  await ctx.answerCbQuery();
});

bot.on("photo", async (ctx, next) => {
  if (ctx.session.productId) {
    // file_id: 'AgACAgIAAxkBAAJKe2Eeb3sz3VbX5NP2xB0MphISptBEAAIjtTEbNKZhSJTK4DMrPuXqAQADAgADcwADIAQ',
    // file_unique_id: 'AQADI7UxGzSmYUh4',
    // file_size: 912,
    // width: 90,
    // height: 51
    // get Product data
    const productRef = firestore.collection("products").doc(ctx.session.productId);
    const productSnapshot = await productRef.get();
    const product = {id: productSnapshot.id, ...productSnapshot.data()};
    // get count photos to check limits 5 photos
    if (product.photos && product.photos.length > 4) {
      await ctx.reply("Limit 5 photos");
    } else {
      // upload Photo
      // upload only one photo!!!
      if (ctx.message.media_group_id) {
        await ctx.reply("Choose only one Photo!");
        return next();
      }
      // get telegram file_id photos data
      const origin = ctx.message.photo[3];
      const big = ctx.message.photo[2];
      const thumbnail = ctx.message.photo[1];
      // If 720*1280 photo[3] empty
      if (!origin) {
        await ctx.reply("Choose large photo!");
        return next();
      }
      // get photos url
      const originUrl = await ctx.telegram.getFileLink(origin.file_id);
      const bigUrl = await ctx.telegram.getFileLink(big.file_id);
      const thumbnailUrl = await ctx.telegram.getFileLink(thumbnail.file_id);
      // init storage
      const bucket = firebase.storage().bucket();
      // make bucket is public
      // await bucket.makePublic();
      try {
        // download photos from telegram server
        const originFilePath = await download(originUrl.href);
        const bigFilePath = await download(bigUrl.href);
        const thumbnailFilePath = await download(thumbnailUrl.href);
        // upload photo file
        await bucket.upload(originFilePath, {
          destination: `photos/products/${product.id}/3/${origin.file_unique_id}.jpg`,
        });
        await bucket.upload(bigFilePath, {
          destination: `photos/products/${product.id}/2/${origin.file_unique_id}.jpg`,
        });
        await bucket.upload(thumbnailFilePath, {
          destination: `photos/products/${product.id}/1/${origin.file_unique_id}.jpg`,
        });
        // delete download file
        fs.unlinkSync(originFilePath);
        fs.unlinkSync(bigFilePath);
        fs.unlinkSync(thumbnailFilePath);
      } catch (e) {
        console.log("Download failed");
        console.log(e.message);
        await ctx.reply(`Error upload photos ${e.message}`);
      }
      // save fileID to Firestore
      if (!product.mainPhoto) {
        await productRef.update({
          mainPhoto: origin.file_unique_id,
          photos: firebase.firestore.FieldValue.arrayUnion(origin.file_unique_id),
        });
      } else {
        await productRef.update({
          photos: firebase.firestore.FieldValue.arrayUnion(origin.file_unique_id),
        });
      }
      await ctx.replyWithMarkdown(`Photo upload to ${product.id}, upload again`,
          Markup.inlineKeyboard([Markup.button.callback("Upload photos", `uploadPhotos/${product.id}`),
            Markup.button.callback("Show photos", `showPhotos/${product.id}`),
          ]));
    }
    ctx.session.productId = null;
  } else {
    ctx.reply("Please select a product to upload Photos go to /catalog");
  }
});
// Catalog menu

// if session destroyed show main keyboard
bot.on("text", async (ctx) => ctx.reply("Menu", getMainKeyboard));

// bot.telegram.sendMessage(94899148, "Bot Rzk.com.ua ready!" );

bot.catch((err) => {
  console.log("Telegram error", err);
});

if (process.env.FUNCTIONS_EMULATOR) {
  bot.launch();
}

const runtimeOpts = {
  timeoutSeconds: 540,
  memory: "256MB",
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
