const firebase = require("firebase-admin");
const bucket = firebase.storage().bucket();
const {store, cart, photoCheckUrl, savePhotoTelegram} = require("./bot_store_cart");
const startActions = [];
const TelegrafI18n = require("telegraf-i18n");
const path = require("path");
const i18n = new TelegrafI18n({
  directory: path.resolve(__dirname, "locales"),
});
// admin midleware
const isAdmin = (ctx, next) => {
  ctx.state.isAdmin = ctx.from.id === 94899148;
  ctx.i18n = i18n.createContext(process.env.BOT_LANG);
  return next();
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
  // start deep linking parsing
  const path = ctx.message.text.match(/o_([a-zA-Z0-9-_]+)_(p|c)_([a-zA-Z0-9-_]+)/);
  // const pathCatalog = ctx.message.text.match(/o_([a-zA-Z0-9-_]+)_c_([a-zA-Z0-9-_]+)/);
  let caption = "";
  if (path) {
    const objectId = path[1];
    const objectType = path[2];
    const objectTypeId = path[3];
    const object = await store.findRecord(`objects/${objectId}`);
    // get product
    if (objectType === "p") {
      const product = await store.findRecord(`objects/${objectId}/products/${objectTypeId}`);
      if (object && product) {
        inlineKeyboardArray.push([{text: `📦 ${product.name} (${product.id})`,
          callback_data: `p/${product.id}?o=${objectId}`}]);
      }
    }
    // get catalog
    if (objectType === "c") {
      const catalog = await store.findRecord(`objects/${objectId}/catalogs/${objectTypeId}`);
      if (object && catalog) {
        inlineKeyboardArray.push([{text: `🗂 ${catalog.name}`,
          callback_data: `c/${objectTypeId}?o=${objectId}`}]);
      }
    }
    if (object) {
      caption = `<b>${object.name}\n` +
          `Контакты: ${object.phoneArray.join()}\n` +
          `Адрес: ${object.address}\n` +
          `Описание: ${object.description}</b>`;
      // default button
      if (!inlineKeyboardArray.length) {
        inlineKeyboardArray.push([{text: "🗂 Каталог товаров",
          callback_data: `c?o=${objectId}`}]);
      }
    }
  }
  if (caption) {
    const publicImgUrl = await photoCheckUrl();
    await ctx.replyWithPhoto(publicImgUrl,
        {
          caption,
          parse_mode: "html",
          reply_markup: {
            inline_keyboard: inlineKeyboardArray,
          },
        });
  } else {
    // get all Objects
    const objects = await store.findAll("objects");
    objects.forEach((object) => {
      inlineKeyboardArray.push([{text: `🏪 ${object.name}`, callback_data: `objects/${object.id}`}]);
    });
    inlineKeyboardArray.push([{text: "🧾 Мои заказы", callback_data: `myO/${ctx.from.id}`}]);
    inlineKeyboardArray.push([{text: "🔍 Поиск товаров", callback_data: "search"}]);
    inlineKeyboardArray.push([{text: `Войти на сайт ${process.env.BOT_SITE}`, login_url: {
      url: `${process.env.BOT_SITE}/login`,
      request_write_access: true,
    }}]);
    // add main photo
    const projectImg = await photoCheckUrl();
    // locale ctx.i18n.t("test")
    await ctx.replyWithPhoto(projectImg,
        {
          caption: "<b>Выберите склад</b>",
          parse_mode: "html",
          reply_markup: {
            inline_keyboard: inlineKeyboardArray,
          },
        });
  }
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
        caption += `<b>Курсы валют: USD = ${object.currencies.USD}${process.env.BOT_CURRENCY}, ` +
        `EUR = ${object.currencies.EUR}${process.env.BOT_CURRENCY}</b>\n`;
      }
      inlineKeyboardArray.push([{text: "🏠 Главная", callback_data: "objects"}]);
      // set logo obj
      if (object.photoId) {
        imgUrl = `photos/o/${objectId}/logo/${object.photoId}/2.jpg`;
      }
    } else {
      // show all objects
      const objects = await store.findAll("objects");
      objects.forEach((object) => {
        inlineKeyboardArray.push([{text: `🏪 ${object.name}`, callback_data: `objects/${object.id}`}]);
      });
      inlineKeyboardArray.push([{text: "🧾 Мои заказы", callback_data: `myO/${ctx.from.id}`}]);
      inlineKeyboardArray.push([{text: "🔍 Поиск товаров", callback_data: "search"}]);
      inlineKeyboardArray.push([{text: `Войти на сайт ${process.env.BOT_SITE}`, login_url: {
        url: `${process.env.BOT_SITE}/login`,
        request_write_access: true,
      }}]);
    }
    // render data
    const media = await photoCheckUrl(imgUrl);
    await ctx.editMessageMedia({
      type: "photo",
      media,
      caption: caption + ctx.state.sessionMsg.linkHTML(),
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
// upload photo obj new
const uploadPhotoObj = async (ctx, objectId) => {
  if (objectId) {
    const object = await store.findRecord(`objects/${objectId}`);
    // first delete old photos
    if (object.photoId) {
      await bucket.deleteFiles({
        prefix: `photos/o/${objectId}/logo`,
      });
    }
    try {
      // download photos from telegram server
      const photoId = await savePhotoTelegram(ctx, `photos/o/${objectId}/logo`);
      // save fileID to Firestore
      await store.updateRecord(`objects/${objectId}`, {
        photoId,
      });
      // get catalog url (path)
      const catalogUrl = `objects/${objectId}`;
      const url = await photoCheckUrl(`photos/o/${objectId}/logo/${photoId}/2.jpg`);
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
    } catch (e) {
      await ctx.reply(`Error upload photos ${e.message}`);
      return;
    }
  } else {
    await ctx.reply("Please select a object to upload Photo");
  }
};

exports.startActions = startActions;
exports.startHandler = startHandler;
exports.isAdmin = isAdmin;
exports.parseUrl = parseUrl;
exports.uploadPhotoObj = uploadPhotoObj;
