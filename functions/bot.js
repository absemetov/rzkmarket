const functions = require("firebase-functions");
const firebase = require("firebase-admin");
const {Telegraf, Markup, Scenes: {Stage}} = require("telegraf");
const firestoreSession = require("telegraf-session-firestore");
const {start} = require("./bot_start_scene");
const {mono, menuMono} = require("./bot_mono_scene");
const {upload} = require("./bot_upload_scene");
const {getMainKeyboard} = require("./bot_keyboards.js");

const {MenuMiddleware} = require("telegraf-inline-menu");

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
bot.action(/c\/?([a-zA-Z0-9-_]+)?/, async (ctx) => {
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
      backButton = Markup.button.callback("Back", "c");
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
bot.action(/p\/?([a-zA-Z0-9-_]+)?/, async (ctx) => {
  // await ctx.telegram.deleteMyCommands;
  // await ctx.telegram.setMyCommands([{"command": "cart", "description": "Cart(5)"}]);
  const inlineKeyboardArray = [];
  const productSnapshot = await firestore.collection("products").doc(ctx.match[1]).get();
  const product = {id: productSnapshot.id, ...productSnapshot.data()};
  inlineKeyboardArray.push(Markup.button.callback("Add photo" + product.name, `photo/${product.id}`));
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

// Upload photo product
bot.on("photo", async (ctx) => {
  const files = ctx.update.message.photo;
  console.log(files);
  ctx.reply("Photo");
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

// bot.start((ctx) => ctx.reply("Welcome to RZK Market Ukraine!", Markup.keyboard([
//   "sheet", "USD", "EUR", "RUB"]).resize(),
// ));

// bot.hears("hi", (ctx) => ctx.reply("Hey there", Markup.keyboard([
//   "sheet", "USD", "EUR", "RUB", "hi"]).resize(),
// ));

// in local dev true in prod undefined

// const admin = require("firebase-admin");

// const axios = require("axios");
// const cc = require("currency-codes");
// const { GoogleSpreadsheet } = require('google-spreadsheet');
// const Validator = require('validatorjs');

// const mono = require('./mono');

// // spreadsheet key is the long id in the sheets URL
// const doc = new GoogleSpreadsheet('1NdlYGQb3qUiS5D7rkouhZZ8Q7KvoJ6kTpKMtF2o5oVM');


// functions:config:set bot.token = "1359239824:AAFqbJhFQxm3kgItUKiq6tdui5j3jPc5UEw"


// bot.use(async (ctx, next_call) => {
//   const start = new Date();
//   await next_call();
//   const ms = new Date() - start;
//   console.log('Response time: %sms', ms);
//   ctx.reply(`Response time: ${ms}ms`);
//   return;
// });


//   //Test Tags
//   /* eslint-disable promise/always-return*/
//   bot.hears('tags', async (ctx) => {
//     admin.firestore().collection("products")
//       .where("tags.a1", "==", true)
//       .where("tags.c1", "==", true)
//       .where("tags.b1", "==", true)
//       .where("tags.Изделие", "==", "Выключатель")
//       .get()
//       .then((querySnapshot) => {
//           querySnapshot.forEach((doc) => {
//               // doc.data() is never undefined for query doc snapshots
//               console.log(doc.id, " => ", doc.data());
//           });
//       })
//       .catch((error) => {
//           console.log("Error getting documents: ", error);
//     });

//     return ctx.reply("Tags rzk.com.ua Smart!", Markup.keyboard([
//       'tags', 'sheet', 'USD', 'EUR', 'RUB'
//     ]).resize().extra());

//   });


//   //Test Google Sheets
//   bot.hears('sheet', async (ctx) => {
//     await doc.useServiceAccountAuth(require('./telegram-bot-4e05c-885ebd800760.json'));

//     await doc.loadInfo();// loads document properties and worksheets

//     const sheet = doc.sheetsByIndex[0]; // or use doc.sheetsById[id] or doc.sheetsByTitle[title]

//     /* eslint-disable no-await-in-loop */
//     let per_page = 100;

//     for (let i = 0; i < sheet.rowCount - 1; i += per_page) {

//       console.log(`rowCount ${sheet.rowCount - 1}, limit: ${per_page}, offset: ${i}`);

//       try {
//         const rows = await sheet.getRows({ limit: per_page, offset: i });
//         //check if empty data
//         if(rows.length === 0) {
//           break;
//         }

//         // eslint-disable-next-line no-loop-func
//         rows.forEach(async (row) => {
//           //Validate
//           let item = {
//             id: row.ID,
//             name: row.NAME,
//             price: Number(row.PRICE),
//             purchase_price: Number(row.PURCHASE_PRICE),
//             unit: row.UNIT,
//             group: row.GROUP,
//           };

//           let rules_is_item = {
//             id: 'required',
//             name: 'required',
//             price: 'required',
//           };

//           let validation_is_item = new Validator(item, rules_is_item);

//           if( validation_is_item.passes() ) {

//             let rules_check_item = {
//               id: 'alpha_dash',
//               name: 'string',
//               price: 'numeric',
//             };

//             let validation_check_item = new Validator(item, rules_check_item);

//             if (validation_check_item.passes()) {
//               console.log(item.id);
//             }

//             // await admin.firestore().doc('products/' + row.ID).update({
//             //   "name": row.NAME,
//             //   "purchase_price": Number(row.PURCHASE_PRICE),
//             //   "price": Number(row.PRICE)
//             // });
//           }
//           // ctx.replyWithHTML(`
//           //   ${index}\n
//           //   <b>${row.ID}</b>
//           //   ${row.NAME}
//           //   ${row.PURCHASE_PRICE}
//           //   ${row.PRICE}
//           // `);
//         });
//       } catch (error) {
//         console.log(error);
//         break;
//       }
//     }
//   });

//   //listen all text messages
//   bot.on('text', async (ctx) => {

//     currency = await mono.mono();

//     return ctx.replyWithMarkdown(`
//     CURRENCY: *${currency[ctx.message.text]}*
//   RATE BUY: *${currency[ctx.message.text].rateBuy}*
//   RATE SELL: *${currency[ctx.message.text].rateSell}*
//     `);

//   });
