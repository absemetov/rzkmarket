const {store, cart, photoCheckUrl} = require("./bot_store_cart");
const {uploadCatalogs} = require("./bot_upload_scene");
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
  // const path = ctx.callbackQuery.data;
  // const regPath = path.match(/^([a-zA-Z0-9-_]+)\/?([a-zA-Z0-9-_]+)?\??([а-яa-zA-Z0-9-_=&]+)?/);
  // ctx.state.routeName = regPath[1];
  // ctx.state.param = regPath[2];
  // const args = regPath[3];
  // // parse url params
  // const params = new Map();
  // if (args) {
  //   for (const paramsData of args.split("&")) {
  //     params.set(paramsData.split("=")[0], paramsData.split("=")[1]);
  //   }
  // }
  // ctx.state.searchParams = params;
  const url = new URL(`http://t.me/${ctx.callbackQuery.data}`);
  ctx.state.pathParams = url.pathname.split("/").slice(1);
  ctx.state.searchParams = url.searchParams;
  if (typeof next === "function") {
    return next();
  }
};
// start handler show objects
const startHandler = async (ctx, startParam) => {
  const inlineKeyboardArray = [];
  // start deep linking parsing
  const path = startParam && startParam.match(/^o_([\w_-]+)_(p|c|o)_([\w_#-]+)/);
  let caption = "";
  if (path) {
    const objectId = path[1];
    const objectType = path[2];
    const objectTypeId = path[3];
    // get product
    if (objectType === "p") {
      const product = await store.findRecord(`objects/${objectId}/products/${objectTypeId}`);
      if (product) {
        inlineKeyboardArray.push([{text: `📦 ${product.brand ? product.brand + " " : ""}${product.name} (${product.id})`,
          callback_data: `k/${product.id}/${objectId}`}]);
      }
    }
    // get catalog
    if (objectType === "c") {
      ctx.state.sessionMsg.url.searchParams.set("pathU", objectTypeId);
      const catalog = await store.findRecord(`catalogs/${objectTypeId}`);
      if (catalog) {
        caption = `<b>${catalog.name}</b>`;
        inlineKeyboardArray.push([{text: `📁 ${catalog.name}`,
          callback_data: `c/${objectTypeId.substring(objectTypeId.lastIndexOf("#") + 1)}`}]);
      }
    }
    // get order
    if (objectType === "o") {
      const order = await store.findRecord(`objects/${objectId}/orders/${objectTypeId}`);
      if (order) {
        if (ctx.state.isAdmin) {
          // create btn to admin orders
          inlineKeyboardArray.push([{text: `Show order ${order.lastName} ${order.firstName}, #${order.userId}-${order.orderNumber}`,
            callback_data: `r/${order.id}?o=${order.objectId}`,
          }]);
        } else {
          // const userId = + ctx.from.id;
          // show order or copy
          // if (order.userId === 94899148) {
          //   await store.updateRecord(`objects/${objectId}/orders/${objectTypeId}`, {userId});
          // }
          inlineKeyboardArray.push([{text: `Show order ${order.lastName} ${order.firstName}, #${order.userId}-${order.orderNumber}`,
            callback_data: `m/${ctx.from.id}?oId=${order.id}&o=${order.objectId}`}]);
          if (order.userId === 94899148) {
            inlineKeyboardArray.push([{text: `Copy order ${order.lastName} ${order.firstName}, #${order.userId}-${order.orderNumber}`,
              callback_data: `m/${ctx.from.id}?oId=${order.id}&o=${order.objectId}&c=1`}]);
          }
        }
      }
    }
    const object = await store.findRecord(`objects/${objectId}`);
    if (object) {
      caption = `<b>${object.name}\n` +
          `${object.phoneArray.join()}\n` +
          `${object.address}\n` +
          `${object.description}</b>`;
      // default button
      if (!inlineKeyboardArray.length) {
        inlineKeyboardArray.push([{text: ctx.i18n.btn.catalog(),
          callback_data: "c"}]);
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
    // const objects = await store.findAll("objects");
    // objects.forEach((object) => {
    //   inlineKeyboardArray.push([{text: `🏪 ${object.name}`, callback_data: `o/${object.id}`}]);
    // });
    const cartButton = await cart.cartButton(ctx);
    inlineKeyboardArray.push([{text: ctx.i18n.btn.catalog(), callback_data: "c"}]);
    inlineKeyboardArray.push([{text: ctx.i18n.btn.search(), callback_data: "search?formOpen=true"}]);
    inlineKeyboardArray.push(cartButton);
    inlineKeyboardArray.push([{text: ctx.i18n.btn.orders(), callback_data: `m/${ctx.from.id}`}]);
    // admin mode
    if (ctx.state.isAdmin) {
      // show all objects
      const objects = await store.findAll("objects");
      objects.forEach((object) => {
        inlineKeyboardArray.push([{text: `🏪 ${object.name}`, callback_data: `o/${object.id}`}]);
      });
      inlineKeyboardArray.push([{text: "💰 Заказы Algolia", callback_data: "searchOrder"}]);
      // upload catalogs
      // if (ctx.state.sessionMsg.url.searchParams.get("editMode")) {
      //   inlineKeyboardArray.push([{text: "💵 Sites Editor", callback_data: "site"}]);
      //   inlineKeyboardArray.push([{text: "🎞 Banners", callback_data: "d"}]);
      //   inlineKeyboardArray.push([{text: "📥 Upload catalogs",
      //     callback_data: "o?uploadCatalogs=true"}]);
      // }
      // edit mode
      // if (ctx.state.sessionMsg.url.searchParams.get("editMode")) {
      //   inlineKeyboardArray.push([{text: "🔒 Отключить Режим редактирования",
      //     callback_data: "o?editOff=true"}]);
      // } else {
      inlineKeyboardArray.push([{text: "📝 Включить Режим редактирования",
        callback_data: "o?editOn=true"}]);
      // }
    }
    // login
    inlineKeyboardArray.push([{text: ctx.i18n.btn.login(), login_url: {
      url: `${process.env.BOT_SITE}/login`,
      request_write_access: true,
    }}]);
    // add main photo
    const projectImg = await photoCheckUrl();
    await ctx.replyWithPhoto(projectImg,
        {
          caption: `<b>${ctx.i18n.phones.map((value) => `📞 ${value()}`).join("\n")}</b>`,
          parse_mode: "html",
          reply_markup: {
            inline_keyboard: inlineKeyboardArray,
          },
        });
  }
};
startActions.push(async (ctx, next) => {
  if (ctx.state.pathParams[0] === "o") {
    // upload catalogs
    const uploadCatalogsAction = ctx.state.searchParams.get("uploadCatalogs");
    if (uploadCatalogsAction) {
      try {
        // await uploadProducts(bot.telegram, objectId, uploads.sheetId, uploads.pageName);
        await uploadCatalogs(ctx);
      } catch (error) {
        await ctx.replyWithHTML(`Sheet ${error}`);
      }
      await ctx.answerCbQuery();
      return;
    }
    // delete session path order if not edit
    if (!ctx.state.sessionMsg.url.searchParams.get("orderData_id")) {
      ctx.state.sessionMsg.url.searchParams.delete("pathOrderCurrent");
    }
    const objectId = ctx.state.pathParams[1];
    let caption = `<b>${ctx.i18n.phones.map((value) => `📞 ${value()}`).join("\n")}</b>`;
    const inlineKeyboardArray = [];
    if (ctx.state.sessionMsg.url.searchParams.get("orderData_id")) {
      inlineKeyboardArray.push([{text: `📝 Редактор заказа 🏪 ${ctx.state.sessionMsg.url.searchParams.get("orderData_objectId")}`, callback_data: "cart"}]);
    }
    // enable edit mode
    const editOn = ctx.state.searchParams.get("editOn");
    const editOff = ctx.state.searchParams.get("editOff");
    if (editOn) {
      // uUrl += "&u=1";
      ctx.state.sessionMsg.url.searchParams.set("editMode", true);
      await ctx.answerCbQuery("Edit Mode Enable");
    }
    if (editOff) {
      ctx.state.sessionMsg.url.searchParams.delete("editMode");
      await ctx.answerCbQuery("Edit Mode disable");
    }
    let imgUrl = null;
    if (objectId) {
      // set session
      ctx.state.sessionMsg.url.searchParams.set("oId", objectId);
      // get data obj
      const object = await store.findRecord(`objects/${objectId}`);
      caption = `<b>${object.name}\n` +
        `${object.phoneArray.join()}\n` +
        `${object.address}\n` +
        `${object.description}</b>`;
      // const cartButtons = await cart.cartButtons(objectId, ctx);
      inlineKeyboardArray.push([{text: ctx.i18n.btn.main(), callback_data: "o"}]);
      // inlineKeyboardArray.push([cartButtons[1]]);
      if (ctx.state.isAdmin) {
        inlineKeyboardArray.push([{text: "💰 Заказы", callback_data: "r"}]);
        inlineKeyboardArray.push([{text: "🔄 Обновить данные", callback_data: `upload/${object.id}?todo=updateObject`}]);
        inlineKeyboardArray.push([{text: "📸 Загрузить фото объекта",
          callback_data: `u/${object.id}/obj`}]);
        inlineKeyboardArray.push([{text: "📥 Загрузить товары",
          callback_data: `upload/${object.id}?todo=uploadProducts`}]);
        if (process.env.BOT_LANG === "uk") {
          inlineKeyboardArray.push([{text: "📮 Загрузить товары в мерч",
            callback_data: `upload/${object.id}?todo=uploadToMerchant`}]);
        }
        caption += `https://docs.google.com/spreadsheets/d/${object.sheetId}\n`;
      }
      caption += ctx.state.sessionMsg.linkHTML();
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
      const cartButton = await cart.cartButton(ctx);
      inlineKeyboardArray.push([{text: ctx.i18n.btn.catalog(), callback_data: "c"}]);
      inlineKeyboardArray.push([{text: ctx.i18n.btn.search(), callback_data: "search?formOpen=true"}]);
      inlineKeyboardArray.push(cartButton);
      inlineKeyboardArray.push([{text: ctx.i18n.btn.orders(), callback_data: `m/${ctx.from.id}`}]);
      if (ctx.state.isAdmin) {
        // show all objects
        const objects = await store.findAll("objects");
        objects.forEach((object) => {
          inlineKeyboardArray.push([{text: `🏪 ${object.name}`, callback_data: `o/${object.id}`}]);
        });
        inlineKeyboardArray.push([{text: "💰 Заказы Algolia", callback_data: "searchOrder"}]);
        // upload catalogs
        if (ctx.state.sessionMsg.url.searchParams.get("editMode")) {
          inlineKeyboardArray.push([{text: "💵 Sites Editor", callback_data: "site"}]);
          inlineKeyboardArray.push([{text: "🎞 Banners", callback_data: "d"}]);
          inlineKeyboardArray.push([{text: "📥 Upload catalogs",
            callback_data: "o?uploadCatalogs=true"}]);
        }
        // edit mode
        if (ctx.state.sessionMsg.url.searchParams.get("editMode")) {
          inlineKeyboardArray.push([{text: "🔒 Отключить Режим редактирования",
            callback_data: "o?editOff=true"}]);
        } else {
          inlineKeyboardArray.push([{text: "📝 Включить Режим редактирования",
            callback_data: "o?editOn=true"}]);
        }
      }
      // login btn
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
// banners action
startActions.push(async (ctx, next) => {
  if (ctx.state.pathParams[0] === "d") {
    const todo = ctx.state.pathParams[1];
    const bannerNumber = ctx.state.searchParams.get("b");
    await ctx.answerCbQuery();
    // show a banner options
    if (todo === "show") {
      const banner = await store.findRecord(`banners/${bannerNumber}`);
      let media = await photoCheckUrl(null);
      if (banner && banner.mdUrl) {
        media = banner.mdUrl;
      }
      await ctx.editMessageMedia({
        type: "photo",
        media,
        caption: `Banner ${bannerNumber}, url: ${banner ? banner.url : ""}` + ctx.state.sessionMsg.linkHTML(),
        parse_mode: "html",
      }, {reply_markup: {
        inline_keyboard: [
          [{text: "🎞 Banners",
            callback_data: "d"}],
          [{text: "Upload large (1280x149) photo",
            callback_data: `d/uploadLg?b=${bannerNumber}`}],
          [{text: "Upload small (992x413) photo",
            callback_data: `d/uploadMd?b=${bannerNumber}`}],
          [{text: "Set url",
            callback_data: `d/setUrl?b=${bannerNumber}`}],
          [{text: "Delete Banner",
            callback_data: `d/delBanner?b=${bannerNumber}`}],
        ],
      }});
      return;
    }
    // delete a banner
    if (todo === "delBanner") {
      // ctx.state.sessionMsg.url.searchParams.set("scene", "delete-main-banner");
      ctx.state.sessionMsg.url.searchParams.set("bTodo", "delete-main-banner");
      ctx.state.sessionMsg.url.searchParams.set("bNumber", bannerNumber);
      await store.setSession(ctx, "changeBanner");
      await ctx.replyWithHTML(`<b>Enter del for delete ${bannerNumber} banner</b>` + ctx.state.sessionMsg.linkHTML());
      return;
    }
    // set url a banner
    if (todo === "setUrl") {
      // ctx.state.sessionMsg.url.searchParams.set("scene", "setUrl-main-banner");
      ctx.state.sessionMsg.url.searchParams.set("bTodo", "setUrl-main-banner");
      ctx.state.sessionMsg.url.searchParams.set("bNumber", bannerNumber);
      await store.setSession(ctx, "changeBanner");
      await ctx.replyWithHTML(`<b>Enter url ${bannerNumber} banner</b>` + ctx.state.sessionMsg.linkHTML());
      return;
    }
    // upload a banner LG
    if (todo === "uploadLg") {
      // ctx.state.sessionMsg.url.searchParams.set("scene", "upload-lg-banner");
      ctx.state.sessionMsg.url.searchParams.set("bNumber", bannerNumber);
      await store.setSession(ctx, "upload-lg-banner");
      await ctx.replyWithHTML(`<b>Upload ${bannerNumber} banner LG photo (1440x168)</b>` + ctx.state.sessionMsg.linkHTML());
      return;
    }
    // upload a banner SM
    if (todo === "uploadMd") {
      // ctx.state.sessionMsg.url.searchParams.set("scene", "upload-md-banner");
      ctx.state.sessionMsg.url.searchParams.set("bNumber", bannerNumber);
      await store.setSession(ctx, "upload-md-banner");
      await ctx.replyWithHTML(`<b>Upload ${bannerNumber} banner MD photo (992x413)</b>` + ctx.state.sessionMsg.linkHTML());
      return;
    }
    const inlineKeyboardArray = [];
    inlineKeyboardArray.push([{text: ctx.i18n.btn.main(), callback_data: "o"}]);
    inlineKeyboardArray.push([{text: "1 banner", callback_data: "d/show?b=1"}]);
    inlineKeyboardArray.push([{text: "2 banner", callback_data: "d/show?b=2"}]);
    inlineKeyboardArray.push([{text: "3 banner", callback_data: "d/show?b=3"}]);
    inlineKeyboardArray.push([{text: "4 banner", callback_data: "d/show?b=4"}]);
    inlineKeyboardArray.push([{text: "5 banner", callback_data: "d/show?b=5"}]);
    await ctx.editMessageCaption("<b>Banners</b>" + ctx.state.sessionMsg.linkHTML(), {
      parse_mode: "html",
      reply_markup: {
        inline_keyboard: inlineKeyboardArray,
      }});
  } else {
    return next();
  }
});

// create pdf actions
startActions.push(async (ctx, next) => {
  if (ctx.state.pathParams[0] === "f") {
    await ctx.answerCbQuery();
    // doc type cart or order
    const objectId = ctx.state.sessionMsg.url.searchParams.get("oId");
    const type = ctx.state.pathParams[1];
    const docId = ctx.state.searchParams.get("id");
    // const object = await store.findRecord(`objects/${objectId}`);
    let data = {};
    // print cart
    // create pdf
    if (type === "cart") {
      const products = await cart.products(docId);
      data = {
        client: "bot",
        filename: `Cart-${docId}`,
        type: "cart",
        products,
        i18n: {
          cart: ctx.i18n.txt.cart(),
          prodCode: ctx.i18n.product.code(),
          prodName: ctx.i18n.product.name(),
          prodPrice: ctx.i18n.product.price(),
          tQty: ctx.i18n.product.qty(),
          tSum: ctx.i18n.product.sum(),
          phones: ctx.i18n.phones,
        },
        siteName: process.env.SITE_NAME,
        currency: process.env.BOT_CURRENCY,
        domain: process.env.BOT_SITE,
      };
    }
    // generate order pdf new
    if (type === "order") {
      const order = await store.findRecord(`objects/${objectId}/orders/${docId}`);
      data = {
        client: "bot",
        filename: `Order ${order.userId}-${order.orderNumber}`,
        type: "order",
        order,
        products: order.products,
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
          phones: ctx.i18n.phones,
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
