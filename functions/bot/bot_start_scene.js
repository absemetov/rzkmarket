const {store, cart, photoCheckUrl} = require("./bot_store_cart");
const startActions = [];
const TelegrafI18n = require("telegraf-i18n");
const path = require("path");
const i18n = new TelegrafI18n({
  directory: path.resolve(__dirname, "locales"),
});
// admin midleware
const isAdmin = (ctx, next) => {
  ctx.state.isAdmin = ctx.from.id === 94899148;
  process.env.BOT_LANG = "uk";
  ctx.i18n = i18n.createContext(process.env.BOT_LANG).repository[process.env.BOT_LANG];
  return next();
};

// parse callback data, add Cart instance
const parseUrl = (ctx, next) => {
  if (ctx.callbackQuery) {
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
        inlineKeyboardArray.push([{text: `🚲 ${product.name} (${product.id})`,
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
          `Контакты: ${object.phoneArray.join("📞 ")}\n` +
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
    inlineKeyboardArray.push([{text: ctx.i18n.btn.orders(), callback_data: `myO/${ctx.from.id}`}]);
    inlineKeyboardArray.push([{text: ctx.i18n.btn.search(), callback_data: "search"}]);
    if (ctx.state.isAdmin) {
      inlineKeyboardArray.push([{text: "📝 Включить Режим редактирования",
        callback_data: "editMode/1"}]);
    }
    inlineKeyboardArray.push([{text: ctx.i18n.btn.login(), login_url: {
      url: `${process.env.BOT_SITE}/login`,
      request_write_access: true,
    }}]);
    // add main photo
    const projectImg = await photoCheckUrl();
    await ctx.replyWithPhoto(projectImg,
        {
          caption: `<b>${ctx.i18n.start.chooseWarehouse()}\n${ctx.i18n.phones.map((value) => `📞 ${value()}`).join("\n")}</b>`,
          parse_mode: "html",
          reply_markup: {
            inline_keyboard: inlineKeyboardArray,
          },
        });
  }
};
// enable edit mode
startActions.push(async (ctx, next) => {
  if (ctx.state.routeName === "editMode") {
    const enable = ctx.state.param;
    if (enable) {
      // uUrl += "&u=1";
      ctx.state.sessionMsg.url.searchParams.set("editMode", true);
      await ctx.answerCbQuery("Edit Mode Enable");
    } else {
      ctx.state.sessionMsg.url.searchParams.delete("editMode");
      await ctx.answerCbQuery("Edit Mode disable");
    }
    await showObjects(ctx);
  } else {
    return next();
  }
});
// show objects
const showObjects = async (ctx, objectId) => {
  let caption = `<b>${ctx.i18n.start.chooseWarehouse()}\n${ctx.i18n.phones.map((value) => `📞 ${value()}`).join("\n")}</b>`;
  const inlineKeyboardArray = [];
  let imgUrl = null;
  if (objectId) {
    // get data obj
    const object = await store.findRecord(`objects/${objectId}`);
    caption = `<b>${object.name}\n` +
      `${object.phoneArray.join()}\n` +
      `${object.address}\n` +
      `${object.description}</b>\n`;
    const cartButtons = await cart.cartButtons(objectId, ctx);
    inlineKeyboardArray.push([{text: "📁 Каталог", callback_data: `c?o=${object.id}`}]);
    inlineKeyboardArray.push([cartButtons[1]]);
    if (ctx.state.isAdmin) {
      inlineKeyboardArray.push([{text: "💰 Заказы", callback_data: `orders?o=${object.id}`}]);
      if (ctx.state.sessionMsg.url.searchParams.get("editMode")) {
        inlineKeyboardArray.push([{text: "🔄 Обновить данные", callback_data: `upload/${object.id}?todo=updateObject`}]);
        inlineKeyboardArray.push([{text: "🚲 Загрузить товары",
          callback_data: `upload/${object.id}?todo=uploadProducts`}]);
        inlineKeyboardArray.push([{text: "📸 Загрузить фото объекта",
          callback_data: `uploadPhotoObj/${object.id}`}]);
        caption += `<b>Курсы валют: USD = ${object.currencies.USD}${process.env.BOT_CURRENCY}, ` +
        `EUR = ${object.currencies.EUR}${process.env.BOT_CURRENCY}</b>\n`;
      }
    }
    inlineKeyboardArray.push([{text: ctx.i18n.btn.main(), callback_data: "objects"}]);
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
    inlineKeyboardArray.push([{text: ctx.i18n.btn.orders(), callback_data: `myO/${ctx.from.id}`}]);
    inlineKeyboardArray.push([{text: ctx.i18n.btn.search(), callback_data: "search"}]);
    if (ctx.state.isAdmin) {
      if (ctx.state.sessionMsg.url.searchParams.get("editMode")) {
        inlineKeyboardArray.push([{text: "🔒 Отключить Режим редактирования",
          callback_data: "editMode"}]);
      } else {
        inlineKeyboardArray.push([{text: "📝 Включить Режим редактирования",
          callback_data: "editMode/1"}]);
      }
    }
    inlineKeyboardArray.push([{text: ctx.i18n.btn.login(), login_url: {
      url: `${process.env.BOT_SITE}/login`,
      request_write_access: true,
    }}]);
  }
  // render data
  const media = await photoCheckUrl(imgUrl);
  await ctx.editMessageMedia({
    type: "photo",
    media,
    caption: `${caption} ` + ctx.state.sessionMsg.linkHTML(),
    parse_mode: "html",
  }, {
    reply_markup: {
      inline_keyboard: inlineKeyboardArray,
    },
  });
};

startActions.push(async (ctx, next) => {
  if (ctx.state.routeName === "objects") {
    const objectId = ctx.state.param;
    await showObjects(ctx, objectId);
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});
// upload object photo
startActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "uploadPhotoObj") {
    const objectId = ctx.state.param;
    // await store.createRecord(`users/${ctx.from.id}`, {"session": {
    //   "scene": "uploadPhotoObj",
    //   objectId,
    // }});
    ctx.state.sessionMsg.url.searchParams.set("scene", "uploadPhotoObj");
    ctx.state.sessionMsg.url.searchParams.set("objectId", objectId);
    const object = await store.findRecord(`objects/${objectId}`);
    await ctx.replyWithHTML(`Добавьте фото <b>${object.name} (${object.id})</b>` + ctx.state.sessionMsg.linkHTML(), {
      reply_markup: {
        force_reply: true,
      }});
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

exports.startActions = startActions;
exports.startHandler = startHandler;
exports.isAdmin = isAdmin;
exports.parseUrl = parseUrl;
