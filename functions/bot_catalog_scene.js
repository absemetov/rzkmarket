const firebase = require("firebase-admin");
const {Markup, Scenes: {BaseScene}} = require("telegraf");
const {getMainKeyboard} = require("./bot_keyboards.js");
const catalog = new BaseScene("catalog");
// enter to scene
catalog.enter(async (ctx) => {
  const catalogsSnapshot = await firebase.firestore().collection("catalogs")
      .where("parentId", "==", null).orderBy("orderNumber").get();
  // generate catalogs array
  const catalogsArray = [];
  catalogsSnapshot.docs.forEach((doc) => {
    catalogsArray.push(Markup.button.callback(doc.data().name, `c/${doc.id}`));
  });
  // return ctx.replyWithMarkdown("RZK Market Catalog", Markup.inlineKeyboard(catalogsArray));
  // reply with photo necessary to show ptoduct
  return ctx.replyWithPhoto("https://picsum.photos/200/200/?random",
      {
        caption: "Rzk.com.ru catalog",
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard(catalogsArray),
      });
});

// catalog.leave((ctx) => {
//   ctx.reply("Menu", getMainKeyboard);
// });

catalog.hears("where", (ctx) => ctx.reply("You are in catalog scene"));

catalog.hears("back", (ctx) => {
  ctx.scene.leave();
});

// Catalog controller
catalog.action(/c\/([a-zA-Z0-9-_]+)?/, async (ctx) => {
  await ctx.answerCbQuery("Catalog loading...");
  const inlineKeyboardArray =[];
  let currentCatalog = null;
  let textMessage = "";
  let backButton = "";
  console.log(ctx.match[1]);
  if (ctx.match[1]) {
    const currentCatalogSnapshot = await firebase.firestore().collection("catalogs").doc(ctx.match[1]).get();
    currentCatalog = {id: currentCatalogSnapshot.id, ...currentCatalogSnapshot.data()};
  }
  // generate catalogs
  const catalogsSnapshot = await firebase.firestore().collection("catalogs")
      .where("parentId", "==", currentCatalog ? currentCatalog.id : null).orderBy("orderNumber").get();
  catalogsSnapshot.docs.forEach((doc) => {
    inlineKeyboardArray.push(Markup.button.callback("Catalog: " + doc.data().name, `c/${doc.id}`));
  });
  // add back button
  if (currentCatalog) {
    textMessage = `RZK Market Catalog *${currentCatalog.name}*`;
    // generate Products array
    const query = firebase.firestore().collection("products").where("catalog.id", "==", currentCatalog.id)
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
  // await ctx.editMessageText(`${textMessage}`, extraObject);
  // await ctx.editMessageCaption(`${textMessage}`, extraObject);
  await ctx.editMessageMedia({
    type: "photo",
    media: "https://picsum.photos/200/200/?random",
    caption: textMessage,
    parse_mode: "Markdown",
  }, {...Markup.inlineKeyboard(inlineKeyboardArray,
      {wrap: (btn, index, currentRow) => {
        return index <= 20;
      }}),
  });
});

// Product controller
catalog.action(/p\/([a-zA-Z0-9-_]+)/, async (ctx) => {
  // await ctx.telegram.deleteMyCommands;
  const inlineKeyboardArray = [];
  const productSnapshot = await firebase.firestore().collection("products").doc(ctx.match[1]).get();
  const product = {id: productSnapshot.id, ...productSnapshot.data()};
  inlineKeyboardArray.push(Markup.button.callback("Upload photo", `uploadPhotos/${product.id}`));
  // chck photos
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
  // await ctx.editMessageText(`${product.name} ${product.price}`, extraObject);
  await ctx.editMessageMedia({
    type: "photo",
    media: "https://storage.googleapis.com/rzk-market-ua.appspot.com/photos/products/100/1/AQAD4LYxG9TAEEl-.jpg",
    caption: product.name,
    parse_mode: "Markdown",
  }, {...Markup.inlineKeyboard(inlineKeyboardArray,
      {wrap: (btn, index, currentRow) => {
        return index <= 20;
      }}),
  });
  await ctx.answerCbQuery();
});

exports.catalog = catalog;
