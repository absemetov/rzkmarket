const firebase = require("firebase-admin");
const download = require("./download.js");
const fs = require("fs");
const bucket = firebase.storage().bucket();
// make bucket is public
// await bucket.makePublic();
const {Scenes: {BaseScene}} = require("telegraf");
// const {getMainKeyboard} = require("./bot_keyboards.js");
const catalogScene = new BaseScene("catalog");
catalogScene.use(async (ctx, next) => {
  if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
    console.log("Catalog scene another callbackQuery happened", ctx.callbackQuery.data.length, ctx.callbackQuery.data);
  }
  return next();
});
// enter to scene
// catalog.enter(async (ctx) => {
//   const catalogsSnapshot = await firebase.firestore().collection("catalogs")
//       .where("parentId", "==", null).orderBy("orderNumber").get();
//   // generate catalogs array
//   const catalogsArray = [];
//   catalogsSnapshot.docs.forEach((doc) => {
//     catalogsArray.push(Markup.button.callback(`🗂 ${doc.data().name}`, `c/${doc.id}`));
//   });
//   // return ctx.replyWithMarkdown("RZK Market Catalog", Markup.inlineKeyboard(catalogsArray));
//   // reply with photo necessary to show ptoduct
//   return ctx.replyWithPhoto("https://picsum.photos/450/150/?random",
//       {
//         caption: "Rzk Market Catalog 🇺🇦",
//         parse_mode: "Markdown",
//         ...Markup.inlineKeyboard(catalogsArray),
//       });
// });

// catalog.leave((ctx) => {
//   ctx.reply("Menu", getMainKeyboard);
// });

catalogScene.hears("where", (ctx) => ctx.reply("You are in catalog scene"));

catalogScene.hears("back", (ctx) => {
  ctx.scene.leave();
});

// test actions array
const catalogsActions = [];

