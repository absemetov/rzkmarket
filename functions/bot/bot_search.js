const {photoCheckUrl} = require("./bot_store_cart");
const algoliasearch = require("algoliasearch");
// const {highlight} = require("instantsearch.js/cjs/helpers");
// ctx.state.sessionMsg.url.searchParams.set("message", "Nadir Genius!");
// ctx.state.sessionMsg.url.searchParams.delete("message1");
// ctx.state.sessionMsg.url.searchParams.delete("message");
const searchHandle = async (ctx, searchText, page = 0) => {
  const client = algoliasearch(process.env.ALGOLIA_ID, process.env.ALGOLIA_ADMIN_KEY);
  const index = client.initIndex(`${process.env.ALGOLIA_PREFIX}products`);
  const inlineKeyboard = [];
  inlineKeyboard.push([{text: "⤴️ ../Главная", callback_data: "objects"}, {text: "🔍 Поиск товаров", callback_data: "search"}]);
  try {
    // get resalts from algolia
    const resalt = await index.search(searchText, {
      attributesToRetrieve: ["name", "productId", "brand", "seller", "sellerId"],
      hitsPerPage: 5,
      page,
    });
    for (const product of resalt.hits) {
      inlineKeyboard.push([
        {
          text: `${product.brand ? product.brand + " " : ""}${product.name} (${product.productId}) - ${product.seller}`,
          callback_data: `p/${product.productId}?o=${product.sellerId}`,
        },
      ]);
    }
    // Set load more button
    const prevNext = [];
    if (resalt.page > 0) {
      prevNext.push({text: "⬅️ Назад",
        callback_data: `search/${resalt.page - 1}`});
    }
    if (resalt.nbPages && (resalt.page + 1 !== resalt.nbPages)) {
      prevNext.push({text: "➡️ Вперед",
        callback_data: `search/${resalt.page + 1}`});
    }
    inlineKeyboard.push(prevNext);
    const media = await photoCheckUrl();
    ctx.state.sessionMsg.url.searchParams.delete("search");
    ctx.state.sessionMsg.url.searchParams.set("search_text", searchText);
    ctx.state.sessionMsg.url.searchParams.set("page", page);
    let caption;
    if (resalt.nbHits) {
      caption = `<b>&#171;${searchText}&#187; знайдено ${resalt.nbHits} товарів Страница ${page + 1} из ${resalt.nbPages}</b>` + ctx.state.sessionMsg.linkHTML();
    } else {
      caption = `<b>&#171;${searchText}&#187; за Вашим запитом нічого не знайдено</b>` + ctx.state.sessionMsg.linkHTML();
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

const searchIndex = async (ctx) => {
  if (ctx.state.param) {
    const searchText = ctx.state.sessionMsg.url.searchParams.get("search_text");
    await searchHandle(ctx, searchText, + ctx.state.param);
    return;
  }
  // open search dialog
  ctx.state.sessionMsg.url.searchParams.set("search", true);
  await ctx.replyWithHTML("<b>Что вы ищете?</b>" + ctx.state.sessionMsg.linkHTML(),
      {
        reply_markup: {
          force_reply: true,
        },
      });
};
// actions
const searchActions = [];

searchActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "search") {
    await searchIndex(ctx);
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

exports.searchIndex = searchIndex;
exports.searchHandle = searchHandle;
exports.searchActions = searchActions;
