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
  try {
    // get resalts from algolia
    const resalt = await index.search(searchText, {
      attributesToRetrieve: ["name", "productId", "brand"],
      hitsPerPage: 5,
      page,
    });
    console.log(resalt);
    for (const product of resalt.hits) {
      inlineKeyboard.push([
        {
          text: `${product.brand ? product.brand + " " : ""}${product.name} (${product.productId})`,
          callback_data: `p/${product.productId}?o=absemetov`,
        },
      ]);
    }
    // Set load more button
    const prevNext = [];
    if (resalt.page > 0) {
      prevNext.push({text: "⬅️ Назад",
        callback_data: `search/${searchText}?p=${resalt.page - 1}`});
    }
    if (resalt.page + 1 !== resalt.nbPages) {
      prevNext.push({text: "➡️ Вперед",
        callback_data: `search/${searchText}?p=${resalt.page + 1}`});
    }
    inlineKeyboard.push(prevNext);
    const media = await photoCheckUrl();
    const caption = `<b>&#171;${searchText}&#187; знайдено ${resalt.nbHits} товарів Страница ${page + 1} из ${resalt.nbPages}</b>`;
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
  ctx.state.sessionMsg.url.searchParams.set("search", true);
  if (ctx.state.param) {
    await searchHandle(ctx, ctx.state.param, + ctx.state.params.get("p"));
    return;
  }
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
