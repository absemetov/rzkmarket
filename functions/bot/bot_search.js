const {photoCheckUrl, store} = require("./bot_store_cart");
const algoliasearch = require("algoliasearch");
const client = algoliasearch(process.env.ALGOLIA_ID, process.env.ALGOLIA_ADMIN_KEY);
const algoliaIndexProducts = client.initIndex(`${process.env.ALGOLIA_PREFIX}products`);
const algoliaIndexOrders = client.initIndex(`${process.env.ALGOLIA_PREFIX}orders`);
const moment = require("moment");

const searchProductHandle = async (ctx, page = 0) => {
  // const page = + Array.isArray(ctx.state.pathParams) && ctx.state.pathParams[1] || 0;
  const productAddedQty = + ctx.state.sessionMsg.url.searchParams.get("sQty");
  const productAddedId = ctx.state.sessionMsg.url.searchParams.get("sId");
  // const productAddedObjectId = ctx.state.sessionMsg.url.searchParams.get("sObjectId");
  let searchText = ctx.state.sessionMsg.url.searchParams.get("search_text");
  ctx.state.sessionMsg.url.searchParams.set("TTL", 1);
  const inlineKeyboard = [];
  if (ctx.state.sessionMsg.url.searchParams.get("orderData_id")) {
    inlineKeyboard.push([{text: `📝 Редактор заказа 🏪 ${ctx.state.sessionMsg.url.searchParams.get("orderData_objectId")}`, callback_data: "cart"}]);
  }
  inlineKeyboard.push([{text: ctx.i18n.btn.main(), callback_data: "o"}]);
  try {
    // get resalts from algolia
    const params = {
      attributesToRetrieve: ["name", "price", "productId", "brand", "seller", "sellerId", "unit", "availability"],
      hitsPerPage: 10,
      page,
    };
    if (searchText.charAt(0) === "_") {
      searchText = searchText.substring(1);
      params.facets = ["seller"];
      params.facetFilters = [["seller:RZK Саки"]];
    }
    if (ctx.state.sessionMsg.url.searchParams.get("orderData_objectId")) {
      params.facets = ["seller"];
      params.facetFilters = [[`seller:${ctx.state.sessionMsg.url.searchParams.get("orderData_objectName")}`]];
    }
    const resalt = await algoliaIndexProducts.search(searchText, {
      ...params,
    });
    for (const product of resalt.hits) {
      const btnSearch = [];
      btnSearch.push({
        text: `${product.availability ? "📦" : "🚫"} ${product.price}${process.env.BOT_CURRENCY} ${product.name} (${product.productId}) ${product.brand ? product.brand + " " : ""} - ${product.seller}`,
        callback_data: `k/${product.productId}/${product.sellerId}`,
      });
      // add cart btn
      if (productAddedId === product.productId && productAddedQty) {
        btnSearch.push({
          text: `🛒 + ${productAddedQty}`,
          callback_data: "cart",
        });
      }
      inlineKeyboard.push(btnSearch);
    }
    // Set load more button
    const prevNext = [];
    if (resalt.page > 0) {
      prevNext.push({text: ctx.i18n.btn.previous(),
        callback_data: `search/${resalt.page - 1}`});
    }
    if (resalt.nbPages && (resalt.page + 1 !== resalt.nbPages)) {
      prevNext.push({text: ctx.i18n.btn.next(),
        callback_data: `search/${resalt.page + 1}`});
    }
    inlineKeyboard.push(prevNext);
    const media = await photoCheckUrl();
    // ctx.state.sessionMsg.url.searchParams.delete("scene");
    ctx.state.sessionMsg.url.searchParams.set("page", page);
    let caption;
    if (resalt.nbHits) {
      // pluralize
      let pluralizeResult;
      if (resalt.nbHits % 10 === 1 && resalt.nbHits % 100 !== 11) {
        pluralizeResult = ctx.i18n.pluralize[0]();
      } else {
        pluralizeResult = resalt.nbHits % 10 >= 2 && resalt.nbHits % 10 <= 4 && (resalt.nbHits % 100 < 10 || resalt.nbHits % 100 >= 20) ?
          ctx.i18n.pluralize[1]() : ctx.i18n.pluralize[2]();
      }
      caption = `<b>&#171;${searchText}&#187; ${ctx.i18n.txt.searchFound()} ${resalt.nbHits} ${pluralizeResult}\n` +
      `${ctx.i18n.txt.page()} ${page + 1} ${ctx.i18n.txt.pageOf()} ${resalt.nbPages}</b>` + ctx.state.sessionMsg.linkHTML();
    } else {
      inlineKeyboard.push([{text: ctx.i18n.btn.search(), callback_data: "search?formOpen=true"}]);
      caption = `<b>&#171;${searchText}&#187; ${ctx.i18n.txt.searchNotFound()}</b>` + ctx.state.sessionMsg.linkHTML();
    }
    if (ctx.callbackQuery) {
      await ctx.editMessageMedia({
        type: "photo",
        media,
        caption,
        parse_mode: "html",
      }, {reply_markup: {
        inline_keyboard: inlineKeyboard,
      }});
    } else {
      await ctx.replyWithPhoto(media,
          {
            caption,
            parse_mode: "html",
            reply_markup: {
              inline_keyboard: inlineKeyboard,
            },
          });
    }
  } catch (error) {
    await ctx.reply(`Algolia error: ${error}`);
  }
};

