const functions = require("firebase-functions");
const firebase = require("firebase-admin");
const bucket = firebase.storage().bucket();
const {store, cart} = require("./bot_store_cart.js");
const {download} = require("./download.js");
const fs = require("fs");
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
// check photo
const photoCheckUrl = async (url) => {
  const photoProjectExists = await bucket.file(url).exists();
  if (photoProjectExists[0]) {
    return bucket.file(url).publicUrl();
  } else {
    // default photo
    return bucket.file(botConfig.logo).publicUrl();
  }
};
// parse callback data, add Cart instance
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
// start handler show objects
const startHandler = async (ctx) => {
  const inlineKeyboardArray = [];
  // get all Objects
  const objects = await store.findAll("objects");
  objects.forEach((object) => {
    inlineKeyboardArray.push([{text: `🏪 ${object.name}`, callback_data: `objects/${object.id}`}]);
  });
  inlineKeyboardArray.push([{text: "🧾 Мои заказы", callback_data: `myO/${ctx.from.id}`}]);
  // add main photo
  const projectImg = await photoCheckUrl(botConfig.logo);
  await ctx.replyWithPhoto(projectImg,
      {
        caption: `<b>${ctx.state.bot_first_name}</b>`,
        parse_mode: "html",
        reply_markup: {
          inline_keyboard: inlineKeyboardArray,
        },
      });
};
// show objects
startActions.push(async (ctx, next) => {
  if (ctx.state.routeName === "objects") {
    const objectId = ctx.state.param;
    let caption = `<b>${ctx.state.bot_first_name}</b>`;
    const inlineKeyboardArray = [];
    let imgUrl = botConfig.logo;
    if (objectId) {
      // get data obj
      const object = await store.findRecord(`objects/${objectId}`);
      caption = `<b>${ctx.state.bot_first_name} > ${object.name}\n` +
        `Контакты: ${object.phoneNumber}\n` +
        `Адрес: ${object.address}\n` +
        `Описание: ${object.description}</b>`;
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
        imgUrl = `photos/${objectId}/logo/2/${object.logo}.jpg`;
      }
    } else {
      // show all objects
      const objects = await store.findAll("objects");
      objects.forEach((object) => {
        inlineKeyboardArray.push([{text: `🏪 ${object.name}`, callback_data: `objects/${object.id}`}]);
      });
      inlineKeyboardArray.push([{text: "🧾 Мои заказы", callback_data: `myO/${ctx.from.id}`}]);
    }
    // render data
    const media = await photoCheckUrl(imgUrl);
    await ctx.editMessageMedia({
      type: "photo",
      media,
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
// upload object photo
startActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "uploadPhotoObj") {
    const objectId = ctx.state.param;
    await store.createRecord(`users/${ctx.from.id}`, {"session": {
      "scene": "uploadPhotoObj",
      objectId,
    }});
    const object = await store.findRecord(`objects/${objectId}`);
    await ctx.replyWithHTML(`Добавьте фото <b>${object.name} (${object.id})</b>`);
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

const uploadPhotoObj = async (ctx, objectId) => {
  if (objectId) {
    const object = await store.findRecord(`objects/${objectId}`);
    if (ctx.message.media_group_id) {
      await ctx.reply("Choose only one Photo!");
      return;
    }
    // get telegram file_id photos data
    const origin = ctx.message.photo[3];
    const big = ctx.message.photo[2];
    const thumbnail = ctx.message.photo[1];
    // if 720*1280 photo[3] empty
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
    const resultsUrl = await Promise.all([
      ctx.telegram.getFileLink(origin.file_id),
      ctx.telegram.getFileLink(big.file_id),
      ctx.telegram.getFileLink(thumbnail.file_id),
    ]);
    const originUrl = resultsUrl[0];
    const bigUrl = resultsUrl[1];
    const thumbnailUrl = resultsUrl[2];
    try {
      // download photos from telegram server
      // download photos from telegram server
      const results = await Promise.all([
        download(originUrl.href),
        download(bigUrl.href),
        download(thumbnailUrl.href),
      ]);
      const originFilePath = results[0];
      const bigFilePath = results[1];
      const thumbnailFilePath = results[2];
      // upload photo file
      await Promise.all([
        bucket.upload(originFilePath, {
          destination: `photos/${objectId}/logo/3/${origin.file_unique_id}.jpg`,
        }),
        bucket.upload(bigFilePath, {
          destination: `photos/${objectId}/logo/2/${origin.file_unique_id}.jpg`,
        }),
        bucket.upload(thumbnailFilePath, {
          destination: `photos/${objectId}/logo/1/${origin.file_unique_id}.jpg`,
        }),
      ]);
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
    await store.updateRecord(`objects/${objectId}`, {
      logo: origin.file_unique_id,
    });
    // get catalog url (path)
    const catalogUrl = `objects/${objectId}`;
    const url = await photoCheckUrl(`photos/${objectId}/logo/2/${origin.file_unique_id}.jpg`);
    await ctx.replyWithPhoto({url},
        {
          caption: `${object.name} (${object.id}) photo uploaded`,
          reply_markup: {
            inline_keyboard: [
              [{text: "⤴️ Goto object",
                callback_data: catalogUrl}],
            ],
          },
        });
    await store.createRecord(`users/${ctx.from.id}`, {"session": {
      "scene": null,
      "objectId": null,
    }});
  } else {
    await ctx.reply("Please select a object to upload Photo");
  }
};

exports.startActions = startActions;
exports.startHandler = startHandler;
exports.isAdmin = isAdmin;
exports.parseUrl = parseUrl;
exports.roundNumber = roundNumber;
exports.uploadPhotoObj = uploadPhotoObj;
exports.photoCheckUrl = photoCheckUrl;
