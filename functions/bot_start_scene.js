// const {Scenes: {BaseScene}} = require("telegraf");
const firebase = require("firebase-admin");
// const {getMainKeyboard} = require("./bot_keyboards.js");
// const start = new BaseScene("start");
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
        ...user.cart.orderData,
      });
    },
  };
  ctx.state.cart = cart;
  return next();
};

// start.enter(async (ctx) => {
//   // ctx.reply("Выберите меню", getMainKeyboard);
//   // ctx.reply("Welcome to Rzk.com.ru! Monobank rates /mono Rzk Catalog /catalog");
//   // reply with photo necessary to show ptoduct
//   await ctx.replyWithPhoto("https://picsum.photos/450/150/?random",
//       {
//         caption: "Welcome to Rzk Market Ukraine 🇺🇦",
//         parse_mode: "Markdown",
//         reply_markup: {
//           remove_keyboard: true,
//           inline_keyboard: [[
//             {text: "📁 Catalog", callback_data: "c"},
//             {text: "🛒 Cart", callback_data: "cart"},
//           ]],
//         },
//       });
//   // set commands
//   await ctx.telegram.setMyCommands([
//     {"command": "start", "description": "RZK Market Shop"},
//     {"command": "upload", "description": "Upload goods"},
//     {"command": "mono", "description": "Monobank exchange rates "},
//   ]);
//   ctx.scene.enter("catalog");
// });

// start.hears("where", (ctx) => ctx.reply("You are in start scene"));

startActions.push(async (ctx, next) => {
  if (ctx.state.routeName === "start") {
    await ctx.editMessageMedia({
      type: "photo",
      media: "https://picsum.photos/450/150/?random",
      caption: "Welcome to Rzk Market Ukraine 🇺🇦",
      parse_mode: "Markdown",
    }, {
      reply_markup: {
        inline_keyboard: [[
          {text: "📁 Catalog", callback_data: "c"},
          {text: "🛒 Cart", callback_data: "cart"},
        ]],
      },
    });
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// exports.start = start;
exports.startActions = startActions;
exports.parseUrl = parseUrl;
exports.cart = cart;
