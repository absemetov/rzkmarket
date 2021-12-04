// const {Scenes: {BaseScene}} = require("telegraf");
const functions = require("firebase-functions");
const firebase = require("firebase-admin");
const bucket = firebase.storage().bucket();
const {store, cart} = require("./bot_keyboards.js");
const download = require("./download.js");
const fs = require("fs");
// const start = new BaseScene("start");
// set default project
const botConfig = functions.config().env.bot;
const startActions = [];
// round to 2 decimals
const roundNumber = (num) => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};
// admin midleware
const isAdmin = (ctx, next) => {
  ctx.state.isAdmin = ctx.from.id === 94899148;
  return next();
};
// Parse callback data, add Cart instance
const parseUrl = (ctx, next) => {
  if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
    ctx.state.routeName = ctx.match[1];
    ctx.state.param = ctx.match[2];
    const args = ctx.match[3];
    // parse url params
    const params = new Map();
    if (args) {
      for (const paramsData of args.split("&")) {
        params.set(paramsData.split("=")[0], paramsData.split("=")[1]);
      }
    }
    ctx.state.params = params;
  }
  return next();
};

// inline keyboard
// const startKeyboard = [
//   {text: "📁 Каталог", callback_data: "c"},
//   {text: "🛒 Корзина", callback_data: "cart"},
// ];

// start handler show objects
const startHandler = async (ctx) => {
  // const cartProductsArray = await ctx.state.cart.products();
  // if (cartProductsArray.length) {
  //   startKeyboard[1].text += ` (${cartProductsArray.length})`;
  // }
  // add orders keyboard
  const inlineKeyboardArray = [];
  // adminKeyboard.push(startKeyboard);
  // ctx.reply("Выберите меню", getMainKeyboard);
  // ctx.reply("Welcome to Rzk.com.ru! Monobank rates /mono Rzk Catalog /catalog");
  // reply with photo necessary to show ptoduct
  // get all Objects
  const objects = await store.findAll("objects");
  objects.forEach((object) => {
    inlineKeyboardArray.push([{text: `🏪 ${object.name}`, callback_data: `objects/${object.id}`}]);
  });
  // if (ctx.state.isAdmin) {
  //   inlineKeyboardArray.push([{text: "🧾 Заказы", callback_data: "orders"}]);
  // } else {
  //   inlineKeyboardArray.push([{text: "🧾 Мои заказы", callback_data: `myOrders/${ctx.from.id}`}]);
  // }
  inlineKeyboardArray.push([{text: "🧾 Мои заказы", callback_data: `myO/${ctx.from.id}`}]);
  // add main photo
  // await bucket.makePublic();
  const publicImgUrl = bucket.file(botConfig.logo).publicUrl();
  await ctx.replyWithPhoto(publicImgUrl,
      {
        caption: `<b>${ctx.state.bot_first_name}</b>`,
        parse_mode: "html",
        reply_markup: {
          inline_keyboard: inlineKeyboardArray,
        },
      });
  // set commands
  // await ctx.telegram.setMyCommands([
  //   {"command": "objects", "description": `${ctx.state.bot_first_name} объекты`},
  //   {"command": "mono", "description": "Monobank exchange rates "},
  // ]);
  // ctx.scene.enter("catalog");
};
// main route
// startActions.push(async (ctx, next) => {
//   if (ctx.state.routeName === "start") {
//     // add orders keyboard
//     // add orders keyboard
//     const adminKeyboard = [];
//     adminKeyboard.push(startKeyboard);
//     if (ctx.state.isAdmin) {
//       adminKeyboard.push([{text: "🧾 Заказы", callback_data: "orders"}]);
//     } else {
//       adminKeyboard.push([{text: "🧾 Мои заказы", callback_data: `myOrders/${ctx.from.id}`}]);
//     }
//     const cartProductsArray = await ctx.state.cart.products();
//     startKeyboard[1].text = "🛒 Корзина";
//     if (cartProductsArray.length) {
//       startKeyboard[1].text += ` (${cartProductsArray.length})`;
//     }
//     await ctx.editMessageMedia({
//       type: "photo",
//       media: "https://picsum.photos/450/150/?random",
//       caption: `<b>${ctx.state.bot_first_name}</b>`,
//       parse_mode: "html",
//     }, {
//       reply_markup: {
//         inline_keyboard: adminKeyboard,
//       },
//     });
//     await ctx.answerCbQuery();
//   } else {
//     return next();
//   }
// });

