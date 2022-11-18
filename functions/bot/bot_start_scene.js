const {store, cart, photoCheckUrl} = require("./bot_store_cart");
const startActions = [];
const TelegrafI18n = require("telegraf-i18n");
const path = require("path");
const i18n = new TelegrafI18n({
  directory: path.resolve(__dirname, "locales"),
});
// admin midleware i18n
const isAdmin = (ctx, next) => {
  ctx.state.isAdmin = ctx.from.id === 94899148;
  ctx.i18n = i18n.createContext(process.env.BOT_LANG).repository[process.env.BOT_LANG];
  return next();
};
// parse callback data, add Cart instance
// set next route path for custom handle
const parseUrl = (ctx, next) => {
  if (typeof next === "string") {
    ctx.callbackQuery.data = next;
  }
  const path = ctx.callbackQuery.data;
  const regPath = path.match(/^([a-zA-Z0-9-_]+)\/?([a-zA-Z0-9-_]+)?\??([a-zA-Z0-9-_=&]+)?/);
  ctx.state.routeName = regPath[1];
  ctx.state.param = regPath[2];
  const args = regPath[3];
  // parse url params
  const params = new Map();
  if (args) {
    for (const paramsData of args.split("&")) {
      params.set(paramsData.split("=")[0], paramsData.split("=")[1]);
    }
  }
  ctx.state.params = params;
  if (typeof next === "function") {
    return next();
  }
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
        inlineKeyboardArray.push([{text: `📦 ${product.brand ? product.brand + " " : ""}${product.name} (${product.id})`,
          callback_data: `p/${product.id}?o=${objectId}`}]);
      }
    }
    // get catalog
    if (objectType === "c") {
      const catalog = await store.findRecord(`objects/${objectId}/catalogs/${objectTypeId}`);
      if (object && catalog) {
        inlineKeyboardArray.push([{text: `📁 ${catalog.name}`,
          callback_data: `c/${objectTypeId}?o=${objectId}`}]);
      }
    }
    if (object) {
      caption = `<b>${object.name}\n` +
          `${object.phoneArray.join()}\n` +
          `${object.address}\n` +
          `${object.description}</b>`;
      // default button
      if (!inlineKeyboardArray.length) {
        inlineKeyboardArray.push([{text: "📁 Каталог",
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
      inlineKeyboardArray.push([{text: `🏪 ${object.name}`, callback_data: `o/${object.id}`}]);
    });
    inlineKeyboardArray.push([{text: ctx.i18n.btn.orders(), callback_data: `m/${ctx.from.id}`}]);
    inlineKeyboardArray.push([{text: ctx.i18n.btn.search(), callback_data: "search?formOpen=true"}]);
    if (ctx.state.isAdmin) {
      inlineKeyboardArray.push([{text: "💰 Заказы Algolia", callback_data: "searchOrder"}]);
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
startActions.push(async (ctx, next) => {
  if (ctx.state.routeName === "o") {
    const objectId = ctx.state.param;
    let caption = `<b>${ctx.i18n.start.chooseWarehouse()}\n${ctx.i18n.phones.map((value) => `📞 ${value()}`).join("\n")}</b>`;
    const inlineKeyboardArray = [];
    let imgUrl = null;
    if (objectId) {
      // enable edit mode
      const editOn = ctx.state.params.get("editOn");
      const editOff = ctx.state.params.get("editOff");
      if (editOn) {
        // uUrl += "&u=1";
        ctx.state.sessionMsg.url.searchParams.set("editMode", true);
        await ctx.answerCbQuery("Edit Mode Enable");
      }
      if (editOff) {
        ctx.state.sessionMsg.url.searchParams.delete("editMode");
        await ctx.answerCbQuery("Edit Mode disable");
      }
      // set session
      ctx.state.sessionMsg.url.searchParams.set("objectId", objectId);
      // get data obj
      const object = await store.findRecord(`objects/${objectId}`);
      caption = `<b>${object.name}\n` +
        `${object.phoneArray.join()}\n` +
        `${object.address}\n` +
        `${object.description}</b>\n`;
      const cartButtons = await cart.cartButtons(objectId, ctx);
      inlineKeyboardArray.push([{text: "📁 Каталог", callback_data: "c"}]);
      inlineKeyboardArray.push([cartButtons[1]]);
      if (ctx.state.isAdmin) {
        inlineKeyboardArray.push([{text: "💰 Заказы", callback_data: "r"}]);
        if (ctx.state.sessionMsg.url.searchParams.get("editMode")) {
          inlineKeyboardArray.push([{text: "🔄 Обновить данные", callback_data: `upload/${object.id}?todo=updateObject`}]);
          inlineKeyboardArray.push([{text: "📸 Загрузить фото объекта",
            callback_data: `u/${object.id}?todo=obj`}]);
          inlineKeyboardArray.push([{text: "📥 Загрузить товары",
            callback_data: `upload/${object.id}?todo=uploadProducts`}]);
          caption += `<b>Курсы валют: USD = ${object.currencies.USD}${process.env.BOT_CURRENCY}, ` +
          `EUR = ${object.currencies.EUR}${process.env.BOT_CURRENCY}</b>\n`;
        }
        if (ctx.state.sessionMsg.url.searchParams.get("editMode")) {
          inlineKeyboardArray.push([{text: "🔒 Отключить Режим редактирования",
            callback_data: `o/${objectId}?editOff=true`}]);
        } else {
          inlineKeyboardArray.push([{text: "📝 Включить Режим редактирования",
            callback_data: `o/${objectId}?editOn=true`}]);
        }
      }
      caption += ctx.state.sessionMsg.linkHTML();
      inlineKeyboardArray.push([{text: ctx.i18n.btn.main(), callback_data: "o"}]);
      // set logo obj
      if (object.photoId) {
        imgUrl = `photos/o/${objectId}/logo/${object.photoId}/2.jpg`;
      }
    } else {
      // show all objects
      const objects = await store.findAll("objects");
      objects.forEach((object) => {
        inlineKeyboardArray.push([{text: `🏪 ${object.name}`, callback_data: `o/${object.id}`}]);
      });
      inlineKeyboardArray.push([{text: ctx.i18n.btn.orders(), callback_data: `m/${ctx.from.id}`}]);
      inlineKeyboardArray.push([{text: ctx.i18n.btn.search(), callback_data: "search?formOpen=true"}]);
      if (ctx.state.isAdmin) {
        inlineKeyboardArray.push([{text: "💰 Заказы Algolia", callback_data: "searchOrder"}]);
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
      caption: `${caption}`,
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

exports.startActions = startActions;
exports.startHandler = startHandler;
exports.isAdmin = isAdmin;
exports.parseUrl = parseUrl;
