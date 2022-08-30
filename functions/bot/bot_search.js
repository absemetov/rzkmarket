const {photoCheckUrl} = require("./bot_store_cart");
const algoliasearch = require("algoliasearch");
// const {highlight} = require("instantsearch.js/cjs/helpers");
// ctx.state.sessionMsg.url.searchParams.set("message", "Nadir Genius!");
// ctx.state.sessionMsg.url.searchParams.delete("message1");
// ctx.state.sessionMsg.url.searchParams.delete("message");
const searchHandle = async (ctx) => {
  const client = algoliasearch(process.env.ALGOLIA_ID, process.env.ALGOLIA_ADMIN_KEY);
  const index = client.initIndex(`${process.env.ALGOLIA_PREFIX}products`);
  const inlineKeyboard = [];
  try {
    const message = ctx.message || ctx.editedMessage;
    // get resalts from algolia
    const resalt = await index.search(message.text, {
      attributesToRetrieve: ["name", "productId", "brand"],
      hitsPerPage: 5,
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
    const projectImg = await photoCheckUrl();
    await ctx.replyWithPhoto(projectImg,
        {
          caption: `<b>&#171;${message.text}&#187; знайдено ${resalt.nbHits} товарів</b>`,
          parse_mode: "html",
          reply_markup: {
            inline_keyboard: inlineKeyboard,
          },
        });
  } catch (error) {
    await ctx.reply(`Algolia error: ${error}`);
  }
};

const searchIndex = async (ctx) => {
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
