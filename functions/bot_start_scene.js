// const {Scenes: {BaseScene}} = require("telegraf");
const functions = require("firebase-functions");
const firebase = require("firebase-admin");
const bucket = firebase.storage().bucket();
const {store, cart} = require("./bot_keyboards.js");
// const start = new BaseScene("start");
// set default project
const botConfig = functions.config().env.bot;
const startActions = [];
// round to 2 decimals
const roundNumber = (num) => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};
// admin midleware
const isAdmin = (ctx, next) => {
  ctx.state.isAdmin = ctx.from.id === 94899148;
  return next();
};
// Parse callback data, add Cart instance
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

// inline keyboard
// const startKeyboard = [
//   {text: "📁 Каталог", callback_data: "c"},
//   {text: "🛒 Корзина", callback_data: "cart"},
// ];

// start handler show objects
const startHandler = async (ctx) => {
  // const cartProductsArray = await ctx.state.cart.products();
  // if (cartProductsArray.length) {
  //   startKeyboard[1].text += ` (${cartProductsArray.length})`;
  // }
  // add orders keyboard
  const inlineKeyboardArray = [];
  // adminKeyboard.push(startKeyboard);
  // ctx.reply("Выберите меню", getMainKeyboard);
  // ctx.reply("Welcome to Rzk.com.ru! Monobank rates /mono Rzk Catalog /catalog");
  // reply with photo necessary to show ptoduct
  // get all Objects
  const objects = await store.findAll("objects");
  objects.forEach((object) => {
    inlineKeyboardArray.push([{text: `🏪 ${object.name}`, callback_data: `objects/${object.id}`}]);
  });
  // if (ctx.state.isAdmin) {
  //   inlineKeyboardArray.push([{text: "🧾 Заказы", callback_data: "orders"}]);
  // } else {
  //   inlineKeyboardArray.push([{text: "🧾 Мои заказы", callback_data: `myOrders/${ctx.from.id}`}]);
  // }
  inlineKeyboardArray.push([{text: "🧾 Мои заказы", callback_data: `myO/${ctx.from.id}`}]);
  // add main photo
  // await bucket.makePublic();
  const publicImgUrl = bucket.file(botConfig.logo).publicUrl();
  await ctx.replyWithPhoto(publicImgUrl,
      {
        caption: `<b>${ctx.state.bot_first_name}</b>`,
        parse_mode: "html",
        reply_markup: {
          inline_keyboard: inlineKeyboardArray,
        },
      });
  // set commands
  // await ctx.telegram.setMyCommands([
  //   {"command": "objects", "description": `${ctx.state.bot_first_name} объекты`},
  //   {"command": "mono", "description": "Monobank exchange rates "},
  // ]);
  // ctx.scene.enter("catalog");
};
// main route
// startActions.push(async (ctx, next) => {
//   if (ctx.state.routeName === "start") {
//     // add orders keyboard
//     // add orders keyboard
//     const adminKeyboard = [];
//     adminKeyboard.push(startKeyboard);
//     if (ctx.state.isAdmin) {
//       adminKeyboard.push([{text: "🧾 Заказы", callback_data: "orders"}]);
//     } else {
//       adminKeyboard.push([{text: "🧾 Мои заказы", callback_data: `myOrders/${ctx.from.id}`}]);
//     }
//     const cartProductsArray = await ctx.state.cart.products();
//     startKeyboard[1].text = "🛒 Корзина";
//     if (cartProductsArray.length) {
//       startKeyboard[1].text += ` (${cartProductsArray.length})`;
//     }
//     await ctx.editMessageMedia({
//       type: "photo",
//       media: "https://picsum.photos/450/150/?random",
//       caption: `<b>${ctx.state.bot_first_name}</b>`,
//       parse_mode: "html",
//     }, {
//       reply_markup: {
//         inline_keyboard: adminKeyboard,
//       },
//     });
//     await ctx.answerCbQuery();
//   } else {
//     return next();
//   }
// });

// show objects
startActions.push(async (ctx, next) => {
  if (ctx.state.routeName === "objects") {
    const objectId = ctx.state.param;
    let caption = `<b>${ctx.state.bot_first_name}</b>`;
    const inlineKeyboardArray = [];
    if (objectId) {
      // get data obj
      // const objectSnap = await firebase.firestore().collection("objects").doc(objectId).get();
      // const object = {"id": objectSnap.id, ...objectSnap.data()};
      const object = await store.findRecord(`objects/${objectId}`);
      // show object info
      caption = `<b>${ctx.state.bot_first_name} > ${object.name}\n` +
        `Контакты: ${object.phoneNumber}\n` +
        `Адрес: ${object.address}\n` +
        `Описание: ${object.description}</b>`;
      // const dateTimestamp = Math.floor(Date.now() / 1000);
      // buttons
      const cartButtons = await cart.cartButtons(objectId, ctx.from.id);
      inlineKeyboardArray.push([{text: "📁 Каталог", callback_data: `c?o=${object.id}`}]);
      inlineKeyboardArray.push([cartButtons[1]]);
      if (ctx.state.isAdmin) {
        inlineKeyboardArray.push([{text: "🧾 Заказы admin", callback_data: `orders?o=${object.id}`}]);
        inlineKeyboardArray.push([{text: "📸 Загрузить фото каталогов",
          callback_data: `c?o=${object.id}&u=1`}]);
        inlineKeyboardArray.push([{text: "➕ Загрузить товары",
          callback_data: `uploadGoods/${object.id}`}]);
      }
      inlineKeyboardArray.push([{text: "🏠 Главная", callback_data: "objects"}]);
    } else {
      // show all objects
      // const objects = await ctx.state.cart.objects();
      const objects = await store.findAll("objects");
      objects.forEach((object) => {
        inlineKeyboardArray.push([{text: `🏪 ${object.name}`, callback_data: `objects/${object.id}`}]);
      });
      inlineKeyboardArray.push([{text: "🧾 Мои заказы", callback_data: `myO/${ctx.from.id}`}]);
    }
    // render data
    const publicImgUrl = bucket.file(botConfig.logo).publicUrl();
    await ctx.editMessageMedia({
      type: "photo",
      media: publicImgUrl,
      caption,
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
exports.roundNumber = roundNumber;
