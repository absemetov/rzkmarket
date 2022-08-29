const algoliasearch = require("algoliasearch");
const searchHandle = async (ctx) => {
  const client = algoliasearch(process.env.ALGOLIA_ID, process.env.ALGOLIA_ADMIN_KEY);
  const index = client.initIndex("products");
  const inlineKeyboard = [];
  try {
    const message = ctx.message || ctx.editedMessage;
    const resalt = await index.search(message.text);
    for (const product of resalt.hits) {
      const addButton = {text: `${product.objectID} ${product.name} ${product.price} ${product.currency}`,
        callback_data: `p/${product.objectID}?o=absemetov`};
      inlineKeyboard.push([addButton]);
    }
    await ctx.reply(`Search resalts: ${resalt.nbHits}`, {
      reply_markup: {
        inline_keyboard: inlineKeyboard,
      },
    });
  } catch (error) {
    await ctx.reply(`Algolia error: ${error}`);
  }
};

exports.searchHandle = searchHandle;
