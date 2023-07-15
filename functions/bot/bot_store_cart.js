// const firebase = require("firebase-admin");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {getStorage} = require("firebase-admin/storage");
// const firestore = require("firebase-admin/firestore");
// const bucket = firebase.storage().bucket();
const bucket = getStorage().bucket();
const {download} = require("./download");
const fs = require("fs");
// round to 2 decimals
const roundNumber = (num) => {
  // 2 decimals
  // return Math.round((num + Number.EPSILON) * 100) / 100;
  return Math.round(num);
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
const savePhotoTelegram = async (ctx, path, thumbnails = true) => {
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
  if (thumbnails) {
    savePhotos.push(telegramPhotos[1]);
  }
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
      const model = modelSnap.data();
      if (field) {
        // find nested data
        const fields = field.split(".");
        if (fields.length === 1 && model[fields[0]]) {
          return model[fields[0]];
          // return typeof model[fields[0]] === "object" ? {...model[fields[0]]} : model[fields[0]];
        }
        if (fields.length === 2 && model[fields[0]] && model[fields[0]][fields[1]]) {
          return model[fields[0]][fields[1]];
          // return typeof model[fields[0]][fields[1]] === "object" ? {...model[fields[0]][fields[1]]} : model[fields[0]][fields[1]];
        }
      } else {
        return {id: modelSnap.id, ...model};
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
      [field]: FieldValue.delete(),
    }, {merge: true});
  },
  async findAll(collectionName) {
    const modelSnap = await getFirestore().collection(collectionName).get();
    const outputArray = [];
    modelSnap.docs.forEach((model) => {
      outputArray.push({id: model.id, ...model.data()});
    });
    return outputArray;
  },
  getQuery(path) {
    return getFirestore().doc(path);
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
  async add(value) {
    await store.createRecord(`objects/${value.objectId}/carts/${value.userId}`, {
      updatedAt: Math.floor(Date.now() / 1000),
      fromBot: value.fromBot,
      products: value.product,
    });
  },
  async update(value) {
    await store.createRecord(`objects/${value.objectId}/carts/${value.userId}`, {
      updatedAt: Math.floor(Date.now() / 1000),
      products: value.product,
    });
  },
  async delete(value) {
    await store.createRecord(`objects/${value.objectId}/carts/${value.userId}`, {
      "products": {
        [value.id]: FieldValue.delete(),
      }});
  },
  async addOld(objectId, userId, product, qty) {
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
              [product]: FieldValue.delete(),
            }});
      }
    }
  },
  async products(objectId, userId) {
    const cartProducts = await store.findRecord(`objects/${objectId}/carts/${userId}`, "products");
    return store.sort(cartProducts);
  },
  async clear(objectId, userId) {
    if (parseInt(userId) === 94899148) {
      await store.createRecord(`objects/${objectId}/carts/${userId}`, {"products": FieldValue.delete()});
    } else {
      await store.getQuery(`objects/${objectId}/carts/${userId}`).delete();
    }
  },
  async createOrder(ctx, wizardData) {
    const userId = ctx.from.id;
    await store.createRecord(`users/${userId}`, {orderCount: FieldValue.increment(1)});
    const userData = await store.findRecord(`users/${userId}`);
    const objectId = wizardData.objectId;
    const orderQuery = getFirestore().collection("objects").doc(objectId).collection("orders");
    const cartProducts = await store.findRecord(`objects/${objectId}/carts/${userId}`, "products");
    // if cart empty alert error
    if (cartProducts) {
      const object = await store.findRecord(`objects/${objectId}`);
      await orderQuery.add({
        userId,
        objectId,
        objectName: object.name,
        orderNumber: userData.orderCount,
        statusId: 1,
        fromBot: true,
        products: cartProducts,
        createdAt: Math.floor(Date.now() / 1000),
        ...wizardData,
      });
      await this.clear(objectId, userId);
    } else {
      throw new Error(ctx.i18n.txt.cartEmpty());
    }
  },
  async cartButtons(objectId, ctx) {
    // get cart count
    const cartProducts = await store.findRecord(`objects/${objectId}/carts/${ctx.from.id}`, "products");
    return [
      {text: ctx.i18n.btn.main(), callback_data: `o/${objectId}`},
      {text: `${ctx.i18n.btn.cart()} (${cartProducts && Object.keys(cartProducts).length || 0})`,
        callback_data: "cart"},
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

// upload photo obj new
const uploadPhotoObj = async (ctx, objectId) => {
  if (objectId) {
    const path = `objects/${objectId}`;
    const object = await store.findRecord(path);
    // first delete old photos
    if (object.photoId) {
      await deletePhotoStorage(`photos/o/${objectId}/logo`);
    }
    try {
      // download photos from telegram server
      const photoId = await savePhotoTelegram(ctx, `photos/o/${objectId}/logo`);
      // save fileID to Firestore
      await store.updateRecord(path, {
        photoId,
      });
      const url = await photoCheckUrl(`photos/o/${objectId}/logo/${photoId}/2.jpg`);
      await ctx.replyWithPhoto({url},
          {
            caption: `${object.name} (${object.id}) photo uploaded` + ctx.state.sessionMsg.linkHTML(),
            reply_markup: {
              inline_keyboard: [
                [{text: "⤴️ Goto object",
                  callback_data: `o/${objectId}`}],
              ],
            },
            parse_mode: "html",
          });
    } catch (e) {
      await ctx.reply(`Error upload photos ${e.message}`);
      return;
    }
  } else {
    await ctx.reply("Please select a object to upload Photo");
  }
};
// upload product photos new
const uploadPhotoProduct = async (ctx, objectId, productId) => {
  if (productId && objectId) {
    const product = await store.findRecord(`objects/${objectId}/products/${productId}`);
    // get count photos to check limits 5 photos
    if (product.photos && product.photos.length > 4) {
      await ctx.reply("Limit 5 photos");
      return;
    }
    try {
      // upload only one photo!!!
      const photoId = await savePhotoTelegram(ctx, `photos/o/${objectId}/p/${productId}`);
      // save file id
      if (!product.mainPhoto) {
        // set main photo
        await store.updateRecord(`objects/${objectId}/products/${productId}`, {
          mainPhoto: photoId,
          photos: FieldValue.arrayUnion(photoId),
        });
      } else {
        await store.updateRecord(`objects/${objectId}/products/${productId}`, {
          photos: FieldValue.arrayUnion(photoId),
        });
      }
      // get catalog url (path)
      let catalogUrl = `c/${product.catalogId.substring(product.catalogId.lastIndexOf("#") + 1)}`;
      const sessionPathCatalog = ctx.state.sessionMsg.url.searchParams.get("pathC");
      if (sessionPathCatalog && sessionPathCatalog.includes("?")) {
        if (sessionPathCatalog.includes("&b=1")) {
          catalogUrl = sessionPathCatalog;
        } else {
          catalogUrl = sessionPathCatalog + "&b=1";
        }
      }
      const media = await photoCheckUrl(`photos/o/${objectId}/p/${product.id}/${photoId}/2.jpg`);
      await ctx.replyWithPhoto(media,
          {
            caption: `${product.name} (${product.id}) photo uploaded` + ctx.state.sessionMsg.linkHTML(),
            reply_markup: {
              inline_keyboard: [
                [{text: "📸 Upload photo", callback_data: `u/${product.id}?todo=prod`}],
                [{text: `🖼 Show photos (${product.photos ? product.photos.length + 1 : 1})`,
                  callback_data: `s/${product.id}`}],
                [{text: `⤴️ ${product.name}`,
                  callback_data: `p/${product.id}`}],
                [{text: "⤴️ Goto catalog",
                  callback_data: catalogUrl}],
              ],
            },
            parse_mode: "html",
          });
    } catch (e) {
      await ctx.reply(`Error upload photos ${e.message}`);
      return;
    }
  } else {
    await ctx.reply("Please select a product to upload Photo");
  }
};
// upload catalog photo new
const uploadPhotoCat = async (ctx, objectId, catalogId) => {
  if (catalogId && objectId) {
    const catalog = await store.findRecord(`objects/${objectId}/catalogs/${catalogId}`);
    // first delete old photos
    if (catalog.photoId) {
      // await bucket.deleteFiles({
      //   prefix: `photos/o/${objectId}/c/${catalogId}`,
      // });
      await deletePhotoStorage(`photos/o/${objectId}/c/${catalogId.replace(/#/g, "-")}`);
    }
    try {
      const photoId = await savePhotoTelegram(ctx, `photos/o/${objectId}/c/${catalogId.replace(/#/g, "-")}`);

      await store.updateRecord(`objects/${objectId}/catalogs/${catalogId}`, {
        photoId,
      });
      // get catalog url (path)
      const catalogUrl = `c/${catalogId.substring(catalogId.lastIndexOf("#") + 1)}`;
      const media = await photoCheckUrl(`photos/o/${objectId}/c/${catalogId.replace(/#/g, "-")}/${photoId}/2.jpg`);
      await ctx.replyWithPhoto(media,
          {
            caption: `${catalog.name} (${catalog.id}) photo uploaded` + ctx.state.sessionMsg.linkHTML(),
            reply_markup: {
              inline_keyboard: [
                [{text: "⤴️ Goto catalog",
                  callback_data: catalogUrl}],
              ],
            },
            parse_mode: "html",
          });
    } catch (e) {
      await ctx.reply(`Error upload photos ${e.message}`);
      return;
    }
  } else {
    await ctx.reply("Please select a product to upload Photo");
  }
};
// delete files from storage
const deletePhotoStorage = async (prefix) => {
  await bucket.deleteFiles({
    prefix,
  });
};
// change banner fields
const changeBanner = async (ctx, url, scene) => {
  const bannerNumber = ctx.state.sessionMsg.url.searchParams.get("bNumber");
  if (scene == "delete-main-banner") {
    if (url === "del") {
      // delete photo
      await deletePhotoStorage(`photos/main/banners/${bannerNumber}`);
      // del doc
      await store.getQuery(`banners/${bannerNumber}`).delete();
      await ctx.reply(`Banner ${bannerNumber} deleted!`);
    } else {
      await ctx.replyWithHTML(`<b>${url}</b> must be a del!`);
    }
  }
  if (scene == "setUrl-main-banner") {
    await store.createRecord(`banners/${bannerNumber}`, {
      url,
    });
    await ctx.reply(`Banner ${bannerNumber} url ${url} updated!`);
  }
};
// upload banners photo
const uploadBanner = async (ctx) => {
  const bannerNumber = ctx.state.sessionMsg.url.searchParams.get("bNumber");
  // first delete old photos
  await deletePhotoStorage(`photos/main/banners/${bannerNumber}`);
  try {
    const photoId = await savePhotoTelegram(ctx, `photos/main/banners/${bannerNumber}`, false);
    await store.createRecord(`banners/${bannerNumber}`, {
      photoUrl: bucket.file(`photos/main/banners/${bannerNumber}/${photoId}/1.jpg`).publicUrl(),
    });
    // firestore.FieldValue.arrayUnion(photoId)
    // photos: firestore.FieldValue.arrayRemove(photoId),
    // get catalog url (path)
    const media = await photoCheckUrl(`photos/main/banners/${bannerNumber}/${photoId}/1.jpg`);
    await ctx.replyWithPhoto(media,
        {
          caption: `Banner ${bannerNumber} uploaded` + ctx.state.sessionMsg.linkHTML(),
          reply_markup: {
            inline_keyboard: [
              [{text: "⤴️ Goto banner",
                callback_data: `d/show?b=${bannerNumber}`}],
            ],
          },
          parse_mode: "html",
        });
  } catch (e) {
    await ctx.reply(`Error upload photos ${e.message}`);
    return;
  }
};
// translit
const lettersRuUk = {
  "а": "a",
  "б": "b",
  "в": "v",
  "д": "d",
  "з": "z",
  "й": "y",
  "к": "k",
  "л": "l",
  "м": "m",
  "н": "n",
  "о": "o",
  "п": "p",
  "р": "r",
  "с": "s",
  "т": "t",
  "у": "u",
  "ф": "f",
  "ь": "",
  "г": "g",
  "и": "i",
  "ъ": "",
  "ы": "i",
  "э": "e",
  "ґ": "g",
  "е": "e",
  "і": "i",
  "'": "",
  "’": "",
  "ʼ": "",
  "ё": "yo",
  "ж": "zh",
  "х": "kh",
  "ц": "ts",
  "ч": "ch",
  "ш": "sh",
  "щ": "shch",
  "ю": "yu",
  "я": "ya",
  "є": "ye",
  "ї": "yi",
  " ": "-",
};

function translit(word) {
  return word.toString().split("").map((letter) => {
    const lowLetter = letter.toLowerCase();
    return lowLetter in lettersRuUk ? lettersRuUk[lowLetter] : lowLetter;
  }).join("");
}

// encode decode cyrillic
const letters = {
  "о": "a",
  "е": "b",
  "а": "c",
  "и": "d",
  "н": "e",
  "т": "f",
  "с": "g",
  "р": "h",
  "в": "i",
  "л": "j",
  "к": "k",
  "м": "l",
  "д": "m",
  "п": "n",
  "у": "o",
  "я": "p",
  "ы": "q",
  "ь": "r",
  "г": "s",
  "з": "t",
  "б": "u",
  "ч": "v",
  "й": "w",
  "х": "x",
  "ж": "y",
  "ш": "z",
  " ": "-",
  "_": "",
  "1": "1",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  "0": "0",
};

const invertLetters = {};
Object.keys(letters).forEach((key) => {
  invertLetters[letters[key]] = key;
});

function encodeCyrillic(text, decode) {
  let latin = false;
  return text.toString().split("").map((letter) => {
    const isUpperCase = letter === letter.toUpperCase();
    const lowLetter = letter.toLowerCase();
    if (decode) {
      if (letter === "_") {
        latin = true;
        return "";
      }
      if (latin) {
        latin = false;
        return letter;
      } else {
        return lowLetter in invertLetters ? (isUpperCase ? invertLetters[lowLetter].toUpperCase() : invertLetters[lowLetter]) : letter;
      }
    } else {
      return lowLetter in letters ? (isUpperCase ? letters[lowLetter].toUpperCase() : letters[lowLetter]) : (invertLetters[lowLetter] ? `_${letter}` : letter);
    }
  }).join("");
}

exports.store = store;
exports.cart = cart;
exports.roundNumber = roundNumber;
exports.photoCheckUrl = photoCheckUrl;
exports.savePhotoTelegram = savePhotoTelegram;
exports.uploadPhotoObj = uploadPhotoObj;
exports.uploadPhotoProduct = uploadPhotoProduct;
exports.uploadPhotoCat = uploadPhotoCat;
exports.uploadBanner = uploadBanner;
exports.changeBanner = changeBanner;
exports.deletePhotoStorage = deletePhotoStorage;
exports.translit = translit;
exports.encodeCyrillic = encodeCyrillic;