// show objects
startActions.push(async (ctx, next) => {
  if (ctx.state.routeName === "objects") {
    const objectId = ctx.state.param;
    let caption = `<b>${ctx.state.bot_first_name}</b>`;
    const inlineKeyboardArray = [];
    let publicImgUrl = bucket.file(botConfig.logo).publicUrl();
    if (objectId) {
      // get data obj
      // const objectSnap = await firebase.firestore().collection("objects").doc(objectId).get();
      // const object = {"id": objectSnap.id, ...objectSnap.data()};
      const object = await store.findRecord(`objects/${objectId}`);
      // show object info
      caption = `<b>${ctx.state.bot_first_name} > ${object.name}\n` +
        `Контакты: ${object.phoneNumber}\n` +
        `Адрес: ${object.address}\n` +
        `Описание: ${object.description}</b>`;
      // const dateTimestamp = Math.floor(Date.now() / 1000);
      // buttons
      const cartButtons = await cart.cartButtons(objectId, ctx.from.id);
      inlineKeyboardArray.push([{text: "📁 Каталог", callback_data: `c?o=${object.id}`}]);
      inlineKeyboardArray.push([cartButtons[1]]);
      if (ctx.state.isAdmin) {
        inlineKeyboardArray.push([{text: "🧾 Заказы admin", callback_data: `orders?o=${object.id}`}]);
        inlineKeyboardArray.push([{text: "📸 Загрузить фото каталогов",
          callback_data: `c?o=${object.id}&u=1`}]);
        inlineKeyboardArray.push([{text: "📸 Загрузить фото объекта",
          callback_data: `uploadPhotoObj/${object.id}`}]);
        inlineKeyboardArray.push([{text: "➕ Загрузить товары",
          callback_data: `uploadGoods/${object.id}`}]);
      }
      inlineKeyboardArray.push([{text: "🏠 Главная", callback_data: "objects"}]);
      // set logo obj
      if (object.logo) {
        publicImgUrl = bucket.file(`photos/${objectId}/logo/2/${object.logo}.jpg`).publicUrl();
      }
    } else {
      // show all objects
      // const objects = await ctx.state.cart.objects();
      const objects = await store.findAll("objects");
      objects.forEach((object) => {
        inlineKeyboardArray.push([{text: `🏪 ${object.name}`, callback_data: `objects/${object.id}`}]);
      });
      inlineKeyboardArray.push([{text: "🧾 Мои заказы", callback_data: `myO/${ctx.from.id}`}]);
    }
    // render data
    await ctx.editMessageMedia({
      type: "photo",
      media: publicImgUrl,
      caption,
      parse_mode: "html",
    }, {
      reply_markup: {
        inline_keyboard: inlineKeyboardArray,
      },
    });
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

startActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "uploadPhotoObj") {
    // save productId to session data
    // await ctx.state.cart.setSessionData({productId: ctx.state.param});
    // const objectId = ctx.state.params.get("o");
    const objectId = ctx.state.param;
    // ctx.session.catalogId = catalogId;
    // ctx.session.objectId = objectId;
    // ctx.session.scene = "uploadPhotoObj";
    await store.createRecord(`users/${ctx.from.id}`, {"session": {
      "scene": "uploadPhotoObj",
      objectId,
    }});
    // enter catalog scene
    // if (ctx.scene.current) {
    //   if (ctx.scene.current.id !== "catalog") {
    //     ctx.scene.enter("catalog");
    //   }
    // } else {
    //   ctx.scene.enter("catalog");
    // }
    // const productRef = firebase.firestore().collection("objects").doc(objectId)
    //     .collection("products").doc(ctx.state.param);
    // const productSnapshot = await productRef.get();
    // const product = {id: productSnapshot.id, ...productSnapshot.data()};
    const object = await store.findRecord(`objects/${objectId}`);
    ctx.replyWithHTML(`Добавьте фото <b>${object.name} (${object.id})</b>`);
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// upload catalog photo
const uploadPhotoObj = async (ctx, objectId) => {
  // const session = await ctx.state.cart.getSessionData();
  // const catalogId = ctx.session.catalogId;
  // const objectId = ctx.session.objectId;
  if (objectId) {
    // make bucket is public
    // await bucket.makePublic();
    const object = await store.findRecord(`objects/${objectId}`);
    // upload Photo
    // upload only one photo!!!
    if (ctx.message.media_group_id) {
      await ctx.reply("Choose only one Photo!");
      return;
    }
    // get telegram file_id photos data
    const origin = ctx.message.photo[3];
    const big = ctx.message.photo[2];
    const thumbnail = ctx.message.photo[1];
    // If 720*1280 photo[3] empty
    if (!origin) {
      await ctx.reply("Choose large photo!");
      return;
    }
    // delete old photos
    if (object.logo) {
      await bucket.deleteFiles({
        prefix: `photos/${objectId}/logo`,
      });
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
        destination: `photos/${objectId}/logo/3/${origin.file_unique_id}.jpg`,
      });
      await bucket.upload(bigFilePath, {
        destination: `photos/${objectId}/logo/2/${origin.file_unique_id}.jpg`,
      });
      await bucket.upload(thumbnailFilePath, {
        destination: `photos/${objectId}/logo/1/${origin.file_unique_id}.jpg`,
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
    // await catalog.update({
    //   photo: firebase.firestore.FieldValue.arrayUnion(origin.file_unique_id),
    // });
    await store.updateRecord(`objects/${objectId}`, {
      logo: origin.file_unique_id,
    });
    const publicUrl = bucket.file(`photos/${objectId}/logo/2/${origin.file_unique_id}.jpg`)
        .publicUrl();
    // get catalog url (path)
    const catalogUrl = `objects/${objectId}`;
    await ctx.replyWithPhoto({url: publicUrl},
        {
          caption: `${object.name} (${object.id}) photo uploaded`,
          reply_markup: {
            inline_keyboard: [
              [{text: "⤴️ Goto object",
                callback_data: catalogUrl}],
            ],
          },
        });
    // ctx.session.productId = null;
    // await ctx.state.cart.setSessionData({productId: null});
    // ctx.session.catalogId = null;
    // ctx.session.objectId = null;
    // ctx.session.scene = null;
    await store.createRecord(`users/${ctx.from.id}`, {"session": {
      "scene": null,
      "objectId": null,
    }});
  } else {
    ctx.reply("Please select a product to upload Photo");
  }
};

exports.startActions = startActions;
exports.startHandler = startHandler;
exports.isAdmin = isAdmin;
exports.parseUrl = parseUrl;
exports.roundNumber = roundNumber;
exports.uploadPhotoObj = uploadPhotoObj;