const searchProductAction = async (ctx, next) => {
  if (ctx.state.pathParams[0] === "search") {
    const formOpen = ctx.state.searchParams.get("formOpen");
    if (formOpen) {
      await searchFormProduct(ctx);
      return;
    }
    await searchProductHandle(ctx, ctx.state.pathParams[1] ? + ctx.state.pathParams[1] : 0);
    await ctx.answerCbQuery();
  } else {
    return next();
  }
};

// form search
const searchFormProduct = async (ctx) => {
  // open search dialog
  // ctx.state.sessionMsg.url.searchParams.set("scene", "search");
  // await ctx.replyWithHTML(`<b>${ctx.i18n.txt.searchForm()}</b>` + ctx.state.sessionMsg.linkHTML(),
  //     {
  //       reply_markup: {
  //         force_reply: true,
  //       },
  //     });
  // use fire session test
  await store.defaultSession(ctx);
  await ctx.replyWithHTML(`<b>${ctx.i18n.txt.searchForm()}</b>`);
  await ctx.answerCbQuery();
};

// order search handler
const searchOrderHandle = async (ctx, page = 0) => {
  // const page = + ctx.state.pathParams[1] || 0;
  const statusOpen = ctx.state.searchParams && ctx.state.searchParams.get("statusOpen");
  const status = ctx.state.searchParams && ctx.state.searchParams.get("status");
  const searchText = ctx.state.sessionMsg.url.searchParams.get("search_order_text") || "";
  ctx.state.sessionMsg.url.searchParams.set("TTL", 1);
  const inlineKeyboard = [];
  if (ctx.state.sessionMsg.url.searchParams.get("orderData_id")) {
    inlineKeyboard.push([{text: `📝 Редактор заказа 🏪 ${ctx.state.sessionMsg.url.searchParams.get("orderData_objectId")}`, callback_data: "cart"}]);
  }
  // show statuses
  if (statusOpen) {
    const selectedStatus = + ctx.state.searchParams.get("selectedStatus");
    inlineKeyboard.push([{text: "Search Orders", callback_data: "searchOrder"}]);
    const algoliaSearch = await algoliaIndexOrders.search(searchText, {
      hitsPerPage: 0,
      facets: ["status"],
    });
    const countStatuses = algoliaSearch.facets.status || {};
    store.statuses().forEach((value, key) => {
      if (key === selectedStatus) {
        value = "✅ " + value;
      }
      inlineKeyboard.push([{text: `${value} (${countStatuses[value] || 0})`, callback_data: `searchOrder?status=${key}`}]);
    });
    // render
    await renderOrders(ctx, "Statuses" + ctx.state.sessionMsg.linkHTML(), inlineKeyboard);
    return;
  }
  inlineKeyboard.push([{text: ctx.i18n.btn.main(), callback_data: "o"}]);
  inlineKeyboard.push([{text: "🔍 Поиск заказа", callback_data: "searchOrder?formOpen=true"}]);
  const statusBtn = [];
  statusBtn.push({text: "🎚 Status", callback_data: "searchOrder?statusOpen=true"});
  if (status) {
    statusBtn[0].callback_data = `searchOrder?statusOpen=true&selectedStatus=${status}`;
    statusBtn.push({text: `❎ ${store.statuses().get(+ status)}`, callback_data: "searchOrder"});
  }
  inlineKeyboard.push(statusBtn);
  try {
    // get resalts from algolia
    const resalt = await algoliaIndexOrders.search(searchText, {
      // attributesToRetrieve: ["name", "productId", "brand", "seller", "sellerId"],
      hitsPerPage: 10,
      facetFilters: status ? [`status:${store.statuses().get(+ status)}`] : [],
      page,
    });
    for (const order of resalt.hits) {
      const date = moment.unix(order.createdAt).locale("ru");
      inlineKeyboard.push([{
        text: `${order.status}, ${order._highlightResult.lastName.value} ${order._highlightResult.firstName.value} #${order.orderNumber}, ${date.fromNow()} - ${order.objectName}`,
        callback_data: `r/${order.objectID}?o=${order.sellerId}`,
      }]);
    }
    // Set load more button
    const urlParams = status ? `?status=${status}` : "";
    const prevNext = [];
    if (resalt.page > 0) {
      prevNext.push({text: "⬅️ Назад",
        callback_data: `searchOrder/${resalt.page - 1}${urlParams}`});
    }
    if (resalt.nbPages && (resalt.page + 1 !== resalt.nbPages)) {
      prevNext.push({text: "➡️ Вперед",
        callback_data: `searchOrder/${resalt.page + 1}${urlParams}`});
    }
    inlineKeyboard.push(prevNext);
    ctx.state.sessionMsg.url.searchParams.delete("scene");
    ctx.state.sessionMsg.url.searchParams.set("page_order", `${page}${status ? `&status=${status}` : ""}`);
    let caption;
    if (resalt.nbHits) {
      if (searchText) {
        caption = `<b>&#171;${searchText}&#187; знайдено ${resalt.nbHits} замовлень Страница ${page + 1} из ${resalt.nbPages}</b>` + ctx.state.sessionMsg.linkHTML();
      } else {
        caption = `<b>Пошук замовлень Страница ${page + 1} из ${resalt.nbPages}</b>` + ctx.state.sessionMsg.linkHTML();
      }
    } else {
      caption = `<b>&#171;${searchText}&#187; за Вашим запитом нічого не знайдено</b>` + ctx.state.sessionMsg.linkHTML();
    }
    // render
    await renderOrders(ctx, caption, inlineKeyboard);
  } catch (error) {
    await ctx.reply(`Algolia error: ${error}`);
  }
};
// render orders
const renderOrders = async (ctx, caption, keyboard) => {
  const media = await photoCheckUrl();
  if (ctx.callbackQuery) {
    await ctx.editMessageMedia({
      type: "photo",
      media,
      caption,
      parse_mode: "html",
    }, {reply_markup: {
      inline_keyboard: keyboard,
    }});
  } else {
    await ctx.replyWithPhoto(media,
        {
          caption,
          parse_mode: "html",
          reply_markup: {
            inline_keyboard: keyboard,
          },
        });
  }
};
// searc order actions
// show search form
const searchOrderAction = async (ctx, next) => {
  if (ctx.state.pathParams[0] === "searchOrder") {
    const formOpen = ctx.state.searchParams.get("formOpen");
    if (formOpen) {
      await store.setSession(ctx, "searchOrder");
      await ctx.replyWithHTML("<b>Поиск заказа по параметрам Номер заказа, фамилия имя, телефон, комментарий</b>" + ctx.state.sessionMsg.linkHTML());
      await ctx.answerCbQuery();
      return;
    }
    await searchOrderHandle(ctx, ctx.state.pathParams[1] ? + ctx.state.pathParams[1] : 0);
    await ctx.answerCbQuery();
  } else {
    return next();
  }
};

exports.searchProductAction = searchProductAction;
exports.searchProductHandle = searchProductHandle;
exports.algoliaIndexProducts = algoliaIndexProducts;
exports.searchOrderHandle = searchOrderHandle;
exports.searchOrderAction = searchOrderAction;