// Show Catalogs and goods
catalogsActions.push(async (ctx, next) => {
  if (ctx.state.routeName === "c") {
    const catalogId = ctx.state.param;
    const tag = ctx.state.params.get("t");
    const startAfter = ctx.state.params.get("s");
    const endBefore = ctx.state.params.get("e");
    const inlineKeyboardArray =[];
    let currentCatalog = {};
    let textMessage = "RZK Market Catalog 🇺🇦";
    // set currentCatalog data
    if (catalogId) {
      const currentCatalogSnapshot = await firebase.firestore().collection("catalogs").doc(catalogId).get();
      currentCatalog = {id: currentCatalogSnapshot.id, ...currentCatalogSnapshot.data()};
    }
    // Get catalogs
    const catalogsSnapshot = await firebase.firestore().collection("catalogs")
        .where("parentId", "==", currentCatalog.id ? currentCatalog.id : null).orderBy("orderNumber").get();
    catalogsSnapshot.docs.forEach((doc) => {
      // inlineKeyboardArray.push(Markup.button.callback(`🗂 ${doc.data().name}`, `c/${doc.id}`));
      inlineKeyboardArray.push([{text: `🗂 ${doc.data().name}`, callback_data: `c/${doc.id}`}]);
    });
    // Show catalog siblings
    if (currentCatalog.id) {
      textMessage += `\n*${currentCatalog.name}*`;
      // Products query
      let mainQuery = firebase.firestore().collection("products").where("catalog.id", "==", currentCatalog.id)
          .orderBy("orderNumber");
      let query = "";
      // Filter by tag
      let tagUrl = "";
      if (tag) {
        mainQuery = mainQuery.where("tags", "array-contains", tag);
        tagUrl = `&t=${tag}`;
      }
      // Add tags button
      if (currentCatalog.tags) {
        const tagsArray = [];
        // inlineKeyboardArray.push(Markup.button.callback(`📌 Tags ${selectedTag}`,
        //    `t/${currentCatalog.id}?tagSelected=${params.get("tag")}`));
        tagsArray.push({text: "📌 Tags",
          callback_data: `t/${currentCatalog.id}?tagSelected=${tag}`});
        // Delete or close selected tag
        if (tag) {
          tagsArray.push({text: `❎ Del ${tag}`, callback_data: `c/${currentCatalog.id}`});
        }
        inlineKeyboardArray.push(tagsArray);
      }
      // Paginate goods
      // copy main query
      query = mainQuery;
      if (startAfter) {
        const startAfterProduct = await firebase.firestore().collection("products")
            .doc(startAfter).get();
        query = query.startAfter(startAfterProduct);
      }
      // prev button
      if (endBefore) {
        const endBeforeProduct = await firebase.firestore().collection("products")
            .doc(endBefore).get();
        query = query.endBefore(endBeforeProduct).limitToLast(10);
      } else {
        query = query.limit(10);
      }
      // get Products
      const productsSnapshot = await query.get();
      // generate products array
      // save path to session
      ctx.session.path = ctx.callbackQuery.data;
      for (const product of productsSnapshot.docs) {
        // inlineKeyboardArray.push(Markup.button.callback(`📦 ${product.data().name} (${product.id})`,
        //    `p/${product.id}/${ctx.callbackQuery.data}`));
        // Get cart
        const addButton = {text: `📦 ${product.data().name} (${product.id})`, callback_data: `p/${product.id}`};
        const sessionUser = await firebase.firestore().collection("sessions").doc(`${ctx.from.id}`).get();
        if (sessionUser.exists) {
          const cartProduct = sessionUser.data().cart && sessionUser.data().cart[product.id];
          if (cartProduct) {
            addButton.text = `📦 ${product.data().name} (${product.id}) added ${cartProduct.qty}`;
          }
        }
        inlineKeyboardArray.push([addButton]);
      }
      // Set load more button
      // ====
      if (!productsSnapshot.empty) {
        const prevNext = [];
        // endBefore prev button e paaram
        const endBeforeSnap = productsSnapshot.docs[0];
        const ifBeforeProducts = await mainQuery.endBefore(endBeforeSnap).limitToLast(1).get();
        if (!ifBeforeProducts.empty) {
          // inlineKeyboardArray.push(Markup.button.callback("⬅️ Back",
          //    `c/${currentCatalog.id}?endBefore=${endBefore.id}&tag=${params.get("tag")}`));
          prevNext.push({text: "⬅️ Back", callback_data: `c/${currentCatalog.id}?e=${endBeforeSnap.id}${tagUrl}`});
        }
        // startAfter
        const startAfterSnap = productsSnapshot.docs[productsSnapshot.docs.length - 1];
        const ifAfterProducts = await mainQuery.startAfter(startAfterSnap).limit(1).get();
        if (!ifAfterProducts.empty) {
          // startAfter iqual s
          // inlineKeyboardArray.push(Markup.button.callback("➡️ Load more",
          //    `c/${currentCatalog.id}?startAfter=${startAfter.id}&tag=${params.get("tag")}`));
          prevNext.push({text: "➡️ Load more",
            callback_data: `c/${currentCatalog.id}?s=${startAfterSnap.id}${tagUrl}`});
        }
        inlineKeyboardArray.push(prevNext);
      }
      // =====
      // add back button
      // inlineKeyboardArray.push(Markup.button.callback("⤴️ Parent catalog",
      //  currentCatalog.parentId ? `c/${currentCatalog.parentId}` : "c/"));
      inlineKeyboardArray.push([{text: "⤴️ Parent catalog",
        callback_data: currentCatalog.parentId ? `c/${currentCatalog.parentId}` : "c"}]);
    }
    // Set Main menu button
    inlineKeyboardArray.push([{text: "🏠 Go to Main menu",
      callback_data: "start"}]);
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
      media: "https://picsum.photos/450/150/?random",
      caption: textMessage,
      parse_mode: "Markdown",
    }, {reply_markup: {
      inline_keyboard: [...inlineKeyboardArray],
      // resize_keyboard: true,
    }});
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});
// show product
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "p") {
    // get product data
    const productId = ctx.state.param;
    const productSnapshot = await firebase.firestore().collection("products").doc(productId).get();
    const product = {id: productSnapshot.id, ...productSnapshot.data()};
    // Add product to cart
    let qty = ctx.state.params.get("qty");
    if (qty) {
      qty = Number(qty);
      const user = firebase.firestore().collection("sessions").doc(`${ctx.from.id}`);
      if (qty) {
        // add product to cart
        await user.set({
          cart: {
            [product.id]: {
              name: product.name,
              price: product.price,
              qty: qty,
            },
          },
        }, {merge: true});
      } else {
        // delete product from cart
        await user.set({
          cart: {
            [product.id]: firebase.firestore.FieldValue.delete(),
          },
        }, {merge: true});
      }
    }
    // generate array
    const catalogUrl = ctx.session.path;
    const inlineKeyboardArray = [];
    // inlineKeyboardArray.push(Markup.button.callback("📸 Upload photo", `uploadPhotos/${product.id}`));
    // Get cart
    const addButton = {text: "🛒 Add to cart", callback_data: `addToCart/${product.id}`};
    const sessionUser = await firebase.firestore().collection("sessions").doc(`${ctx.from.id}`).get();
    if (sessionUser.exists) {
      const cartProduct = sessionUser.data().cart && sessionUser.data().cart[product.id];
      if (cartProduct) {
        addButton.text = `Product added ${cartProduct.qty}`;
        addButton.callback_data = `addToCart/${product.id}?qty=${cartProduct.qty}`;
      }
    }
    inlineKeyboardArray.push([addButton]);
    inlineKeyboardArray.push([{text: "📸 Upload photo",
      callback_data: `uploadPhoto/${product.id}`}]);
    // chck photos
    if (product.photos && product.photos.length) {
      // inlineKeyboardArray.push(Markup.button.callback("🖼 Show photos", `showPhotos/${product.id}`));
      inlineKeyboardArray.push([{text: `🖼 Show photos (${product.photos.length})`,
        callback_data: `showPhotos/${product.id}`}]);
    }
    inlineKeyboardArray.push([{text: `⤴️ Goto ${product.catalog.name}`, callback_data: catalogUrl}]);
    // Get main photo url.
    let publicImgUrl = "";
    if (product.mainPhoto) {
      const photoExists = await bucket.file(`photos/products/${product.id}/2/${product.mainPhoto}.jpg`).exists();
      if (photoExists[0]) {
        publicImgUrl = bucket.file(`photos/products/${product.id}/2/${product.mainPhoto}.jpg`).publicUrl();
      }
    } else {
      publicImgUrl = "https://s3.eu-central-1.amazonaws.com/rzk.com.ua/250.56ad1e10bf4a01b1ff3af88752fd3412.jpg";
    }
    // Set Main menu
    inlineKeyboardArray.push([{text: "🏠 Go to Main menu",
      callback_data: "start"}]);
    await ctx.editMessageMedia({
      type: "photo",
      media: publicImgUrl,
      caption: `${product.name} (${product.id})`,
      parse_mode: "html",
    }, {reply_markup: {
      inline_keyboard: [...inlineKeyboardArray],
    }});
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// Add product to Cart by keyboard
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "addToCart") {
    let qty = ctx.state.params.get("qty");
    const number = ctx.state.params.get("number");
    const back = ctx.state.params.get("back");
    const redirect = ctx.state.params.get("r");
    const clear = ctx.state.params.get("clear");
    const productId = ctx.state.param;
    let qtyUrl = "";
    if (qty) {
      if (number) {
        qty += number;
      }
      if (back) {
        qty = qty.slice(0, -1);
      }
      if (clear) {
        qty = 0;
      }
    } else {
      // add first
      if (Number(number)) {
        qty = number;
      }
    }
    if (qty) {
      qtyUrl = `&qty=${qty}`;
    } else {
      qty = 0;
    }
    // add redirect param
    if (redirect) {
      qtyUrl += "&r=1";
    }
    const productRef = firebase.firestore().collection("products").doc(productId);
    const productSnapshot = await productRef.get();
    if (productSnapshot.exists) {
      const product = {id: productSnapshot.id, ...productSnapshot.data()};
      // ctx.reply(`Main photo updated, productId ${productId} ${fileId}`);
      const addButton = {text: `🛒 Add to cart ${qty ? qty : ""}`, callback_data: `p/${product.id}?qty=${qty}`};
      if (redirect) {
        addButton.callback_data = `cart/${product.id}?qty=${qty}`;
      }
      await ctx.editMessageCaption(`${product.name} added to cart qty: ${qty}`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {text: "7", callback_data: `addToCart/${product.id}?number=7${qtyUrl}`},
                  {text: "8", callback_data: `addToCart/${product.id}?number=8${qtyUrl}`},
                  {text: "9", callback_data: `addToCart/${product.id}?number=9${qtyUrl}`},
                ],
                [
                  {text: "4", callback_data: `addToCart/${product.id}?number=4${qtyUrl}`},
                  {text: "5", callback_data: `addToCart/${product.id}?number=5${qtyUrl}`},
                  {text: "6", callback_data: `addToCart/${product.id}?number=6${qtyUrl}`},
                ],
                [
                  {text: "1", callback_data: `addToCart/${product.id}?number=1${qtyUrl}`},
                  {text: "2", callback_data: `addToCart/${product.id}?number=2${qtyUrl}`},
                  {text: "3", callback_data: `addToCart/${product.id}?number=3${qtyUrl}`},
                ],
                [
                  {text: "0", callback_data: `addToCart/${product.id}?number=0${qtyUrl}`},
                  {text: "Back", callback_data: `addToCart/${product.id}?back=true${qtyUrl}`},
                  {text: "Clear", callback_data: `addToCart/${product.id}?clear=true${qtyUrl}`},
                ],
                [
                  addButton,
                ],
                [
                  {text: "⤴️ Goto product", callback_data: `p/${product.id}`},
                ],
              ],
            },
          });
    }
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// Show Cart
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "cart") {
    // change qty product
    let qty = ctx.state.params.get("qty");
    const productId = ctx.state.param;
    if (qty) {
      qty = Number(qty);
      const user = firebase.firestore().collection("sessions").doc(`${ctx.from.id}`);
      if (qty) {
        // add product to cart
        await user.set({
          cart: {
            [productId]: {
              qty: qty,
            },
          },
        }, {merge: true});
      } else {
        // delete product from cart
        await user.set({
          cart: {
            [productId]: firebase.firestore.FieldValue.delete(),
          },
        }, {merge: true});
      }
    }
    const inlineKeyboardArray = [];
    let msgTxt = "Cart\n";
    const sessionUser = await firebase.firestore().collection("sessions").doc(`${ctx.from.id}`).get();
    if (sessionUser.exists) {
      const cart = sessionUser.data().cart;
      if (cart) {
        for (const [id, product] of Object.entries(cart)) {
          msgTxt += `ID: ${id} Name: ${product.name} Price: ${product.price} грн. Qty: ${product.qty}шт.\n`;
          inlineKeyboardArray.push([
            {text: `🛒 Edit ${product.name} added ${product.qty}`,
              callback_data: `addToCart/${id}?qty=${product.qty}&r=1`},
          ]);
        }
      }
    }
    if (inlineKeyboardArray.length < 1) {
      inlineKeyboardArray.push([
        {text: "📁 Catalog", callback_data: "c"},
      ]);
      msgTxt += "Is empty";
    }
    // Set Main menu
    inlineKeyboardArray.push([{text: "🏠 Go to Main menu",
      callback_data: "start"}]);
    await ctx.editMessageMedia({
      type: "photo",
      media: "https://picsum.photos/450/150/?random",
      caption: msgTxt,
      parse_mode: "Markdown",
    }, {reply_markup: {
      inline_keyboard: [...inlineKeyboardArray],
    }});
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// Tags
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "t") {
    const inlineKeyboardArray = [];
    const catalogId = ctx.state.param;
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
      if (tag.id === ctx.state.params.get("tagSelected")) {
        // inlineKeyboardArray.push(Markup.button.callback(`✅ ${tag.name}`, `c/c/${catalog.id}?tag=${tag.id}`));
        inlineKeyboardArray.push([{text: `✅ ${tag.name}`, callback_data: `c/${catalog.id}?t=${tag.id}`}]);
      } else {
        // inlineKeyboardArray.push(Markup.button.callback(`📌 ${tag.name}`, `c/c/${catalog.id}?tag=${tag.id}`));
        inlineKeyboardArray.push([{text: `📌 ${tag.name}`, callback_data: `c/${catalog.id}?t=${tag.id}`}]);
      }
    }
    // close tags
    inlineKeyboardArray.push([{text: "⤴️ Goto catalog", callback_data: ctx.session.path}]);
    await ctx.editMessageMedia({
      type: "photo",
      media: "https://picsum.photos/450/150/?random",
      caption: `RZK Market Catalog 🇺🇦\n*${catalog.name}* Tags`,
      parse_mode: "Markdown",
    }, {reply_markup: {
      inline_keyboard: [...inlineKeyboardArray],
    }});
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// Show all photos
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "showPhotos") {
    const productId = ctx.state.param;
    const productRef = firebase.firestore().collection("products").doc(productId);
    const productSnapshot = await productRef.get();
    const product = {id: productSnapshot.id, ...productSnapshot.data()};
    for (const [index, photoId] of product.photos.entries()) {
      const inlineKeyboardArray = [];
      // check if file exists
      let publicUrl = "";
      const photoExists = await bucket.file(`photos/products/${product.id}/2/${photoId}.jpg`).exists();
      if (photoExists[0]) {
        publicUrl = bucket.file(`photos/products/${product.id}/2/${photoId}.jpg`).publicUrl();
      } else {
        publicUrl = "https://s3.eu-central-1.amazonaws.com/rzk.com.ua/250.56ad1e10bf4a01b1ff3af88752fd3412.jpg";
      }
      inlineKeyboardArray.push([{text: "🏷 Set main", callback_data: `setMainPhoto/${product.id}?photoId=${photoId}`}]);
      inlineKeyboardArray.push([{text: "❎ Close", callback_data: "closePhoto"}]);
      inlineKeyboardArray.push([{text: "🗑 Delete", callback_data: `deletePhoto/${product.id}?photoId=${photoId}`}]);
      await ctx.replyWithPhoto({url: publicUrl}, {
        caption: product.mainPhoto === photoId ? `✅ Photo #${index + 1} (Main Photo) ${product.name} (${product.id})` :
          `Photo #${index + 1} ${product.name} (${product.id})`,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [...inlineKeyboardArray],
        },
      });
    }
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// Set Main photo product
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "setMainPhoto") {
    const productId = ctx.state.param;
    const photoId = ctx.state.params.get("photoId");
    const productRef = firebase.firestore().collection("products").doc(productId);
    const productSnapshot = await productRef.get();
    await productRef.update({
      mainPhoto: photoId,
    });
    // ctx.reply(`Main photo updated, productId ${productId} ${fileId}`);
    await ctx.editMessageCaption(`Main photo updated, ${productSnapshot.data().name} ${productId}`,
        {
          reply_markup: {
            inline_keyboard: [
              [{text: "🏷 Set main", callback_data: `setMainPhoto/${productId}/${photoId}`}],
              [{text: "❎ Close", callback_data: "closePhoto"}],
              [{text: "🗑 Delete", callback_data: `deletePhoto/${productId}/${photoId}`}],
            ],
          },
        });
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// close Photo
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "closePhoto") {
    await ctx.deleteMessage();
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// delete Photo
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "deletePhoto") {
    const productId = ctx.state.param;
    const deleteFileId = ctx.state.params.get("photoId");
    const productRef = firebase.firestore().collection("products").doc(productId);
    const productSnapshot = await productRef.get();
    // if delete main Photo
    if (productSnapshot.data().mainPhoto === deleteFileId) {
      // set new main photo inddex 1 or delete
      if (productSnapshot.data().photos && productSnapshot.data().photos.length > 1) {
        for (const photoId of productSnapshot.data().photos) {
          if (photoId !== deleteFileId) {
            await productRef.update({
              mainPhoto: photoId,
              photos: firebase.firestore.FieldValue.arrayRemove(deleteFileId),
            });
            break;
          }
        }
      } else {
        await productRef.update({
          mainPhoto: firebase.firestore.FieldValue.delete(),
          // mainPhoto: "",
          photos: firebase.firestore.FieldValue.arrayRemove(deleteFileId),
        });
      }
    } else {
      await productRef.update({
        photos: firebase.firestore.FieldValue.arrayRemove(deleteFileId),
      });
    }
    const photoExists = await bucket.file(`photos/products/${productId}/1/${deleteFileId}.jpg`).exists();
    if (photoExists[0]) {
      await bucket.file(`photos/products/${productId}/3/${deleteFileId}.jpg`).delete();
      await bucket.file(`photos/products/${productId}/2/${deleteFileId}.jpg`).delete();
      await bucket.file(`photos/products/${productId}/1/${deleteFileId}.jpg`).delete();
    }
    await ctx.deleteMessage();
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// upload photos limit 5
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "uploadPhoto") {
    // save session data
    ctx.session.productId = ctx.state.param;
    if (ctx.scene.current) {
      if (ctx.scene.current.id !== "catalog") {
        ctx.scene.enter("catalog");
      }
    } else {
      ctx.scene.enter("catalog");
    }
    const productRef = firebase.firestore().collection("products").doc(ctx.session.productId);
    const productSnapshot = await productRef.get();
    const product = {id: productSnapshot.id, ...productSnapshot.data()};
    ctx.reply(`Please add photo to ${product.name} (${product.id})`);
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// Upload product photos
catalogScene.on("photo", async (ctx, next) => {
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
      const publicUrl = bucket.file(`photos/products/${product.id}/2/${origin.file_unique_id}.jpg`).publicUrl();
      // get catalog url (path)
      const catalogUrl = ctx.session.path;
      await ctx.replyWithPhoto({url: publicUrl},
          {
            caption: `${product.name} (${product.id}) photo uploaded`,
            reply_markup: {
              inline_keyboard: [
                [{text: "📸 Upload photo", callback_data: `uploadPhoto/${product.id}`}],
                [{text: `🖼 Show photos (${product.photos ? product.photos.length + 1 : 1})`,
                  callback_data: `showPhotos/${product.id}`}],
                [{text: "⤴️ Goto catalog",
                  callback_data: catalogUrl}],
              ],
            },
          });
    }
    ctx.session.productId = null;
  } else {
    ctx.reply("Please select a product to upload Photo");
  }
});

exports.catalogScene = catalogScene;
exports.catalogsActions = catalogsActions;