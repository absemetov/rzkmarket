const functions = require("firebase-functions");
const firebase = require("firebase-admin");
const botConfig = functions.config().env.bot;
// store inst
const store = {
  async queryRecord(modelName, queryObject) {
    if (queryObject.objectId) {
      const modelSnap = await firebase.firestore().collection("objects").doc(queryObject.objectId)
          .collection(modelName).doc(queryObject.id).get();
      // snap
      if (queryObject.snap) {
        return modelSnap;
      }
      // check data
      if (modelSnap.exists) {
        const data = modelSnap.data();
        const sortedArray = [];
        if (queryObject.sort) {
          for (const [id, product] of Object.entries(modelSnap.data()[queryObject.sort])) {
            sortedArray.push({id, ...product});
          }
          // sort products by createdAt
          sortedArray.sort(function(a, b) {
            return a.createdAt - b.createdAt;
          });
          data[queryObject.sort] = sortedArray;
        }
        return {"id": modelSnap.id, ...data};
      }
    }
    return null;
  },
  async createRecord(modelName, dataObject) {
    // merge true
    if (dataObject.objectId) {
      const query = firebase.firestore().collection("objects").doc(dataObject.objectId)
          .collection(modelName).doc(dataObject.id);
      const dataSet = {};
      for (const [key, value] of Object.entries(dataObject)) {
        console.log(`${key}: ${value}`);
        if (key !== "id" || key !== "objectId") {
          dataSet[key] = value;
        }
      }
      await query.set({
        ...dataSet,
      }, {merge: true});
    }
  },
};

// cart instance
const cart = {
  userQuery: firebase.firestore().collection("users").doc(`${ctx.from.id}`),
  serverTimestamp: Math.floor(Date.now() / 1000),
  async getUserData() {
    const userRef = await this.userQuery.get();
    if (userRef.exists) {
      return {id: + userRef.id, ...userRef.data()};
    }
    return {};
  },
  async add(objectId, userId, product, qty) {
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
      // await this.cartQuery(objectId).set({
      //   products: productData,
      // }, {merge: true});
      await store.createRecord("carts", {objectId, id: userId, products: productData});
    } else {
      // delete product from cart
      // await this.cartQuery(objectId).set({
      //   products: {
      //     [typeof product == "object" ? product.id : product]: firebase.firestore.FieldValue.delete(),
      //   },
      // }, {merge: true});
      await store.createRecord("carts", {objectId, id: userId, products: {
        [typeof product == "object" ? product.id : product]: firebase.firestore.FieldValue.delete(),
      }});
    }
  },
  async products(objectId, userId) {
    // const products = [];
    // const cart = await this.cartQuery(objectId).get();
    const cart = await store.queryRecord("carts", {objectId, id: userId, sort: "products"});
    // if (cart.exists && cart.data().products) {
    //   for (const [id, product] of Object.entries(cart.data().products)) {
    //     products.push({id, ...product});
    //   }
    // }
    // // sort products by createdAt
    // products.sort(function(a, b) {
    //   return a.createdAt - b.createdAt;
    // });
    return cart.products;
  },
  async clear(objectId, withOrderData) {
    const clearData = {};
    // clear order tmp data
    if (withOrderData) {
      clearData.cart = {
        orderData: firebase.firestore.FieldValue.delete(),
        products: firebase.firestore.FieldValue.delete(),
      };
    }
    // clear cart
    await this.cartQuery(objectId).set({
      products: firebase.firestore.FieldValue.delete(),
    }, {merge: true});
  },
  async setWizardData(value) {
    await this.userQuery.set({
      wizardData: value,
    }, {merge: true});
  },
  async getOrderData() {
    const user = await this.getUserData();
    if (user && user.orderData) {
      return user.orderData;
    }
    return {};
  },
  async getWizardData() {
    const user = await this.getUserData();
    if (user.wizardData) {
      return user.wizardData;
    }
    return {};
  },
  async setUserName(value) {
    await this.userQuery.set({
      userName: value,
    }, {merge: true});
  },
  async saveOrder(id, setData) {
    const session = await this.getSessionData();
    const objectId = session.objectId;
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
      const cart = await this.cartQuery(objectId).get();
      const object = await firebase.firestore().collection("objects").doc(objectId).get();
      await orderQuery.add({
        userId: user.id,
        objectId,
        objectName: object.data().name,
        orderId: user.orderCount,
        statusId: 1,
        fromBot: true,
        products: cart.data().products,
        createdAt: this.serverTimestamp,
        ...user.wizardData,
      });
    }
    // clear cart delete orderId from cart
    await this.clear(objectId, id);
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
    return user.session || {};
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
  async cartButtons(objectId) {
    // get cart count
    const cart = await this.cartQuery(objectId).get();
    const cartCount = cart.exists && cart.data().products && Object.keys(cart.data().products).length || 0;
    return [
      {text: "🏪 Главная", callback_data: `objects/${objectId}`},
      {text: `🛒 Корзина (${cartCount})`, callback_data: `cart?o=${objectId}`},
    ];
  },
};

exports.store = store;
exports.cart = cart;
