// const {Scenes: {BaseScene}} = require("telegraf");
const functions = require("firebase-functions");
const firebase = require("firebase-admin");
const {uploadHandler} = require("./bot_upload_scene");
// const {getMainKeyboard} = require("./bot_keyboards.js");
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
// cart instance
const cart = async (ctx, next) => {
  const cart = {
    objectId: null,
    userQuery: firebase.firestore().collection("users").doc(`${ctx.from.id}`),
    serverTimestamp: Math.floor(Date.now() / 1000),
    cartQuery(objectId) {
      return firebase.firestore().collection("objects").doc(objectId)
          .collection("carts").doc(`${ctx.from.id}`);
    },
    async getUserData() {
      const userRef = await this.userQuery.get();
      if (userRef.exists) {
        return {id: + userRef.id, ...userRef.data()};
      }
      return null;
    },
    async add(objectId, product, qty) {
      this.objectId = objectId;
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
        await this.cartQuery(objectId).set({
          products: productData,
        }, {merge: true});
      } else {
        // delete product from cart
        await this.cartQuery(objectId).set({
          products: {
            [typeof product == "object" ? product.id : product]: firebase.firestore.FieldValue.delete(),
          },
        }, {merge: true});
      }
    },
    async products(objectId) {
      const products = [];
      const cart = await this.cartQuery(objectId).get();
      if (cart.exists) {
        for (const [id, product] of Object.entries(cart.data().products)) {
          products.push({id, ...product});
        }
      }
      // sort products by createdAt
      products.sort(function(a, b) {
        return a.createdAt - b.createdAt;
      });
      return products;
    },
    async clear(withOrderData, objectId) {
      const clearData = {};
      if (withOrderData) {
        clearData.cart = {
          orderData: firebase.firestore.FieldValue.delete(),
          products: firebase.firestore.FieldValue.delete(),
        };
      } else {
        clearData.cart = {
          products: firebase.firestore.FieldValue.delete(),
        };
      }
      await this.cartQuery(objectId).set({
        ...clearData,
      }, {merge: true});
    },
    async setWizardData(value) {
      await this.userQuery.set({
        cart: {
          wizardData: value,
        },
      }, {merge: true});
    },
    async getOrderData() {
      const user = await this.getUserData();
      if (user && user.cart.orderData) {
        return user.cart.orderData;
      }
      return {};
    },
    async getWizardData() {
      const user = await this.getUserData();
      if (user && user.cart.wizardData) {
        return user.cart.wizardData;
      }
      return {};
    },
    async setCartData(value) {
      await this.userQuery.set({
        cart: {
          ...value,
        },
      }, {merge: true});
    },
    async setUserName(value) {
      await this.userQuery.set({
        ...value,
      }, {merge: true});
    },
    async saveOrder(id, setData, objectId) {
      const orderQuery = firebase.firestore().collection("objects").doc(objectId).collection("orders");
      // edit order
      if (id) {
        const order = orderQuery.doc(id);
        // delete order products
        await order.set({
          updatedAt: this.serverTimestamp,
          ...setData,
        }, {merge: true});
      } else {
        // create new order
        // set counter
        await this.userQuery.set({
          orderCount: firebase.firestore.FieldValue.increment(1),
        }, {merge: true});
        const user = await this.getUserData();
        await orderQuery.add({
          userId: user.id,
          orderId: user.orderCount,
          statusId: 1,
          fromBot: true,
          products: user.cart.products,
          createdAt: this.serverTimestamp,
          ...user.cart.wizardData,
        });
      }
      // clear cart delete orderId from cart
      await this.clear(id, objectId);
    },
    payments() {
      const paymentsTxt = botConfig.payment;
      const paymentsMap = new Map();
      if (paymentsTxt) {
        for (const paramsData of paymentsTxt.split("&")) {
          paymentsMap.set(+ paramsData.split("=")[0], paramsData.split("=")[1].trim());
        }
      }
      return paymentsMap;
    },
    carriers() {
      const carriersTxt = botConfig.carrier;
      const carriersMap = new Map();
      if (carriersTxt) {
        for (const paramsData of carriersTxt.split("&")) {
          carriersMap.set(+ paramsData.split("=")[0], paramsData.split("=")[1].trim());
        }
      }
      return carriersMap;
    },
    statuses() {
      const statusesTxt = botConfig.status;
      const statusesMap = new Map();
      if (statusesTxt) {
        for (const paramsData of statusesTxt.split("&")) {
          statusesMap.set(+ paramsData.split("=")[0], paramsData.split("=")[1].trim());
        }
      }
      return statusesMap;
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
    async objects() {
      const objectsQuery = await firebase.firestore().collection("objects").get();
      const objects = [];
      objectsQuery.docs.forEach((object) => {
        objects.push({id: object.id, ...object.data()});
      });
      return objects;
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

// start handler
const startHandler = async (ctx) => {
  // const cartProductsArray = await ctx.state.cart.products();
  // if (cartProductsArray.length) {
  //   startKeyboard[1].text += ` (${cartProductsArray.length})`;
  // }
  // add orders keyboard
  const inlineKeyboardArray = [];
  // adminKeyboard.push(startKeyboard);
  // if (ctx.state.isAdmin) {
  //   adminKeyboard.push([{text: "🧾 Заказы", callback_data: "orders"}]);
  // } else {
  //   adminKeyboard.push([{text: "🧾 Мои заказы", callback_data: `myOrders/${ctx.from.id}`}]);
  // }
  // ctx.reply("Выберите меню", getMainKeyboard);
  // ctx.reply("Welcome to Rzk.com.ru! Monobank rates /mono Rzk Catalog /catalog");
  // reply with photo necessary to show ptoduct
  // get all Objects
  const objects = await ctx.state.cart.objects();
  objects.forEach((object) => {
    inlineKeyboardArray.push([{text: object.name, callback_data: `objects/${object.id}`}]);
  });
  await ctx.replyWithPhoto("https://picsum.photos/450/150/?random",
      {
        caption: `<b>${botConfig.name} > Выберите торговый объект</b>`,
        parse_mode: "html",
        reply_markup: {
          inline_keyboard: inlineKeyboardArray,
        },
      });
  // set commands
  await ctx.telegram.setMyCommands([
    {"command": "objects", "description": `${botConfig.name} объекты`},
    {"command": "upload", "description": "Upload goods"},
    {"command": "mono", "description": "Monobank exchange rates "},
  ]);
  // ctx.scene.enter("catalog");
};
// main route
startActions.push(async (ctx, next) => {
  if (ctx.state.routeName === "start") {
    // add orders keyboard
    // add orders keyboard
    const adminKeyboard = [];
    adminKeyboard.push(startKeyboard);
    if (ctx.state.isAdmin) {
      adminKeyboard.push([{text: "🧾 Заказы", callback_data: "orders"}]);
    } else {
      adminKeyboard.push([{text: "🧾 Мои заказы", callback_data: `myOrders/${ctx.from.id}`}]);
    }
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
        inline_keyboard: adminKeyboard,
      },
    });
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// objects
startActions.push(async (ctx, next) => {
  if (ctx.state.routeName === "objects") {
    const objectId = ctx.state.param;
    const uploadGoods = ctx.state.params.get("uploadGoods");
    let caption = `<b>${botConfig.name} > Торговые объекты</b>`;
    const inlineKeyboardArray = [];
    if (objectId) {
      // get data obj
      const objectSnap = await firebase.firestore().collection("objects").doc(objectId).get();
      const object = {"id": objectSnap.id, ...objectSnap.data()};
      if (uploadGoods) {
        await uploadHandler(ctx, objectId, object.spreadsheets);
      }
      // show object info
      caption = `<b>${botConfig.name} > Торговый объект #${object.name}\n` +
        `Контакты: ${object.phoneNumber}\n` +
        `Адрес: ${object.address}\n` +
        `spreadsheets: ${object.spreadsheets}\n` +
        `Описание: ${object.description}</b>`;
      const dateTimestamp = Math.floor(Date.now() / 1000);
      // buttons
      inlineKeyboardArray.push([{text: "Каталог", callback_data: `c?o=${object.id}`}]);
      inlineKeyboardArray.push([{text: "Загрузить товары", callback_data: `objects/${object.id}?uploadGoods=1`}]);
      inlineKeyboardArray.push([{text: "Торговые объекты", callback_data: `objects?${dateTimestamp}`}]);
    } else {
      // show all objects
      const objects = await ctx.state.cart.objects();
      objects.forEach((object) => {
        inlineKeyboardArray.push([{text: object.name, callback_data: `objects/${object.id}`}]);
      });
    }
    // render data
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
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

exports.startActions = startActions;
exports.startHandler = startHandler;
exports.isAdmin = isAdmin;
exports.parseUrl = parseUrl;
exports.botConfig = botConfig;
exports.cart = cart;
exports.roundNumber = roundNumber;
