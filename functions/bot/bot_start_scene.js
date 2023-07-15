const {store, cart, photoCheckUrl} = require("./bot_store_cart");
const startActions = [];
const TelegrafI18n = require("telegraf-i18n");
const path = require("path");
const {createPdf} = require("../sites/rzk.com.ru/createPdf.js");
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
  const path = atob(ctx.message.text.substring(6)).match(/o_([a-zA-Z0-9-_]+)_(p|c)_([a-zA-Z0-9-_#]+)/);
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
      ctx.state.sessionMsg.url.searchParams.set("pathU", objectTypeId);
      const catalog = await store.findRecord(`objects/${objectId}/catalogs/${objectTypeId}`);
      if (object && catalog) {
        inlineKeyboardArray.push([{text: `📁 ${catalog.name}`,
          callback_data: `c/${objectTypeId.substring(objectTypeId.lastIndexOf("#") + 1)}?o=${objectId}`}]);
      }
    }
    if (object) {
      caption = `<b>${object.name}\n` +
          `${object.phoneArray.join()}\n` +
          `${object.address}\n` +
          `${object.description}</b>`;
      // default button
      if (!inlineKeyboardArray.length) {
        inlineKeyboardArray.push([{text: ctx.i18n.btn.catalog(),
          callback_data: `c?o=${objectId}`}]);
      }
    }
  }
  if (caption) {
    const publicImgUrl = await photoCheckUrl();
    await ctx.replyWithPhoto(publicImgUrl,
        {
          caption: caption + ctx.state.sessionMsg.linkHTML(),
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
      inlineKeyboardArray.push([{text: "🎞 Banners", callback_data: "d"}]);
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
    // delete session vars
    ctx.state.sessionMsg.url.searchParams.delete("pathOrderCurrent");

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
      ctx.state.sessionMsg.url.searchParams.set("oId", objectId);
      // get data obj
      const object = await store.findRecord(`objects/${objectId}`);
      caption = `<b>${object.name}\n` +
        `${object.phoneArray.join()}\n` +
        `${object.address}\n` +
        `${object.description}</b>`;
      const cartButtons = await cart.cartButtons(objectId, ctx);
      inlineKeyboardArray.push([{text: ctx.i18n.btn.catalog(), callback_data: "c"}]);
      inlineKeyboardArray.push([cartButtons[1]]);
      if (ctx.state.isAdmin) {
        inlineKeyboardArray.push([{text: "💰 Заказы", callback_data: "r"}]);
        if (ctx.state.sessionMsg.url.searchParams.get("editMode")) {
          inlineKeyboardArray.push([{text: "🔄 Обновить данные", callback_data: `upload/${object.id}?todo=updateObject`}]);
          inlineKeyboardArray.push([{text: "📸 Загрузить фото объекта",
            callback_data: `u/${object.id}?todo=obj`}]);
          inlineKeyboardArray.push([{text: "📥 Загрузить товары",
            callback_data: `upload/${object.id}?todo=uploadProducts`}]);
          caption += `https://docs.google.com/spreadsheets/d/${object.sheetId}\n`;
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
      inlineKeyboardArray.push([
        {
          text: `${object.name}`,
          url: `${process.env.BOT_SITE}/o/${objectId}`,
        },
      ]);
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
        inlineKeyboardArray.push([{text: "🎞 Banners", callback_data: "d"}]);
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
// banners action
startActions.push(async (ctx, next) => {
  if (ctx.state.routeName === "d") {
    const todo = ctx.state.param;
    const bannerNumber = ctx.state.params.get("b");
    await ctx.answerCbQuery();
    // show a banner options
    if (todo === "show") {
      const banner = await store.findRecord(`banners/${bannerNumber}`);
      let media = await photoCheckUrl(null);
      if (banner && banner.photoUrl) {
        media = banner.photoUrl;
      }
      await ctx.editMessageMedia({
        type: "photo",
        media,
        caption: `Banner ${bannerNumber}, url: ${banner ? banner.url : ""}` + ctx.state.sessionMsg.linkHTML(),
        parse_mode: "html",
      }, {reply_markup: {
        inline_keyboard: [
          [{text: "Upload photo",
            callback_data: `d/upload?b=${bannerNumber}`}],
          [{text: "Set url",
            callback_data: `d/setUrl?b=${bannerNumber}`}],
          [{text: "Delete Banner",
            callback_data: `d/delBanner?b=${bannerNumber}`}],
          [{text: "Banners",
            callback_data: "d"}],
        ],
      }});
      return;
    }
    // delete a banner
    if (todo === "delBanner") {
      ctx.state.sessionMsg.url.searchParams.set("scene", "delete-main-banner");
      ctx.state.sessionMsg.url.searchParams.set("bNumber", bannerNumber);
      await ctx.replyWithHTML(`<b>Enter del for delete ${bannerNumber} banner</b>` + ctx.state.sessionMsg.linkHTML(), {
        reply_markup: {
          force_reply: true,
        }});
      return;
    }
    // set url a banner
    if (todo === "setUrl") {
      ctx.state.sessionMsg.url.searchParams.set("scene", "setUrl-main-banner");
      ctx.state.sessionMsg.url.searchParams.set("bNumber", bannerNumber);

      await ctx.replyWithHTML(`<b>Enter url ${bannerNumber} banner</b>` + ctx.state.sessionMsg.linkHTML(), {
        reply_markup: {
          force_reply: true,
        }});
      return;
    }
    // upload a banner
    if (todo === "upload") {
      ctx.state.sessionMsg.url.searchParams.set("scene", "upload-main-banner");
      ctx.state.sessionMsg.url.searchParams.set("bNumber", bannerNumber);

      await ctx.replyWithHTML(`<b>Upload ${bannerNumber} banner photo</b>` + ctx.state.sessionMsg.linkHTML(), {
        reply_markup: {
          force_reply: true,
        }});
      return;
    }
    const inlineKeyboardArray = [];
    inlineKeyboardArray.push([{text: "1 banner", callback_data: "d/show?b=1"}]);
    inlineKeyboardArray.push([{text: "2 banner", callback_data: "d/show?b=2"}]);
    inlineKeyboardArray.push([{text: "3 banner", callback_data: "d/show?b=3"}]);
    inlineKeyboardArray.push([{text: "4 banner", callback_data: "d/show?b=4"}]);
    inlineKeyboardArray.push([{text: "5 banner", callback_data: "d/show?b=5"}]);
    inlineKeyboardArray.push([{text: ctx.i18n.btn.main(), callback_data: "o"}]);
    await ctx.editMessageCaption("<b>Banners</b>" + ctx.state.sessionMsg.linkHTML(), {
      parse_mode: "html",
      reply_markup: {
        inline_keyboard: inlineKeyboardArray,
      }});
  } else {
    return next();
  }
});

// pdf actions
startActions.push(async (ctx, next) => {
  if (ctx.state.routeName === "f") {
    await ctx.answerCbQuery();
    // doc type cart or order
    const objectId = ctx.state.sessionMsg.url.searchParams.get("oId");
    const type = ctx.state.param;
    const docId = ctx.state.params.get("id");
    const object = await store.findRecord(`objects/${objectId}`);
    let data = {};
    // print cart
    // create pdf
    if (type === "cart") {
      const products = await cart.products(objectId, docId);
      data = {
        client: "bot",
        filename: `Cart-${docId}`,
        type: "cart",
        products,
        object,
        i18n: {
          cart: ctx.i18n.txt.cart(),
          prodCode: ctx.i18n.product.code(),
          prodName: ctx.i18n.product.name(),
          prodPrice: ctx.i18n.product.price(),
          tQty: ctx.i18n.product.qty(),
          tSum: ctx.i18n.product.sum(),
          cartLink: ctx.i18n.cartLink(),
        },
        siteName: process.env.SITE_NAME,
        currency: process.env.BOT_CURRENCY,
        domain: process.env.BOT_SITE,
      };
    }
    // generate order pdf
    if (type === "order") {
      const order = await store.findRecord(`objects/${objectId}/orders/${docId}`);
      data = {
        client: "bot",
        filename: `Order ${store.formatOrderNumber(order.userId, order.orderNumber)}`,
        type: "order",
        order,
        products: store.sort(order.products),
        object,
        i18n: {
          order: ctx.i18n.txt.order(),
          buyer: ctx.i18n.txt.buyer(),
          delivery: ctx.i18n.txt.delivery(),
          comment: ctx.i18n.txt.comment(),
          prodCode: ctx.i18n.product.code(),
          prodName: ctx.i18n.product.name(),
          prodPrice: ctx.i18n.product.price(),
          tQty: ctx.i18n.product.qty(),
          tSum: ctx.i18n.product.sum(),
          cartLink: ctx.i18n.cartLink(),
        },
        siteName: process.env.SITE_NAME,
        currency: process.env.BOT_CURRENCY,
        domain: process.env.BOT_SITE,
      };
    }
    // generate pdf
    createPdf(ctx, data);
  } else {
    return next();
  }
});

exports.startActions = startActions;
exports.startHandler = startHandler;
exports.isAdmin = isAdmin;
exports.parseUrl = parseUrl;
