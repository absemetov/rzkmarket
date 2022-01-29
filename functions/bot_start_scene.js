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
  if (url) {
    const photoProjectExists = await bucket.file(url).exists();
    if (photoProjectExists[0]) {
      return bucket.file(url).publicUrl();
    }
  }
  return bucket.file(botConfig.logo).publicUrl();
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
  inlineKeyboardArray.push([{text: `Войти на сайт ${botConfig.site}`, login_url: {
    url: `https://${botConfig.site}/login`,
    request_write_access: true,
  }}]);
  // add main photo
  const projectImg = await photoCheckUrl();
  await ctx.replyWithPhoto(projectImg,
      {
        caption: "<b>Выберите склад</b>",
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
    let caption = "<b>Выберите склад</b>";
    const inlineKeyboardArray = [];
    let imgUrl = null;
    if (objectId) {
      // get data obj
      const object = await store.findRecord(`objects/${objectId}`);
      caption = `<b>${object.name}\n` +
        `Контакты: ${object.phoneArray.join()}\n` +
        `Адрес: ${object.address}\n` +
        `Описание: ${object.description}</b>\n`;
      const cartButtons = await cart.cartButtons(objectId, ctx.from.id);
      inlineKeyboardArray.push([{text: "📁 Каталог", callback_data: `c?o=${object.id}`}]);
      inlineKeyboardArray.push([cartButtons[1]]);
      if (ctx.state.isAdmin) {
        inlineKeyboardArray.push([{text: `🧾 Заказы ${object.name}`, callback_data: `orders?o=${object.id}`}]);
        inlineKeyboardArray.push([{text: "Обновить данные", callback_data: `upload/${object.id}?todo=updateObject`}]);
        inlineKeyboardArray.push([{text: "Загрузить товары",
          callback_data: `upload/${object.id}?todo=uploadProducts`}]);
        inlineKeyboardArray.push([{text: "📸 Загрузить фото каталогов",
          callback_data: `c?o=${object.id}&u=1`}]);
        inlineKeyboardArray.push([{text: "📸 Загрузить фото объекта",
          callback_data: `uploadPhotoObj/${object.id}`}]);
        caption += `<b>Курсы валют: USD = ${object.USD}${botConfig.currency}, ` +
        `EUR = ${object.EUR}${botConfig.currency}</b>\n`;
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
      inlineKeyboardArray.push([{text: `Войти на сайт ${botConfig.site}`, login_url: {
        url: `https://${botConfig.site}/login`,
        request_write_access: true,
      }}]);
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
    const telegramPhotos = ctx.message.photo;
    if (telegramPhotos.length < 3) {
      await ctx.reply("Choose large photo!");
      return;
    }
    // first delete old photos
    if (object.logo) {
      await bucket.deleteFiles({
        prefix: `photos/${objectId}/logo`,
      });
    }
    const fileUniqueId = telegramPhotos[2].file_unique_id;
    // loop photos
    for (const [index, photo] of telegramPhotos.entries()) {
      // use only 2 zoom level
      if (index === 2) {
        const photoUrl = await ctx.telegram.getFileLink(photo.file_id);
        try {
          // download photos from telegram server
          const photoPath = await download(photoUrl.href);
          await bucket.upload(photoPath, {
            destination: `photos/${objectId}/logo/${index}/${fileUniqueId}.jpg`,
          });
          // delete download file
          fs.unlinkSync(photoPath);
        } catch (e) {
          console.log("Download failed");
          console.log(e.message);
          await ctx.reply(`Error upload photos ${e.message}`);
        }
      }
    }
    // save fileID to Firestore
    await store.updateRecord(`objects/${objectId}`, {
      logo: fileUniqueId,
    });
    // get catalog url (path)
    const catalogUrl = `objects/${objectId}`;
    const url = await photoCheckUrl(`photos/${objectId}/logo/1/${fileUniqueId}.jpg`);
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
