const firebase = require("firebase-admin");
const download = require("./download.js");
const fs = require("fs");
const bucket = firebase.storage().bucket();
// make bucket is public
// await bucket.makePublic();
const {Markup, Scenes: {BaseScene}} = require("telegraf");
// const {getMainKeyboard} = require("./bot_keyboards.js");
const catalog = new BaseScene("catalog");
catalog.use(async (ctx, next) => {
  if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
    console.log("another callbackQuery happened", ctx.callbackQuery.data.length, ctx.callbackQuery.data);
  }
  return next();
});
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

// Show Catalogs and goods
catalog.action(/^c\/([a-zA-Z0-9-_]+)?\??([a-zA-Z0-9-_=&]+)?/, async (ctx) => {
  const inlineKeyboardArray =[];
  let currentCatalog = {};
  let textMessage = "RZK Market Catalog";
  const catalogId = ctx.match[1];
  // parse url params
  const params = new Map();
  if (ctx.match[2]) {
    for (const paramsData of ctx.match[2].split("&")) {
      params.set(paramsData.split("=")[0], paramsData.split("=")[1]);
    }
  }
  // set currentCatalog data
  if (catalogId) {
    const currentCatalogSnapshot = await firebase.firestore().collection("catalogs").doc(catalogId).get();
    currentCatalog = {id: currentCatalogSnapshot.id, ...currentCatalogSnapshot.data()};
  }
  // Get catalogs
  const catalogsSnapshot = await firebase.firestore().collection("catalogs")
      .where("parentId", "==", currentCatalog.id ? currentCatalog.id : null).orderBy("orderNumber").get();
  catalogsSnapshot.docs.forEach((doc) => {
    inlineKeyboardArray.push(Markup.button.callback("Catalog: " + doc.data().name, `c/${doc.id}`));
  });
  // Show catalog siblings
  if (currentCatalog.id) {
    textMessage = `RZK Market Catalog *${currentCatalog.name}*`;
    // Add tags button
    if (currentCatalog.tags) {
      inlineKeyboardArray.push(Markup.button.callback(`Tags: ${currentCatalog.name}`,
          `t/${currentCatalog.id}?tagSelected=${params.get("tag")}`));
    }
    // Products query
    let mainQuery = firebase.firestore().collection("products").where("catalog.id", "==", currentCatalog.id)
        .orderBy("orderNumber");
    let query = "";
    // Filter by tag
    console.log(params.get("tag"));
    if (params.get("tag") && params.get("tag") !== "undefined") {
      textMessage += `\nTag: *${params.get("tag")}*`;
      mainQuery = mainQuery.where("tags", "array-contains", params.get("tag"));
    }
    // Paginate goods
    // copy main query
    query = mainQuery;
    if (params.get("startAfter")) {
      const startAfterProduct = await firebase.firestore().collection("products").doc(params.get("startAfter")).get();
      query = query.startAfter(startAfterProduct);
    }
    // prev button
    if (params.get("endBefore")) {
      const endBeforeProduct = await firebase.firestore().collection("products").doc(params.get("endBefore")).get();
      query = query.endBefore(endBeforeProduct).limitToLast(10);
    } else {
      query = query.limit(10);
    }
    // get Products
    const productsSnapshot = await query.get();
    // generate products array, add callback path
    for (const product of productsSnapshot.docs) {
      inlineKeyboardArray.push(Markup.button.callback(`Product: ${product.data().name} (${product.id})`,
          `p/${product.id}/${ctx.callbackQuery.data}`));
    }
    // Set load more button
    // ====
    if (!productsSnapshot.empty) {
      // startAfter
      const startAfter = productsSnapshot.docs[productsSnapshot.docs.length - 1];
      const ifAfterProducts = await mainQuery.startAfter(startAfter).limit(1).get();
      if (!ifAfterProducts.empty) {
        inlineKeyboardArray.push(Markup.button.callback(`Load more ... startAfter=${startAfter.id}`,
            `c/${currentCatalog.id}?startAfter=${startAfter.id}&tag=${params.get("tag")}`));
      }
      // endBefore prev button
      const endBefore = productsSnapshot.docs[0];
      const ifBeforeProducts = await mainQuery.endBefore(endBefore).limitToLast(1).get();
      if (!ifBeforeProducts.empty) {
        inlineKeyboardArray.push(Markup.button.callback(`endBefore=${endBefore.id}`,
            `c/${currentCatalog.id}?endBefore=${endBefore.id}&tag=${params.get("tag")}`));
      }
    }
    // =====
    // add back button
    inlineKeyboardArray.push(Markup.button.callback("Back",
      currentCatalog.parentId ? `c/${currentCatalog.parentId}` : "c/"));
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
  await ctx.answerCbQuery();
});

// show product
// eslint-disable-next-line no-useless-escape
catalog.action(/^p\/([a-zA-Z0-9-_]+)\/?([a-zA-Z0-9-_=&\/?]+)?/, async (ctx) => {
  // parse url params
  const path = ctx.match[2];
  // generate array
  const inlineKeyboardArray = [];
  const productSnapshot = await firebase.firestore().collection("products").doc(ctx.match[1]).get();
  const product = {id: productSnapshot.id, ...productSnapshot.data()};
  inlineKeyboardArray.push(Markup.button.callback("Upload photo", `uploadPhotos/${product.id}`));
  // chck photos
  if (product.photos && product.photos.length) {
    inlineKeyboardArray.push(Markup.button.callback("Show photos", `showPhotos/${product.id}`));
  }
  inlineKeyboardArray.push(Markup.button.callback("Back", path));
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
  await ctx.answerCbQuery();
});

// Tags
catalog.action(/^t\/([a-zA-Z0-9-_]+)\??([a-zA-Z0-9-_=&]+)?/, async (ctx) => {
  const inlineKeyboardArray = [];
  const catalogId = ctx.match[1];
  // parse url params
  const params = new Map();
  if (ctx.match[2]) {
    for (const paramsData of ctx.match[2].split("&")) {
      params.set(paramsData.split("=")[0], paramsData.split("=")[1]);
    }
  }
  const currentCatalogSnapshot = await firebase.firestore().collection("catalogs").doc(catalogId).get();
  const catalog = {id: currentCatalogSnapshot.id, ...currentCatalogSnapshot.data()};
  for (const tag of catalog.tags) {
    if (tag.id === params.get("tagSelected")) {
      inlineKeyboardArray.push(Markup.button.callback(`Tag selected: ${tag.name}`, `c/${catalog.id}?tag=${tag.id}`));
    } else {
      inlineKeyboardArray.push(Markup.button.callback(`Tag: ${tag.name}`, `c/${catalog.id}?tag=${tag.id}`));
    }
  }
  // Delete selected tag
  inlineKeyboardArray.push(Markup.button.callback("Tag delete", `c/${catalog.id}`));
  await ctx.editMessageMedia({
    type: "photo",
    media: "https://picsum.photos/200/200/?random",
    caption: `RZK Market Catalog *${catalog.name}*\nChoose Tag`,
    parse_mode: "Markdown",
  }, {...Markup.inlineKeyboard(inlineKeyboardArray,
      {wrap: (btn, index, currentRow) => {
        return index <= 20;
      }}),
  });
  await ctx.answerCbQuery();
});

// Show all photos
catalog.action(/^showPhotos\/([a-zA-Z0-9-_]+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const productId = ctx.match[1];
  const productRef = firebase.firestore().collection("products").doc(productId);
  const productSnapshot = await productRef.get();
  const product = {id: productSnapshot.id, ...productSnapshot.data()};
  for (const [index, photoId] of product.photos.entries()) {
    // check if file exists
    let publicUrl = "";
    const photoExists = await bucket.file(`photos/products/${product.id}/2/${photoId}.jpg`).exists();
    if (photoExists[0]) {
      publicUrl = bucket.file(`photos/products/${product.id}/2/${photoId}.jpg`).publicUrl();
    } else {
      publicUrl = "https://s3.eu-central-1.amazonaws.com/rzk.com.ua/250.56ad1e10bf4a01b1ff3af88752fd3412.jpg";
    }
    await ctx.replyWithPhoto({url: publicUrl}, {
      caption: product.mainPhoto === photoId ? `Photo #${index + 1} (Main Photo) ${product.name} (${product.id})` :
        `Photo #${index + 1} ${product.name} (${product.id})`,
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        Markup.button.callback("Set main", `setMainPhoto/${product.id}/${photoId}`),
        Markup.button.callback("Delete", `deletePhoto/${product.id}/${photoId}`),
      ]),
    });
  }
});

