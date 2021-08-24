const firebase = require("firebase-admin");
const {Markup, Scenes: {BaseScene}} = require("telegraf");
// const {getMainKeyboard} = require("./bot_keyboards.js");
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
  await ctx.answerCbQuery("");
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
      inlineKeyboardArray.push(Markup.button.callback(`Product: ${product.data().name} (${product.id})`,
          `p/${product.id}`));
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
  // const extraObject = {
  //   parse_mode: "Markdown",
  //   ...Markup.inlineKeyboard(inlineKeyboardArray,
  //       {wrap: (btn, index, currentRow) => {
  //         return index <= 20;
  //       }}),
  // };
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
  await ctx.answerCbQuery();
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
  // const extraObject = {
  //   parse_mode: "Markdown",
  //   ...Markup.inlineKeyboard(inlineKeyboardArray,
  //       {wrap: (btn, index, currentRow) => {
  //         return index <= 20;
  //       }}),
  // };
  // await ctx.editMessageText(`${product.name} ${product.price}`, extraObject);
  // Get main photo url
  let publicUrl = "";
  if (product.mainPhoto) {
    const bucket = firebase.storage().bucket();
    const photoExists = await bucket.file(`photos/products/${product.id}/2/${product.mainPhoto}.jpg`).exists();
    if (photoExists[0]) {
      publicUrl = bucket.file(`photos/products/${product.id}/2/${product.mainPhoto}.jpg`).publicUrl();
    }
  } else {
    publicUrl = "https://s3.eu-central-1.amazonaws.com/rzk.com.ua/250.56ad1e10bf4a01b1ff3af88752fd3412.jpg";
  }
  await ctx.editMessageMedia({
    type: "photo",
    media: publicUrl,
    caption: `${product.name} (${product.id})`,
    parse_mode: "Markdown",
  }, {...Markup.inlineKeyboard(inlineKeyboardArray,
      {wrap: (btn, index, currentRow) => {
        return index <= 20;
      }}),
  });
});

// Show all photos
catalog.action(/showPhotos\/([a-zA-Z0-9-_]+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const productId = ctx.match[1];
  const productRef = firebase.firestore().collection("products").doc(productId);
  const productSnapshot = await productRef.get();
  const product = {id: productSnapshot.id, ...productSnapshot.data()};
  const bucket = firebase.storage().bucket();
  for (const photoId of product.photos) {
    // check if file exists
    let publicUrl = "";
    const photoExists = await bucket.file(`photos/products/${product.id}/2/${photoId}.jpg`).exists();
    if (photoExists[0]) {
      publicUrl = bucket.file(`photos/products/${product.id}/2/${photoId}.jpg`).publicUrl();
    } else {
      publicUrl = "https://s3.eu-central-1.amazonaws.com/rzk.com.ua/250.56ad1e10bf4a01b1ff3af88752fd3412.jpg";
    }
    await ctx.replyWithPhoto({url: publicUrl}, {
      caption: product.mainPhoto === photoId ? `Main Photo ${product.name} (${product.id})` :
        `${product.name} (${product.id})`,
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        Markup.button.callback("Set main", `setMainPhoto/${product.id}/${photoId}`),
        Markup.button.callback("Delete", `deletePhoto/${product.id}/${photoId}`),
      ]),
    });
  }
});

// delete Photo
catalog.action(/deletePhoto\/([a-zA-Z0-9-_]+)\/([a-zA-Z0-9-_]+)/, async (ctx) => {
  // init storage
  const bucket = firebase.storage().bucket();
  const productId = ctx.match[1];
  const deleteFileId = ctx.match[2];
  const productRef = firebase.firestore().collection("products").doc(productId);
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
  // await bucket.deleteFiles({
  //   prefix: `photos/products/${productId}`,
  // });
  const photoExists = await bucket.file(`photos/products/${productId}/1/${deleteFileId}.jpg`).exists();
  if (photoExists[0]) {
    await bucket.file(`photos/products/${productId}/3/${deleteFileId}.jpg`).delete();
    await bucket.file(`photos/products/${productId}/2/${deleteFileId}.jpg`).delete();
    await bucket.file(`photos/products/${productId}/1/${deleteFileId}.jpg`).delete();
  }
  ctx.deleteMessage();
  await ctx.answerCbQuery();
});

exports.catalog = catalog;
