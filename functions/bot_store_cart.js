const firebase = require("firebase-admin");
const bucket = firebase.storage().bucket();
const {download} = require("./download");
const fs = require("fs");
// round to 2 decimals
const roundNumber = (num) => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};
// check photo
const photoCheckUrl = async (url, check) => {
  if (url) {
    const photoProjectExists = await bucket.file(url).exists();
    if (photoProjectExists[0]) {
      return bucket.file(url).publicUrl();
    } else if (check) {
      return false;
    }
  }
  // default url
  return process.env.BOT_LOGO;
};
// download and save photo from telegram
const savePhotoTelegram = async (ctx, path, zoom) => {
  if (ctx.message.media_group_id) {
    throw new Error("Choose only one Photo!");
  }
  const telegramPhotos = ctx.message.photo;
  const savePhotos = [];
  if (telegramPhotos.length < 3) {
    throw new Error("Choose large photo!");
  }
  // loop photos [0 (90*90),1 (320*320), 2 (800*800), 3 (1000*1000)]
  // download only 1, 3 or 4 index
  savePhotos.push(telegramPhotos[1]);
  savePhotos.push(telegramPhotos.length == 4 ? telegramPhotos[3] : telegramPhotos[2]);
  // set photo id
  const photoId = savePhotos[0].file_unique_id;
  for (const [zoom, photo] of savePhotos.entries()) {
    const photoUrl = await ctx.telegram.getFileLink(photo.file_id);
    try {
      // download photos from telegram server
      const photoPath = await download(photoUrl.href);
      await bucket.upload(photoPath, {
        destination: `${path}/${photoId}/${zoom + 1}.jpg`,
      });
      // delete download file
      fs.unlinkSync(photoPath);
    } catch (e) {
      throw new Error(`Error upload photos ${e.message}`);
    }
  }
  // return photoId;
  return photoId;
};
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
    const paymentsTxt = process.env.BOT_PAYMENT;
    const paymentsMap = new Map();
    if (paymentsTxt) {
      for (const paramsData of paymentsTxt.split("&")) {
        paymentsMap.set(+ paramsData.split("=")[0], paramsData.split("=")[1].trim());
      }
    }
    return paymentsMap;
  },
  carriers() {
    const carriersTxt = process.env.BOT_CARRIER;
    const carriersMap = new Map();
    if (carriersTxt) {
      for (const paramsData of carriersTxt.split("&")) {
        const carrierName = paramsData.split("=")[1].trim();
        const reqNumberCurrier = carrierName.match(/^!(.*)/);
        const currierObj = {};
        if (reqNumberCurrier) {
          currierObj.name = reqNumberCurrier[1].trim();
          currierObj.reqNumber = true;
        } else {
          currierObj.name = carrierName;
          currierObj.reqNumber = false;
        }
        carriersMap.set(+ paramsData.split("=")[0], currierObj);
      }
    }
    return carriersMap;
  },
  statuses() {
    const statusesTxt = process.env.BOT_STATUS;
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
            name: `${product.brand ? product.brand + " " : ""}${product.name}`,
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
      await store.createRecord(`objects/${objectId}/carts/${userId}`, {
        updatedAt: Math.floor(Date.now() / 1000),
        products,
      });
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
    // notify admin now use triggers
    // await ctx.telegram.sendMessage(94899148, `<b>New order from bot! Object ${object.name} ` +
    // `<a href="tg://user?id=${ctx.from.id}">User ${ctx.from.id}</a></b>`, {parse_mode: "html"});
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
  async cartInfo(objectId, userId) {
    // get cart count
    let cartCount = 0;
    let totalQty = 0;
    let totalSum = 0;
    if (userId) {
      const cartProducts = await this.products(objectId, userId);
      for (const cartProduct of cartProducts) {
        cartCount ++;
        totalQty += cartProduct.qty;
        totalSum += cartProduct.qty * cartProduct.price;
      }
      // return cartProducts && Object.keys(cartProducts).length || 0;
    }

    return {cartCount, totalQty, totalSum: roundNumber(totalSum)};
  },
};

exports.store = store;
exports.cart = cart;
exports.roundNumber = roundNumber;
exports.photoCheckUrl = photoCheckUrl;
exports.savePhotoTelegram = savePhotoTelegram;
