const functions = require("firebase-functions");
const firebase = require("firebase-admin");
const botConfig = functions.config().env.bot;
// store inst
const store = {
  // async queryRecord(path, queryObject = {}) {
  //   const modelSnap = await this.getQuery(path).get();
  //   // check data
  //   if (modelSnap.exists) {
  //     const sortedArray = [];
  //     const data = modelSnap.data();
  //     if (queryObject.sort && data[queryObject.sort]) {
  //       for (const [id, product] of Object.entries(data[queryObject.sort])) {
  //         sortedArray.push({id, ...product});
  //       }
  //       // sort products by createdAt
  //       sortedArray.sort(function(a, b) {
  //         return a.createdAt - b.createdAt;
  //       });
  //       data[queryObject.sort] = sortedArray;
  //     }
  //     // output
  //     if (queryObject.single) {
  //       return sortedArray;
  //     } else {
  //       return {"id": modelSnap.id, ...data};
  //     }
  //   }
  //   return null;
  // },
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
        if (iteration === fields.length) {
          return {...fieldData};
        } else {
          return null;
        }
      } else {
        return {id: modelSnap.id, ...modelSnap.data()};
      }
    }
    // check data
    // if (modelSnap.exists) {
    // if (field) {
    //   const fields = field.split(".");
    //   let fieldData = modelSnap.data();
    //   fields.forEach((fieldItem) => {
    //     if (fieldData[fieldItem]) {
    //       fieldData = fieldData[fieldItem];
    //     }
    //   });
    //   return {...fieldData};
    // } else {
    //   return {id: modelSnap.id, ...modelSnap.data()};
    // }
    //   return modelSnap.data()[field];
    // }
    return null;
  },
  async createRecord(path, field) {
    // nested "dot notation" not work!!!
    await this.getQuery(path).set({
      ...field,
    }, {merge: true});
  },
  async updateRecord(path, field) {
    // nested "dot notation" work only when update first create doc
    // worning!!! be careful siblings data cleare!!! use createRecord
    await this.getQuery(path).update({
      ...field,
    });
  },
  async deleteRecord(path, field) {
    // const fields = field.split(".");
    // const fields = "session.orderData.yandex.ru".split(".");
    // const jsonStr = '{"session": {"order" : 1}}';
    // let output = "";
    // let quates = "";
    // fields.forEach((data) => {
    //   console.log(data);
    //   output += `{"${data}": `;
    //   quates += "}";
    // });
    // console.log(output+"1}}");
    // const obj = JSON.parse(output+`1${quates}`);
    // console.log(obj)
    // arraySave = [];
    // fields.forEach((data, index) => {
    //   if (arraySave[index - 1]) {
    //     if (index === fields.length - 1) {
    //       arraySave.push(arraySave[index - 1][data] = "delete");
    //     } else {
    //       arraySave.push(arraySave[index - 1][data]);
    //     }
    //   } else {
    //     arraySave.push(obj[data]);
    //   }
    // console.log(arraySave[index]);
    // });
    // console.log(obj["session"]["orderData"]);
    // console.log(obj);
    // {"session": {"order" : 1}}
    await this.getQuery(path).update({
      [field]: firebase.firestore.FieldValue.delete(),
    });
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
    // let query = firebase.firestore();
    // for (const [key, value] of Object.entries(modelObject)) {
    //   // doc id must be string!!!
    //   query = query.collection(key).doc(value.toString());
    // }
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
  // async getUserData(userId) {
  // const userRef = await this.userQuery.get();
  // if (userRef.exists) {
  //   return {id: + userRef.id, ...userRef.data()};
  // }
  // return {};
  // return store.findRecord("users", userId);
  // },
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
      // await this.cartQuery(objectId).set({
      //   products: productData,
      // }, {merge: true});
      await store.createRecord(`objects/${objectId}/carts/${userId}`, {products});
    } else {
      // delete product from cart
      // await this.cartQuery(objectId).set({
      //   products: {
      //     [typeof product == "object" ? product.id : product]: firebase.firestore.FieldValue.delete(),
      //   },
      // }, {merge: true});
      if (typeof product !== "object") {
        await store.deleteRecord(`objects/${objectId}/carts/${userId}`,
            `products.${typeof product == "object" ? product.id : product}`);
      }
    }
  },
  async products(objectId, userId) {
    // const cart = await this.cartQuery(objectId).get();
    const cartProducts = await store.findRecord(`objects/${objectId}/carts/${userId}`, "products");
    return store.sort(cartProducts);
  },
  async clear(objectId, userId) {
    // const clearData = {};
    // clear order tmp data
    // if (withOrderData) {
    //   clearData.cart = {
    //     orderData: firebase.firestore.FieldValue.delete(),
    //     products: firebase.firestore.FieldValue.delete(),
    //   };
    // }
    // // clear cart
    // await this.cartQuery(objectId).set({
    //   products: firebase.firestore.FieldValue.delete(),
    // }, {merge: true});
    await store.deleteRecord(`objects/${objectId}/carts/${userId}`, "products");
  },
  // async setWizardData(value) {
  //   await this.userQuery.set({
  //     wizardData: value,
  //   }, {merge: true});
  // },
  // async getOrderData() {
  //   const user = await this.getUserData();
  //   if (user && user.orderData) {
  //     return user.orderData;
  //   }
  //   return {};
  // },
  // async getWizardData() {
  //   const user = await this.getUserData();
  //   if (user.wizardData) {
  //     return user.wizardData;
  //   }
  //   return {};
  // },
  // async setUserName(value) {
  //   await this.userQuery.set({
  //     userName: value,
  //   }, {merge: true});
  // },
  async createOrder(ctx) {
    // const session = await this.getSessionData();
    const userId = ctx.from.id;
    await store.createRecord(`users/${userId}`, {orderCount: firebase.firestore.FieldValue.increment(1)});
    const userData = await store.findRecord(`users/${userId}`);
    const objectId = userData.session.objectId;
    const orderQuery = firebase.firestore().collection("objects").doc(objectId).collection("orders");
    // edit order
    // if (id) {
    //   const order = orderQuery.doc(id);
    //   // delete order products
    //   await order.set({
    //     updatedAt: this.serverTimestamp,
    //     ...setData,
    //   }, {merge: true});
    // } else {
    // create new order
    // await this.userQuery.set({
    //   orderCount: firebase.firestore.FieldValue.increment(1),
    // }, {merge: true});
    // set counter
    const cartProducts = await store.findRecord(`objects/${objectId}/carts/${userId}`, "products");
    // const user = await this.getUserData();
    // const cart = await this.cartQuery(objectId).get();
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
    // }
    // clear cart delete orderId from cart
    await this.clear(objectId, userId);
    // notify admin
    await ctx.telegram.sendMessage(94899148, `<b>New order from bot! Object ${object.name} ` +
    `<a href="tg://user?id=${ctx.from.id}">User ${ctx.from.id}</a></b>`, {parse_mode: "html"});
  },
  // async getSessionData(value) {
  //   const user = await this.getUserData();
  //   return user.session || {};
  // },
  // async setSessionData(value) {
  //   await this.userQuery.set({
  //     session: {
  //       ...value,
  //     },
  //   }, {merge: true});
  // },
  // async objects() {
  //   const objectsQuery = await firebase.firestore().collection("objects").get();
  //   const objects = [];
  //   objectsQuery.docs.forEach((object) => {
  //     objects.push({id: object.id, ...object.data()});
  //   });
  //   return objects;
  // },
  async cartButtons(objectId, userId) {
    // get cart count
    // const cart = await this.cartQuery(objectId).get();
    const cartProducts = await store.findRecord(`objects/${objectId}/carts/${userId}`, "products");
    return [
      {text: "🏪 Главная", callback_data: `objects/${objectId}`},
      {text: `🛒 Корзина (${cartProducts && Object.keys(cartProducts).length || 0})`,
        callback_data: `cart?o=${objectId}`},
    ];
  },
};

exports.store = store;
exports.cart = cart;
