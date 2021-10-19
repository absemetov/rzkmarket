// const {Scenes: {BaseScene}} = require("telegraf");
const functions = require("firebase-functions");
const firebase = require("firebase-admin");
const moment = require("moment");
require("moment/locale/ru");
moment.locale("ru");
// const {getMainKeyboard} = require("./bot_keyboards.js");
// const start = new BaseScene("start");
// set default project
const botConfig = functions.config().env.bot;
const startActions = [];
// Parse callback data, add Cart instance
const parseUrl = async (ctx, next) => {
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
// cart instance
const cart = async (ctx, next) => {
  const cart = {
    userQuery: firebase.firestore().collection("users").doc(`${ctx.from.id}`),
    orderQuery: firebase.firestore().collection("orders"),
    serverTimestamp: Math.floor(Date.now() / 1000),
    async getUserData() {
      const userRef = await this.userQuery.get();
      if (userRef.exists) {
        return {id: userRef.id, ...userRef.data()};
      }
      return null;
    },
    async add(product, qty) {
      qty = Number(qty);
      let productData = {};
      if (qty) {
        // add product to cart or edit
        if (typeof product == "object") {
          productData = {
            [product.id]: {
              name: product.name,
              price: product.price,
              unit: product.unit,
              qty: qty,
              createdAt: this.serverTimestamp,
            },
          };
        } else {
          productData = {
            [product]: {
              qty: qty,
            },
          };
        }
        await this.userQuery.set({
          cart: {
            products: productData,
          },
        }, {merge: true});
      } else {
        // delete product from cart
        await this.userQuery.set({
          cart: {
            products: {
              [typeof product == "object" ? product.id : product]: firebase.firestore.FieldValue.delete(),
            },
          },
        }, {merge: true});
      }
    },
    async products() {
      const products = [];
      const user = await this.getUserData();
      if (user) {
        if (user.cart && user.cart.products) {
          const cartProducts = user.cart.products;
          for (const [id, product] of Object.entries(cartProducts)) {
            products.push({id, ...product});
          }
        }
      }
      // sort products by orderNumber
      products.sort(function(a, b) {
        return a.createdAt - b.createdAt;
      });
      return products;
    },
    async clear() {
      await this.userQuery.set({
        cart: {
          products: firebase.firestore.FieldValue.delete(),
        },
      }, {merge: true});
    },
    async setOrderData(value) {
      await this.userQuery.set({
        cart: {
          orderData: value,
        },
      }, {merge: true});
    },
    async getSessionData(value) {
      const user = await this.getUserData();
      if (user && user.session) {
        return user.session;
      }
      return {};
    },
    async setSessionData(value) {
      await this.userQuery.set({
        session: {
          ...value,
        },
      }, {merge: true});
    },
    async saveOrder() {
      // set counter
      await this.userQuery.set({
        orderCount: firebase.firestore.FieldValue.increment(1),
      }, {merge: true});
      const user = await this.getUserData();
      await this.orderQuery.add({
        userId: user.id,
        orderId: user.orderCount,
        fromBot: true,
        products: user.cart.products,
        createdAt: this.serverTimestamp,
        ...user.cart.orderData,
      });
      // clear cart
      await this.clear();
    },
  };
  ctx.state.cart = cart;
  return next();
};
// inline keyboard
const startKeyboard = [
  {text: "📁 Каталог", callback_data: "c"},
  {text: "🛒 Корзина", callback_data: "cart"},
];

const ordersKeyboard = [
  {text: "🧾 Заказы", callback_data: "orders"},
];

// start handler
const startHandler = async (ctx) => {
  const cartProductsArray = await ctx.state.cart.products();
  startKeyboard[1].text = "🛒 Корзина";
  if (cartProductsArray.length) {
    startKeyboard[1].text += ` (${cartProductsArray.length})`;
  }
  // ctx.reply("Выберите меню", getMainKeyboard);
  // ctx.reply("Welcome to Rzk.com.ru! Monobank rates /mono Rzk Catalog /catalog");
  // reply with photo necessary to show ptoduct
  await ctx.replyWithPhoto("https://picsum.photos/450/150/?random",
      {
        caption: `<b>${botConfig.name}</b>`,
        parse_mode: "html",
        reply_markup: {
          remove_keyboard: true,
          inline_keyboard: [startKeyboard, ordersKeyboard],
        },
      });
  // set commands
  await ctx.telegram.setMyCommands([
    {"command": "start", "description": `${botConfig.name}`},
    {"command": "upload", "description": "Upload goods"},
    {"command": "mono", "description": "Monobank exchange rates "},
  ]);
  // ctx.scene.enter("catalog");
};
// main route
startActions.push(async (ctx, next) => {
  if (ctx.state.routeName === "start") {
    const cartProductsArray = await ctx.state.cart.products();
    startKeyboard[1].text = "🛒 Корзина";
    if (cartProductsArray.length) {
      startKeyboard[1].text += ` (${cartProductsArray.length})`;
    }
    await ctx.editMessageMedia({
      type: "photo",
      media: "https://picsum.photos/450/150/?random",
      caption: `<b>${botConfig.name}</b>`,
      parse_mode: "html",
    }, {
      reply_markup: {
        inline_keyboard: [startKeyboard, ordersKeyboard],
      },
    });
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// orders Handler
startActions.push(async (ctx, next) => {
  // show order
  if (ctx.state.routeName === "orders") {
    // inline keyboard
    const inlineKeyboardArray = [];
    const orderId = ctx.state.param;
    let caption = `<b>${botConfig.name} > Заказ</b>`;
    if (orderId) {
      caption = `<b>${botConfig.name} > Заказы</b>`;
    } else {
      // show orders
      const limit = 1;
      const startAfter = ctx.state.params.get("s");
      const endBefore = ctx.state.params.get("e");
      const mainQuery = firebase.firestore().collection("orders").orderBy("createdAt", "desc");
      let query = mainQuery;
      if (startAfter) {
        const startAfterProduct = await firebase.firestore().collection("orders")
            .doc(startAfter).get();
        query = query.startAfter(startAfterProduct);
      }
      // prev button
      if (endBefore) {
        const endBeforeProduct = await firebase.firestore().collection("orders")
            .doc(endBefore).get();
        // set limit
        query = query.endBefore(endBeforeProduct).limitToLast(limit);
      } else {
        // defaul limit
        query = query.limit(limit);
      }
      // get Products
      const ordersSnapshot = await query.get();
      ordersSnapshot.docs.forEach((doc) => {
        const order = {id: doc.id, ...doc.data()};
        const date = moment.unix(order.createdAt);
        inlineKeyboardArray.push([{text: `🧾 Заказ #${order.orderId}, ${date.fromNow()}`,
          callback_data: `orders/${order.id}`}]);
      });
      // Set load more button
      if (!ordersSnapshot.empty) {
        const prevNext = [];
        // endBefore prev button e paaram
        const endBeforeSnap = ordersSnapshot.docs[0];
        const ifBeforeProducts = await mainQuery.endBefore(endBeforeSnap).limitToLast(1).get();
        if (!ifBeforeProducts.empty) {
          // inlineKeyboardArray.push(Markup.button.callback("⬅️ Back",
          //    `c/${currentCatalog.id}?endBefore=${endBefore.id}&tag=${params.get("tag")}`));
          prevNext.push({text: "⬅️ Назад", callback_data: `orders?e=${endBeforeSnap.id}`});
        }
        // startAfter
        const startAfterSnap = ordersSnapshot.docs[ordersSnapshot.docs.length - 1];
        const ifAfterProducts = await mainQuery.startAfter(startAfterSnap).limit(1).get();
        if (!ifAfterProducts.empty) {
          // startAfter iqual s
          // inlineKeyboardArray.push(Markup.button.callback("➡️ Load more",
          //    `c/${currentCatalog.id}?startAfter=${startAfter.id}&tag=${params.get("tag")}`));
          prevNext.push({text: "➡️ Вперед",
            callback_data: `orders?s=${startAfterSnap.id}`});
        }
        inlineKeyboardArray.push(prevNext);
      }
    }
    inlineKeyboardArray.push([{text: "🏠 Главная", callback_data: "start"}]);
    await ctx.editMessageMedia({
      type: "photo",
      media: "https://picsum.photos/450/150/?random",
      caption,
      parse_mode: "html",
    }, {
      reply_markup: {
        inline_keyboard: inlineKeyboardArray,
      },
    });
  } else {
    return next();
  }
});
// start.hears("where", (ctx) => ctx.reply("You are in start scene"));


// exports.start = start;
exports.startActions = startActions;
exports.startHandler = startHandler;
exports.parseUrl = parseUrl;
exports.botConfig = botConfig;
exports.cart = cart;
