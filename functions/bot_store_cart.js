const functions = require("firebase-functions");
const firebase = require("firebase-admin");
const botConfig = functions.config().env.bot;
// store inst
const store = {
  async findRecord(path, field) {
    const modelSnap = await this.getQuery(path).get();
    if (modelSnap.exists) {
      if (field) {
        // find nested data
        const fields = field.split(".");
        let fieldData = modelSnap.data();
        let iteration = 0;
        fields.forEach((fieldItem) => {
          if (fieldData[fieldItem]) {
            fieldData = fieldData[fieldItem];
            iteration ++;
          }
        });
        if (iteration === fields.length && Object.keys(fieldData).length) {
          return {...fieldData};
        } else {
          return null;
        }
      } else {
        return {id: modelSnap.id, ...modelSnap.data()};
      }
    }
    return null;
  },
  async createRecord(path, field) {
    // nested "dot notation" not work!!!
    await this.getQuery(path).set({
      ...field,
    }, {merge: true});
  },
  async updateRecord(path, field) {
    // nested "dot notation" work only when update exist doc
    // worning!!! be careful siblings data cleare!!! use createRecord
    await this.getQuery(path).update({
      ...field,
    });
  },
  async deleteRecord(path, field) {
    await this.getQuery(path).set({
      [field]: firebase.firestore.FieldValue.delete(),
    }, {merge: true});
  },
  async findAll(collectionName) {
    const modelSnap = await firebase.firestore().collection(collectionName).get();
    const outputArray = [];
    modelSnap.docs.forEach((model) => {
      outputArray.push({id: model.id, ...model.data()});
    });
    return outputArray;
  },
  getQuery(path) {
    return firebase.firestore().doc(path);
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
  sort(field) {
    const sortedArray = [];
    if (field) {
      for (const [id, product] of Object.entries(field)) {
        sortedArray.push({id, ...product});
      }
      // sort products by createdAt
      sortedArray.sort(function(a, b) {
        return a.createdAt - b.createdAt;
      });
    }
    return sortedArray;
  },
  formatOrderNumber(userId, orderNumber) {
    return `${userId}-${("000" + orderNumber).slice(-4)}`;
  },
};

// cart instance
const cart = {
  async add(objectId, userId, product, qty) {
    qty = Number(qty);
    let products = {};
    if (qty) {
      // add product to cart or edit
      if (typeof product == "object") {
        products = {
          [product.id]: {
            name: product.name,
            price: product.price,
            unit: product.unit,
            qty: qty,
            createdAt: Math.floor(Date.now() / 1000),
          },
        };
      } else {
        products = {
          [product]: {
            qty: qty,
          },
        };
      }
      await store.createRecord(`objects/${objectId}/carts/${userId}`, {products});
    } else {
      // delete products
      if (typeof product !== "object") {
        await store.createRecord(`objects/${objectId}/carts/${userId}`,
            {"products": {
              [product]: firebase.firestore.FieldValue.delete(),
            }});
      }
    }
  },
  async products(objectId, userId) {
    const cartProducts = await store.findRecord(`objects/${objectId}/carts/${userId}`, "products");
    return store.sort(cartProducts);
  },
  async clear(objectId, userId) {
    await store.createRecord(`objects/${objectId}/carts/${userId}`, {"products": null});
  },
  async createOrder(ctx) {
    const userId = ctx.from.id;
    await store.createRecord(`users/${userId}`, {orderCount: firebase.firestore.FieldValue.increment(1)});
    const userData = await store.findRecord(`users/${userId}`);
    const objectId = userData.session.objectId;
    const orderQuery = firebase.firestore().collection("objects").doc(objectId).collection("orders");
    const cartProducts = await store.findRecord(`objects/${objectId}/carts/${userId}`, "products");
    const object = await store.findRecord(`objects/${objectId}`);
    await orderQuery.add({
      userId: + userData.id,
      objectId,
      objectName: object.name,
      orderNumber: userData.orderCount,
      statusId: 1,
      fromBot: true,
      products: cartProducts,
      createdAt: Math.floor(Date.now() / 1000),
      ...userData.session.wizardData,
    });
    await this.clear(objectId, userId);
    // notify admin
    await ctx.telegram.sendMessage(94899148, `<b>New order from bot! Object ${object.name} ` +
    `<a href="tg://user?id=${ctx.from.id}">User ${ctx.from.id}</a></b>`, {parse_mode: "html"});
  },
  async cartButtons(objectId, userId) {
    // get cart count
    const cartProducts = await store.findRecord(`objects/${objectId}/carts/${userId}`, "products");
    return [
      {text: "🏪 Главная", callback_data: `objects/${objectId}`},
      {text: `🛒 Корзина (${cartProducts && Object.keys(cartProducts).length || 0})`,
        callback_data: `cart?o=${objectId}`},
    ];
  },
  async cartCount(objectId, userId) {
    // get cart count
    const cartProducts = await store.findRecord(`objects/${objectId}/carts/${userId}`, "products");
    return cartProducts && Object.keys(cartProducts).length || 0;
  },
};

exports.store = store;
exports.cart = cart;
