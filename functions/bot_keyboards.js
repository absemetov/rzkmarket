const functions = require("firebase-functions");
const firebase = require("firebase-admin");
const botConfig = functions.config().env.bot;
// store inst
const store = {
  async queryRecord(modelObject, queryObject = {}) {
    const modelSnap = await this.getQuery(modelObject).get();
    // snap
    if (queryObject.snap) {
      return modelSnap;
    }
    // check data
    if (modelSnap.exists) {
      const sortedArray = [];
      const data = modelSnap.data();
      if (queryObject.sort && data[queryObject.sort]) {
        for (const [id, product] of Object.entries(data[queryObject.sort])) {
          sortedArray.push({id, ...product});
        }
        // sort products by createdAt
        sortedArray.sort(function(a, b) {
          return a.createdAt - b.createdAt;
        });
        data[queryObject.sort] = sortedArray;
      }
      // output
      if (queryObject.single) {
        return sortedArray;
      } else {
        return {"id": modelSnap.id, ...data};
      }
    }
    return null;
  },
  async createRecord(modelObject, dataObject) {
    // save data with merge
    await this.getQuery(modelObject).set({
      ...dataObject,
    }, {merge: true});
  },
  async findRecord(modelObject, field) {
    const modelSnap = await this.getQuery(modelObject).get();
    // check data
    if (modelSnap.exists) {
      if (field) {
        const fields = field.split(".");
        let fieldData = modelSnap.data();
        fields.forEach((fieldItem) => {
          if (fieldData[fieldItem]) {
            fieldData = fieldData[fieldItem];
          }
        });
        return {...fieldData};
      } else {
        return {id: modelSnap.id, ...modelSnap.data()};
      }
    }
    return null;
  },
  async deleteRecord(modelObject, field) {
    const fields = field.split(".");
    // const fields = "session.orderData.yandex.ru".split(".");
    // const jsonStr = '{"session": {"order" : 1}}';
    let output = "";
    let quates = "";
    fields.forEach((data) => {
      console.log(data);
      output += `{"${data}": `;
      quates += "}";
    });
    // console.log(output+"1}}");
    const obj = JSON.parse(output+`1${quates}`);
    // console.log(obj)
    arraySave = [];
    fields.forEach((data, index) => {
      if (arraySave[index - 1]) {
        if (index === fields.length - 1) {
          arraySave.push(arraySave[index - 1][data] = "delete");
        } else {
          arraySave.push(arraySave[index - 1][data]);
        }
      } else {
        arraySave.push(obj[data]);
      }
      // console.log(arraySave[index]);
    });
    console.log(obj["session"]["orderData"]);
    console.log(obj);
    // {"session": {"order" : 1}}
    // await this.getQuery(modelObject).set({
    //   ...dataObject,
    // }, {merge: true});
  },
  async findAll(modelName) {
    const modelSnap = await firebase.firestore().collection(modelName).get();
    const outputArray = [];
    modelSnap.docs.forEach((model) => {
      outputArray.push({id: model.id, ...model.data()});
    });
    return outputArray;
  },
  getQuery(modelObject) {
    let query = firebase.firestore();
    for (const [key, value] of Object.entries(modelObject)) {
      // doc id must be string!!!
      query = query.collection(key).doc(value.toString());
    }
    return query;
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
};

// cart instance
const cart = {
  serverTimestamp: Math.floor(Date.now() / 1000),
  async getUserData(userId) {
    // const userRef = await this.userQuery.get();
    // if (userRef.exists) {
    //   return {id: + userRef.id, ...userRef.data()};
    // }
    // return {};
    return store.findRecord("users", userId);
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
      await store.createRecord({"objects": objectId, "carts": userId}, {products: productData});
    } else {
      // delete product from cart
      // await this.cartQuery(objectId).set({
      //   products: {
      //     [typeof product == "object" ? product.id : product]: firebase.firestore.FieldValue.delete(),
      //   },
      // }, {merge: true});
      await store.createRecord({"objects": objectId, "carts": userId}, {products: {
        [typeof product == "object" ? product.id : product]: firebase.firestore.FieldValue.delete(),
      }});
    }
  },
  async products(objectId, userId) {
    // const products = [];
    // const cart = await this.cartQuery(objectId).get();
    const products = await store.queryRecord({"objects": objectId, "carts": userId}, {sort: "products", single: true});
    // if (cart.exists && cart.data().products) {
    //   for (const [id, product] of Object.entries(cart.data().products)) {
    //     products.push({id, ...product});
    //   }
    // }
    // // sort products by createdAt
    // products.sort(function(a, b) {
    //   return a.createdAt - b.createdAt;
    // });
    return products || [];
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
    await store.createRecord({"objects": objectId, "carts": userId}, {
      products: firebase.firestore.FieldValue.delete(),
    });
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
  // async setUserName(value) {
  //   await this.userQuery.set({
  //     userName: value,
  //   }, {merge: true});
  // },
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
    const cartProducts = await store
        .queryRecord({"objects": objectId, "carts": userId}, {sort: "products", single: true});
    return [
      {text: "🏪 Главная", callback_data: `objects/${objectId}`},
      {text: `🛒 Корзина (${cartProducts && cartProducts.length || 0})`, callback_data: `cart?o=${objectId}`},
    ];
  },
};

exports.store = store;
exports.cart = cart;