// delete Photo
catalog.action(/^deletePhoto\/([a-zA-Z0-9-_]+)\/([a-zA-Z0-9-_]+)/, async (ctx) => {
  // init storage
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

// upload photos limit 5
catalog.action(/^uploadPhotos\/([a-zA-Z0-9-_]+)/, async (ctx) => {
  ctx.session.productId = ctx.match[1];
  const productRef = firebase.firestore().collection("products").doc(ctx.session.productId);
  const productSnapshot = await productRef.get();
  const product = {id: productSnapshot.id, ...productSnapshot.data()};
  ctx.reply(`Please add photo to ${product.name} (${product.id})`);
  await ctx.answerCbQuery();
});

// Set Main photo product
catalog.action(/^setMainPhoto\/([a-zA-Z0-9-_]+)\/([a-zA-Z0-9-_]+)/, async (ctx) => {
  const productId = ctx.match[1];
  const photoId = ctx.match[2];
  const productRef = firebase.firestore().collection("products").doc(productId);
  const productSnapshot = await productRef.get();
  await productRef.update({
    mainPhoto: photoId,
  });
  // ctx.reply(`Main photo updated, productId ${productId} ${fileId}`);
  await ctx.editMessageCaption(`Main photo updated, ${productSnapshot.data().name} ${productId}`,
      {...Markup.inlineKeyboard([
        Markup.button.callback("Set main", `setMainPhoto/${productId}/${photoId}`),
        Markup.button.callback("Delete", `deletePhoto/${productId}/${photoId}`),
      ])});
  await ctx.answerCbQuery();
});

// Upload product photos
catalog.on("photo", async (ctx, next) => {
  if (ctx.session.productId) {
    // file_id: 'AgACAgIAAxkBAAJKe2Eeb3sz3VbX5NP2xB0MphISptBEAAIjtTEbNKZhSJTK4DMrPuXqAQADAgADcwADIAQ',
    // file_unique_id: 'AQADI7UxGzSmYUh4',
    // file_size: 912,
    // width: 90,
    // height: 51
    // get Product data
    const productRef = firebase.firestore().collection("products").doc(ctx.session.productId);
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
      await ctx.replyWithMarkdown(`${product.name} (${product.id}) photo uploaded`,
          Markup.inlineKeyboard([Markup.button.callback("Upload photos", `uploadPhotos/${product.id}`),
            Markup.button.callback("Show photos", `showPhotos/${product.id}`),
          ]));
    }
    ctx.session.productId = null;
  } else {
    ctx.reply("Please select a product to upload Photos go to /catalog");
  }
});

exports.catalog = catalog;
