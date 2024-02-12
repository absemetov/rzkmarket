// 2nd generation functions
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
// const firebase = require("firebase-admin");
// const firestore = require("firebase-admin/firestore");
// const functions = require("firebase-functions");
const {Telegraf} = require("telegraf");
const {GoogleSpreadsheet} = require("google-spreadsheet");
const algoliasearch = require("algoliasearch");
const creds = require("./rzk-com-ua-d1d3248b8410.json");
const Validator = require("validatorjs");
const {google} = require("googleapis");
const {store, roundNumber, photoCheckUrl, translit} = require("./bot_store_cart");
const bot = new Telegraf(process.env.BOT_TOKEN, {
  handlerTimeout: 540000,
});
// check nested catalogs
// function checkNestedCat(indexId, delCatalogs) {
//   for (const [index, value] of delCatalogs.entries()) {
//     if (index > indexId) {
//       if (!value.del) {
//         return false;
//       }
//     }
//   }
//   return true;
// }
// set triger for start uploading
const uploadProductsTrigger = async (ctx, pageName, objectId) => {
  const object = await store.findRecord(`objects/${objectId}`);
  const uploads = await store.findRecord(`objects/${objectId}/uploads/start`);
  const uploading = uploads && uploads.uploadProductsStart && (Math.floor(new Date() / 1000) - uploads.uploadProductsStart) < 540;
  // local dev upload products obj Saky
  // try {
  //   await uploadProductsNew(bot.telegram, objectId, object.sheetId, pageName);
  // } catch (error) {
  //   await bot.telegram.sendMessage(94899148, `Sheet ${error}`,
  //       {parse_mode: "html"});
  // }
  if (!uploading) {
    if (!(/^products/.test(pageName) || pageName === "upload-to-merchant")) {
      await ctx.replyWithHTML(`Use products-namePage, ${pageName}`);
      return;
    }
    await ctx.replyWithHTML(`Начинаем загрузку товаров ${object.name}, ${pageName}`);
    // run trigger event, delete doc if it exist
    if (uploads) {
      await store.getQuery(`objects/${objectId}/uploads/start`).delete();
    }
    // trigger event
    const uploadProductsStart = Math.floor(Date.now() / 1000);
    await store.createRecord(`objects/${objectId}/uploads/start`, {
      pageName,
      uploadProductsStart,
      sheetId: object.sheetId,
    });
  } else {
    await ctx.replyWithHTML(`<b>Products loading...please wait ${540 - (Math.floor(new Date() / 1000) - uploads.uploadProductsStart)}s</b>`);
  }
};

// upload to merchant
const uploadToMerchant = async (telegram, seller) => {
  const content = google.content("v2.1");
  // add scope content in admin.google!!!
  const auth = new google.auth.JWT({
    keyFile: "./bot/rzk-com-ua-d1d3248b8410.json",
    scopes: ["https://www.googleapis.com/auth/content"],
    subject: "nadir@absemetov.org.ua",
  });
  google.options({auth});

  // Use an API key with `browse` ACL
  const client = algoliasearch(process.env.ALGOLIA_ID, process.env.ALGOLIA_ADMIN_KEY);
  const index = client.initIndex("products");

  await telegram.sendMessage(94899148, `<b>Start upload goods from Algolia to Merchant center Seller = ${seller}</b>`, {parse_mode: "html"});
  // Get all records, retrieve only `title` and `content` attributes
  const promises = [];
  await index.browseObjects({
    query: "",
    attributesToRetrieve: ["productId", "brand", "sellerId", "img1", "name", "nameRu", "price"],
    facetFilters: [[`seller:${seller}`]],
    batch: (hits) => {
      for (const params of hits) {
        promises.push(content.products.insert({
          merchantId: "120890507",
          resource: {
            "channel": "online",
            "contentLanguage": "uk",
            "offerId": params.productId,
            "targetCountry": "UA",
            "title": `${params.brand ? params.brand + " " : ""}${params.name} (${params.productId})`,
            "brand": `${params.brand ? params.brand : "Viko.org.ua"}`,
            "description": "Купити розетки та вимикачі Viko, Gunsan, Nilson оптом!",
            "link": `https://viko.org.ua/o/${params.sellerId}/p/${params.productId}`,
            "imageLink": params.img1 ? params.img1 : "https://viko.org.ua/icons/flower3.svg",
            "availability": "in stock",
            "condition": "new",
            "price": {
              // "value": roundNumber(product.price * object.currencies[product.currency]),
              "value": params.price,
              "currency": "UAH",
            },
          },
        }));
        if (params.nameRu) {
          promises.push(content.products.insert({
            merchantId: "120890507",
            resource: {
              "channel": "online",
              "contentLanguage": "ru",
              "offerId": params.productId,
              "targetCountry": "UA",
              "title": `${params.brand ? params.brand + " " : ""}${params.nameRu} (${params.productId})`,
              "brand": `${params.brand ? params.brand : "Viko.org.ua"}`,
              "description": "Купить розетки и выключатели Viko, Gunsan, Nilson оптом!",
              "link": `https://viko.org.ua/ru/o/${params.sellerId}/p/${params.productId}`,
              "imageLink": params.img1 ? params.img1 : "https://viko.org.ua/icons/flower3.svg",
              "availability": "in stock",
              "condition": "new",
              "price": {
                // "value": roundNumber(product.price * object.currencies[product.currency]),
                "value": params.price,
                "currency": "UAH",
              },
            },
          }));
        }
      }
    },
  }).then(async () => await telegram.sendMessage(94899148, "<b>Browse done!</b>", {parse_mode: "html"}));
  await Promise.all(promises).then(async () => {
    await telegram.sendMessage(94899148, `<b>${promises.length} Goods uploaded to merch successful!</b>`, {parse_mode: "html"});
  });
};
// upload from googleSheet
// const uploadProducts = async (telegram, objectId, sheetId, pageName) => {
//   const object = await store.findRecord(`objects/${objectId}`);
//   // upload to merchant
//   if (pageName === "upload-to-merchant" && process.env.BOT_LANG === "uk") {
//     await uploadToMerchant(telegram, object.name);
//     return;
//   }
//   const lastUplodingTime = object.lastUplodingTime || 0;
//   const startTime = new Date();
//   // for goods and catalogs
//   const updatedAtTimestamp = Math.floor(startTime / 1000);
//   // per page default 500
//   const perPage = 500;
//   // Max upload goods
//   const maxUploadGoods = 2000;
//   // Catalogs set array
//   // const catalogsIsSet = new Map();
//   const catalogsIsSet = new Set();
//   // Products set array
//   const productIsSet = new Set();
//   let deletedProducts = 0;
//   let deletedCatalogs = 0;
//   // array for save tags
//   // const catalogsTagsMap = new Map();
//   // batch catalogs
//   // let batchCatalogs = firebase.firestore().batch();
//   let batchCatalogs = getFirestore().batch();
//   let batchCatalogsCount = 0;
//   // load sheet
//   const doc = new GoogleSpreadsheet(sheetId);
//   await doc.useServiceAccountAuth(creds, "nadir@absemetov.org.ua");
//   // loads document properties and worksheets
//   await doc.loadInfo();
//   const sheet = doc.sheetsByTitle[pageName];
//   if (sheet) {
//     await telegram.sendMessage(94899148, `<b>Loading goods from ${doc.title}\n`+
//     `Count rows: ${sheet.rowCount}</b>`,
//     {parse_mode: "html"});
//   } else {
//     throw new Error(`<b>Sheet title ${pageName} not found!</b>`);
//   }
//   const rowCount = sheet.rowCount;
//   // read rows
//   for (let i = 1; i < rowCount; i += perPage) {
//     // write batch
//     // const batchGoods = firebase.firestore().batch();
//     // const batchGoodsDelete = firebase.firestore().batch();
//     // const batchCatalogsDelete = firebase.firestore().batch();
//     const batchGoods = getFirestore().batch();
//     const batchGoodsDelete = getFirestore().batch();
//     const batchCatalogsDelete = getFirestore().batch();
//     // get rows data, use get cell because this method have numder formats
//     await sheet.loadCells({
//       startRowIndex: i, endRowIndex: i + perPage, startColumnIndex: 0, endColumnIndex: 11,
//     });
//     // loop rows from SHEET
//     for (let j = i; j < i + perPage && j < rowCount; j++) {
//       // get cell insst
//       const ORDER_BY = sheet.getCell(j, 0);
//       const ID = sheet.getCell(j, 1);
//       const NAME = sheet.getCell(j, 2);
//       const PURCHASE_PRICE = sheet.getCell(j, 3);
//       const PRICE = sheet.getCell(j, 4);
//       // const CURRENCY = sheet.getCell(j, 5);
//       const UNIT = sheet.getCell(j, 5);
//       const GROUP = sheet.getCell(j, 6);
//       const TAGS = sheet.getCell(j, 7);
//       const BRAND = sheet.getCell(j, 8);
//       const TIMESTAMP = sheet.getCell(j, 9);
//       const NAME_RU = sheet.getCell(j, 10);
//       const rowUpdatedTime = TIMESTAMP.value || 1;
//       // const prodMustDel = ID.value && NAME.value && ID.backgroundColor && Object.keys(ID.backgroundColor).length === 1 && ID.backgroundColor.red === 1 && rowUpdatedTime !== "deleted";
//       const prodMustDel = ID.value && NAME.value && ORDER_BY.value === "delete" && rowUpdatedTime !== "deleted";
//       const newDataDetected = !prodMustDel && rowUpdatedTime > lastUplodingTime;
//       const row = {
//         ORDER_BY: ORDER_BY.value && ORDER_BY.value.toString().trim().replace(/^!\s*/, ""),
//         ID: ID.value && ID.value.toString().trim(),
//         NAME: NAME.value && NAME.value.toString().trim(),
//         NAME_RU: NAME_RU.value && NAME_RU.value.toString().trim(),
//         PURCHASE_PRICE: PURCHASE_PRICE.value,
//         PRICE: PRICE.value,
//         // CURRENCY: CURRENCY.value,
//         UNIT: UNIT.value,
//         GROUP: GROUP.value && GROUP.value.split("#") || [],
//         TAGS: TAGS.value && TAGS.value.split(",") || [],
//         BRAND: BRAND.value,
//         AVAILABILITY: ORDER_BY.value && ORDER_BY.value.toString().trim().charAt(0) !== "!",
//       };
//       // generate catalogs array
//       const pathArrayHelper = [];
//       const delCatalogs = [];
//       const groupArray = row.GROUP.map((catalogName) => {
//         let id = null;
//         // let parentId = null;
//         let orderNumber = null;
//         // let postId = null;
//         let nameCat = catalogName.trim();
//         // parce catalog url
//         const url = nameCat.match(/(.+)\[(.+)\]$/);
//         if (url) {
//           nameCat = url[1].trim();
//           const partial = url[2].split(",");
//           id = partial[0] ? partial[0].trim() : translit(nameCat);
//           orderNumber = partial[1] && + partial[1];
//           // postId = partial[2] && + partial[2];
//         } else {
//           id = translit(nameCat);
//         }
//         // delete catalogs
//         if (nameCat.charAt(0) === "%") {
//           if (id.charAt(0) === "%") {
//             id = id.replace(/^%-*/, "");
//           }
//           pathArrayHelper.push(id);
//           delCatalogs.push({id: pathArrayHelper.join("#"), del: true});
//         } else {
//           pathArrayHelper.push(id);
//           delCatalogs.push({id: pathArrayHelper.join("#"), del: false});
//         }
//         // use ru locale
//         const [name, nameRu] = nameCat.split("|").map((item) => item.trim());
//         return {
//           id,
//           name,
//           nameRu,
//           url: pathArrayHelper.join("/"),
//           parentId: pathArrayHelper.length > 1 ? pathArrayHelper.slice(0, -1).join("#") : null,
//           orderNumber,
//         };
//       });
//       // add to delete batch
//       if (prodMustDel) {
//         batchGoodsDelete.delete(store.getQuery(`objects/${objectId}/products/${row.ID}`));
//         ++ deletedProducts;
//         for (const [index, value] of delCatalogs.entries()) {
//           if (value.del) {
//             if (checkNestedCat(index, delCatalogs)) {
//               batchCatalogsDelete.delete(store.getQuery(`objects/${objectId}/catalogs/${value.id}`));
//               ++ deletedCatalogs;
//             } else {
//               // alert error
//               throw new Error(`Delete catalog problem ${value.id}, first delete nested cat!!!`);
//             }
//           }
//         }
//         TIMESTAMP.value = "deleted";
//       }
//       // check if this products have ID and NAME
//       if (row.ID && row.NAME && newDataDetected) {
//         // generate tags array
//         const tags = row.TAGS.map((tag) => {
//           return tag.trim();
//         });
//         // product data
//         // use ru locale todo custom column NAME_RU
//         // const [name, nameRu] = row.NAME.split("|").map((item) => item.trim());
//         const product = {
//           id: row.ID,
//           name: row.NAME,
//           nameRu: row.NAME_RU,
//           purchasePrice: row.PURCHASE_PRICE ? row.PURCHASE_PRICE : null,
//           price: row.PRICE ? roundNumber(row.PRICE) : null,
//           groupName: groupArray.map((cat) => cat.name),
//           groupNameRu: groupArray.map((cat) => cat.nameRu),
//           group: groupArray.map((cat) => cat.id),
//           groupOrder: groupArray.map((cat) => cat.orderNumber),
//           groupLength: groupArray.length,
//           tags,
//           // currency: row.CURRENCY,
//           unit: row.UNIT,
//           brand: row.BRAND,
//           orderNumber: + row.ORDER_BY,
//           availability: row.AVAILABILITY,
//         };
//         const regExpNames = /^[^[\]]+$/;
//         // validate product
//         const rulesProductRow = {
//           "id": "required|alpha_dash|max:40",
//           "name": `required|string|max:90|regex:${regExpNames}`,
//           "nameRu": `string|max:90|regex:${regExpNames}`,
//           "purchasePrice": "numeric",
//           "price": "required|numeric",
//           "groupLength": "required|min:1|max:7",
//           "groupName.*": `required|string|max:90|regex:${regExpNames}`,
//           "groupNameRu.*": `string|max:90|regex:${regExpNames}`,
//           "group.*": "required|alpha_dash|max:40",
//           "groupOrder.*": "required|integer|min:1",
//           "tags.*": `string|max:40|regex:${regExpNames}`,
//           "brand": `string|max:40|regex:${regExpNames}`,
//           // "currency": "required|in:USD,EUR,RUB,UAH",
//           "unit": "required|in:м,шт,кг",
//           "orderNumber": "required|integer|min:1",
//           "availability": "boolean",
//         };
//         const validateProductRow = new Validator(product, rulesProductRow);
//         // check fails
//         if (validateProductRow.fails()) {
//           let errorRow = `In row <b>${j + 1}</b> Product ID <b>${product.id}</b>\n`;
//           for (const [key, error] of Object.entries(validateProductRow.errors.all())) {
//             errorRow += `Column <b>${key}</b> => <b>${error}</b> \n${JSON.stringify(product)}`;
//           }
//           throw new Error(errorRow);
//         }
//         if (validateProductRow.passes()) {
//           // check limit goods
//           if (productIsSet.size === maxUploadGoods) {
//             throw new Error(`Limit <b>${maxUploadGoods}</b> goods!`);
//           }
//           // add products in batch, check id product is unic
//           if (productIsSet.has(product.id)) {
//             throw new Error(`Product ID <b>${product.id}</b> in row <b>${j + 1}</b> not unic`);
//           } else {
//             productIsSet.add(product.id);
//           }
//           const productRef = getFirestore().collection("objects").doc(objectId)
//               .collection("products").doc(product.id);
//           batchGoods.set(productRef, {
//             "name": product.name,
//             "nameRu": product.nameRu || FieldValue.delete(),
//             "purchasePrice": product.purchasePrice,
//             "price": product.price,
//             // "currency": product.currency,
//             // "currency": FieldValue.delete(),
//             "unit": product.unit,
//             "orderNumber": product.orderNumber,
//             "catalogId": groupArray[groupArray.length - 1].url.replace(/\//g, "#"),
//             "pathArray": groupArray.map((catalog) => {
//               if (catalog.nameRu) {
//                 return {name: catalog.name, nameRu: catalog.nameRu, url: catalog.url};
//               } else {
//                 return {name: catalog.name, url: catalog.url};
//               }
//             }),
//             "tags": tags.length ? tags : FieldValue.delete(),
//             // "tagsNames": firestore.FieldValue.delete(),
//             "brand": product.brand ? product.brand : FieldValue.delete(),
//             "updatedAt": updatedAtTimestamp,
//             "objectName": object.name,
//             "rowNumber": j + 1,
//             "availability": product.availability,
//           }, {merge: true});
//           // save catalogs to batch
//           const pathArray = [];
//           const catUrlArray = [];
//           for (const catalog of groupArray) {
//             // helper url for algolia
//             // helpArray.push(catalog.name);
//             // check if catalog added to batch
//             // helper arrays
//             pathArray.push(catalog.id);
//             if (catalog.nameRu) {
//               catUrlArray.push({
//                 name: catalog.name,
//                 nameRu: catalog.nameRu,
//                 url: pathArray.join("/"),
//               });
//             } else {
//               catUrlArray.push({
//                 name: catalog.name,
//                 url: pathArray.join("/"),
//               });
//             }
//             if (!catalogsIsSet.has(pathArray.join("#"))) {
//               catalogsIsSet.add(pathArray.join("#"));
//               const catalogRef = getFirestore().collection("objects").doc(objectId)
//                   .collection("catalogs").doc(pathArray.join("#"));
//               batchCatalogs.set(catalogRef, {
//                 "name": catalog.name,
//                 "nameRu": catalog.nameRu || FieldValue.delete(),
//                 "parentId": catalog.parentId,
//                 "orderNumber": catalog.orderNumber,
//                 "updatedAt": updatedAtTimestamp,
//                 "pathArray": [...catUrlArray],
//               }, {merge: true});
//               // if 500 items commit
//               if (++batchCatalogsCount === perPage) {
//                 await batchCatalogs.commit();
//                 // batchCatalogs = firebase.firestore().batch();
//                 batchCatalogs = getFirestore().batch();
//                 batchCatalogsCount = 0;
//               }
//             }
//           }
//         }
//       }
//     }
//     // commit goods
//     await batchGoods.commit();
//     // delete goods and catalogs
//     await batchGoodsDelete.commit();
//     await batchCatalogsDelete.commit();
//     // send done info
//     await telegram.sendMessage(94899148, `<b>${i + perPage - 1} rows scaned from ${rowCount}</b>`,
//         {parse_mode: "html"});
//     // save cell changes
//     await sheet.saveUpdatedCells();
//     // clear cache
//     sheet.resetLocalCache(true);
//   }
//   // commit last catalog batch
//   if (batchCatalogsCount !== perPage) {
//     await batchCatalogs.commit();
//   }
//   // save lastUplodingTime
//   await store.updateRecord(`objects/${objectId}`, {
//     lastUplodingTime: updatedAtTimestamp,
//   });
//   // send notify
//   const uploadTime = new Date() - startTime;
//   await telegram.sendMessage(94899148, `Data uploaded in ${Math.floor(uploadTime/1000)}s\n` +
//       `Goods added: ${productIsSet.size}\nCatalogs added: ${catalogsIsSet.size}\n` +
//       `${deletedProducts > 0 ? `Deleted Goods: ${deletedProducts}\n<b>Don't forget to delete the product catalog!!!</b>\n` : ""}`+
//       `${deletedCatalogs > 0 ? `Deleted Catalogs: ${deletedCatalogs}` : ""}`,
//   {parse_mode: "html"});
// };

// create object handler
const uploadActions = [];
const createObject = async (ctx, next) => {
  if (ctx.state.pathParams[0] === "upload") {
    const objectId = ctx.state.pathParams[1];
    const todo = ctx.state.searchParams.get("todo");
    const object = await store.findRecord(`objects/${objectId}`);
    try {
      // upload goods
      if (todo === "uploadProducts") {
        // new idea set table page name
        // ctx.state.sessionMsg.url.searchParams.set("scene", "uploadProducts");
        await store.setSession(ctx, "uploadProducts");
        await ctx.replyWithHTML("Введіть ім'я сторінки для завантаження товарів, наприклад <code>products</code>, <code>products-market</code>,  <code>upload-to-merchant</code>" + ctx.state.sessionMsg.linkHTML());
        await ctx.answerCbQuery();
        return;
      }
      // upload to Merch
      if (todo === "uploadToMerchant") {
        // new idea set table page name
        await uploadToMerchant(ctx.telegram, object.name);
        await ctx.answerCbQuery();
        return;
      }
      // update object from link or main menu
      if (todo === "updateObject") {
        const doc = new GoogleSpreadsheet(object.sheetId);
        await doc.useServiceAccountAuth(creds, "nadir@absemetov.org.ua");
        await doc.loadInfo(); // loads document properties and worksheets
        const sheet = doc.sheetsByTitle["info"]; // doc.sheetsById[listId];
        await sheet.loadCells("B1:B11"); // loads a range of cells
        const id = sheet.getCellByA1("B1").value;
        const name = sheet.getCellByA1("B2").value;
        const description = sheet.getCellByA1("B3").value;
        const phoneNumbers = sheet.getCellByA1("B4").value;
        const phoneArray = phoneNumbers && phoneNumbers.toString().split("#").map((phone) => {
          return `${process.env.BOT_PHONECODE}${phone.trim()}`;
        });
        const address = sheet.getCellByA1("B5").value;
        // const USD = roundNumber(sheet.getCellByA1("B6").value);
        // const EUR = roundNumber(sheet.getCellByA1("B7").value);
        // const UAH = roundNumber(sheet.getCellByA1("B8").value);
        // const RUB = roundNumber(sheet.getCellByA1("B9").value);
        // const postId = sheet.getCellByA1("B10").value;
        const objectCheck = {
          id,
          name,
          description,
          phoneArray,
          address,
          // USD,
          // EUR,
          // UAH,
          // RUB,
          // postId,
        };
        const rulesObject = {
          "id": "required|alpha_dash|max:20",
          "name": "required|string",
          "description": "required|string",
          "phoneArray": "required",
          "phoneArray.*": ["required", `regex:/${process.env.BOT_PHONEREGEXP}`],
          "address": "required|string",
          // "USD": "required|numeric",
          // "EUR": "required|numeric",
          // "UAH": "required|numeric",
          // "RUB": "required|numeric",
          // "postId": "integer|min:1",
        };
        const validateObject = new Validator(objectCheck, rulesObject, {
          "regex": `The :attribute phone number is not in the format ${process.env.BOT_PHONETEMPLATE}`,
        });
        if (validateObject.fails()) {
          let errorRow = "";
          for (const [key, error] of Object.entries(validateObject.errors.all())) {
            errorRow += `field <b>${key}</b> => <b>${error}</b>\n`;
          }
          throw new Error(errorRow);
        }
        // actions
        await store.createRecord(`objects/${objectId}`, {
          name,
          description,
          phoneArray,
          address,
          // currencies: {
          //   USD,
          //   EUR,
          //   UAH,
          //   RUB,
          // },
          // postId: postId ? postId : firestore.FieldValue.delete(),
        });
        await ctx.replyWithHTML(`Данные обновлены ${objectCheck.name} /catalogs`);
      }
    } catch (error) {
      await ctx.replyWithHTML(`Sheet ${error}`);
    }
    await ctx.answerCbQuery("Удачных продаж!");
  } else {
    return next();
  }
};
uploadActions.push(createObject);
// show upload form when send link
const uploadForm = async (ctx, sheetId) => {
  const doc = new GoogleSpreadsheet(sheetId);
  try {
    // start upload
    await doc.useServiceAccountAuth(creds, "nadir@absemetov.org.ua");
    await doc.loadInfo(); // loads document properties and worksheets
    const sheet = doc.sheetsByTitle["info"]; // doc.sheetsById[listId];
    await sheet.loadCells("B1:B9"); // loads a range of cells
    const id = sheet.getCellByA1("B1").value;
    const name = sheet.getCellByA1("B2").value;
    const description = sheet.getCellByA1("B3").value;
    const phoneNumbers = sheet.getCellByA1("B4").value;
    const phoneArray = phoneNumbers && phoneNumbers.toString().split("#").map((phone) => {
      return `${process.env.BOT_PHONECODE}${phone.trim()}`;
    });
    const address = sheet.getCellByA1("B5").value;
    // check object and sheetId
    const objectRzk = await store.findRecord(`objects/${id}`);
    if (!objectRzk) {
      throw new Error(`object: ${id} не найден`);
    }
    if (objectRzk && objectRzk.sheetId !== sheetId) {
      throw new Error(`<b>sheetId</b>: ${sheetId} не совпадает`);
    }
    // message confirmed
    const messageTxt = `Sheet name: <b>${doc.title}</b>\n` +
    `id: <b>${id}</b>\n` +
    `name: <b>${name}</b>\n` +
    `description: <b>${description}</b>\n` +
    `phoneArray: <b>${phoneArray.join()}</b>\n` +
    `address: <b>${address}</b>\n`;
    const inlineKeyboardArray = [];
    inlineKeyboardArray.push([{text: `Загрузить объект ${name}`, callback_data: `upload/${id}?todo=updateObject`}]);
    await ctx.replyWithHTML(messageTxt, {
      reply_markup: {
        inline_keyboard: inlineKeyboardArray,
      }});
  } catch (error) {
    await ctx.replyWithHTML(`Sheet ${error}`);
  }
};
// change product data
// show upload form when send link
const changeProduct = async (ctx, newValue) => {
  const objectId = ctx.state.sessionMsg.url.searchParams.get("oId");
  const todo = ctx.state.sessionMsg.url.searchParams.get("cTodo");
  const column = ctx.state.sessionMsg.url.searchParams.get("cColumn");
  // const productName = encodeCyrillic(ctx.state.sessionMsg.url.searchParams.get("pName"), true);
  const productId = ctx.state.sessionMsg.url.searchParams.get("cPId");
  // const sheetId = ctx.state.sessionMsg.url.searchParams.get("sheetId");
  // add desc[Ru]
  if (todo === "desc" || todo === "descRu") {
    await store.updateRecord(`objects/${objectId}/products/${productId}`, {
      [todo]: newValue === "del" ? FieldValue.delete() : newValue,
    });
    await ctx.replyWithHTML(`<b>${productId}</b>, ${todo}: ${newValue === "del" ? "deleted" : " updated"}`);
    return;
  }
  // add postId
  // if (todo === "postId") {
  //   // validate and save
  //   newValue = + newValue;
  //   if (Number.isInteger(newValue)) {
  //     await store.updateRecord(`objects/${objectId}/products/${productId}`, {
  //       [todo]: newValue ? newValue : firestore.FieldValue.delete(),
  //     });
  //     await ctx.replyWithHTML(`<b>${productName} (${productId}) postId ${newValue ? newValue : "deleted"}</b>`);
  //   } else {
  //     await ctx.replyWithHTML(`<b>${todo}</b> must be a integer!` + ctx.state.sessionMsg.linkHTML(), {
  //       reply_markup: {
  //         force_reply: true,
  //         input_field_placeholder: todo,
  //       }});
  //   }
  //   return;
  // }
  const productRowNumber = ctx.state.sessionMsg.url.searchParams.get("cRowN");
  const productWorkSheet = ctx.state.sessionMsg.url.searchParams.get("cWorkS");
  const object = await store.findRecord(`objects/${objectId}`);
  const doc = new GoogleSpreadsheet(object.sheetId);
  try {
    // start upload
    await doc.useServiceAccountAuth(creds, "nadir@absemetov.org.ua");
    await doc.loadInfo(); // loads document properties and worksheets
    const sheet = doc.sheetsByTitle[productWorkSheet]; // doc.sheetsById[listId];
    await sheet.loadCells(`A${productRowNumber}:K${productRowNumber}`); // loads a range of cells
    const ORDER_BY = sheet.getCellByA1(`A${productRowNumber}`);
    const ID = sheet.getCellByA1(`B${productRowNumber}`);
    const TIMESTAMP = sheet.getCellByA1(`J${productRowNumber}`);
    // check current value
    // dont use strict equality diff types
    if (ID.value != productId) {
      await ctx.replyWithHTML(`${productId} not found in sheet row ${productRowNumber}`);
      return;
    }
    // change availability
    if (todo === "availability") {
      if (newValue === "true" || newValue === "false") {
        await store.updateRecord(`objects/${objectId}/products/${productId}`, {
          [todo]: newValue === "true",
        });
        ORDER_BY.value = newValue === "false" ? `!${ORDER_BY.value.toString().trim().replace(/^!\s*/, "")}` : ORDER_BY.value.toString().trim().replace(/^!\s*/, "");
        await ORDER_BY.save();
        await store.defaultSession(ctx);
        await ctx.replyWithHTML(`${productId} new value availability: ${newValue}`);
      } else {
        await ctx.replyWithHTML(`${productId} to change availability use <code>true</code> or <code>false</code> value!`);
      }
      return;
    }
    // delete product
    if (todo === "del") {
      if (newValue === "del") {
        // delete from firestore
        await store.getQuery(`objects/${objectId}/products/${productId}`).delete();
        // add color style and note
        // ID.backgroundColor = {red: 1};
        ORDER_BY.value = "delete";
        // ID.note = "deleted";
        TIMESTAMP.value = "deleted";
        await ORDER_BY.save();
        await TIMESTAMP.save();
        await ctx.replyWithHTML(`<b>${productId} deleted</b>`);
      } else {
        await ctx.replyWithHTML(`<b>${newValue}</b> must be a del!`);
      }
      return;
    }
    const cell = sheet.getCellByA1(`${column}${productRowNumber}`);
    const oldData = cell.value;
    if (todo === "price" || todo === "purchasePrice") {
      // comma to dot
      newValue = + newValue.replace(",", ".");
      if (isNaN(newValue)) {
        await ctx.replyWithHTML(`<b>${todo}</b> must be a number!` + ctx.state.sessionMsg.linkHTML());
        return;
      }
      // convert to number
    }
    // update the cell contents and formatting
    cell.value = newValue;
    await cell.save();
    // firestore update data
    // TODO Validate
    await store.updateRecord(`objects/${objectId}/products/${productId}`, {
      [todo]: newValue,
    });
    await store.defaultSession(ctx);
    await ctx.replyWithHTML(`${productId} <b>field ${todo} changed ${oldData} to ${newValue}</b>`);
  } catch (error) {
    await ctx.replyWithHTML(`Sheet ${error}`);
  }
};

// change price in cart deprecated!!!
// const changeCartProductPrice = async (ctx, price) => {
//   const objectId = ctx.state.sessionMsg.url.searchParams.get("oId");
//   const id = ctx.state.sessionMsg.url.searchParams.get("cartProductId");
//   // comma to dot
//   price = + price.replace(",", ".");
//   if (isNaN(price)) {
//     await ctx.replyWithHTML(`<b>${price}</b> must be a number!` + ctx.state.sessionMsg.linkHTML(), {
//       reply_markup: {
//         force_reply: true,
//         input_field_placeholder: "Must be a number",
//       }});
//     return;
//   }
//   await cart.update({
//     objectId,
//     userId: ctx.from.id,
//     product: {
//       [id]: {
//         price,
//       },
//     },
//   });
//   await ctx.replyWithHTML(`<b>${id}</b> new price ${price}`);
// };
// change catalog
const changeCatalog = async (ctx, newValue) => {
  // const objectId = ctx.state.sessionMsg.url.searchParams.get("oId");
  const catalogId = ctx.state.sessionMsg.url.searchParams.get("upload-catalogId");
  // const scene = ctx.state.sessionMsg.url.searchParams.get("scene");
  const field = ctx.state.sessionMsg.url.searchParams.get("field");
  let caption = "updated";
  // let field = "";
  if (newValue === "del") {
    newValue = FieldValue.delete();
    caption = "deleted";
  }
  // if (scene === "upload-postId") {
  //   field = "postId";
  //   if (newValue === "del") {
  //     newValue = firestore.FieldValue.delete();
  //     caption = "deleted";
  //   } else {
  //     // validate postId
  //     newValue = + newValue;
  //     if (!Number.isInteger(newValue)) {
  //       await ctx.replyWithHTML(`<b>${newValue}</b> must be a integer!` + ctx.state.sessionMsg.linkHTML(), {
  //         reply_markup: {
  //           force_reply: true,
  //           input_field_placeholder: "postId",
  //         }});
  //       return;
  //     }
  //   }
  // }
  await store.updateRecord(`catalogs/${catalogId}`, {
    [field]: newValue,
  });
  await ctx.replyWithHTML(`<b>${catalogId}</b> ${field} ${caption}`);
};
// upload Merch Centere
// merch center
const uploadMerch = async (ctx, next) => {
  if (ctx.state.pathParams[0] === "uploadMerch") {
    const productId = ctx.state.pathParams[1];
    const objectId = ctx.state.sessionMsg.url.searchParams.get("oId");
    // const object = await store.findRecord(`objects/${objectId}`);
    const product = await store.findRecord(`objects/${objectId}/products/${productId}`);
    let publicImgUrl = null;
    if (product.mainPhoto) {
      publicImgUrl = `photos/o/${objectId}/p/${product.id}/${product.mainPhoto}/2.jpg`;
    }
    const photoUrl = await photoCheckUrl(publicImgUrl);
    const content = google.content("v2.1");
    // add scope content in admin.google!!!
    const auth = new google.auth.JWT({
      keyFile: "./bot/rzk-com-ua-d1d3248b8410.json",
      scopes: ["https://www.googleapis.com/auth/content"],
      subject: "nadir@absemetov.org.ua",
    });
    google.options({auth: auth});
    // Do the magic
    // const res = await content.products.insert({
    if (product.nameRu) {
      await content.products.insert({
        merchantId: "120890507",
        resource: {
          "channel": "online",
          "contentLanguage": "ru",
          "offerId": product.id,
          "targetCountry": "UA",
          "title": `${product.brand ? product.brand + " - " : ""}${product.nameRu} (${product.id})`,
          "brand": `${product.brand ? product.brand : "Viko.org.ua"}`,
          "description": "Купить выключатели и розетки Viko, Gunsan, Nilson оптом!",
          "link": `https://viko.org.ua/ru/o/${objectId}/p/${product.id}`,
          "imageLink": photoUrl,
          "availability": "in stock",
          "condition": "new",
          "price": {
            "value": product.price,
            "currency": "UAH",
          },
        },
      });
    }
    // uk lang
    await content.products.insert({
      merchantId: "120890507",
      resource: {
        "channel": "online",
        "contentLanguage": "uk",
        "offerId": product.id,
        "targetCountry": "UA",
        "title": `${product.brand ? product.brand + " - " : ""}${product.name} (${product.id})`,
        "brand": `${product.brand ? product.brand : "Viko.org.ua"}`,
        "description": "Купити вимикачі Viko, Gunsan, Nilson оптом!",
        "link": `https://viko.org.ua/o/${objectId}/p/${product.id}`,
        "imageLink": photoUrl,
        "availability": "in stock",
        "condition": "new",
        "price": {
          // "value": roundNumber(product.price * object.currencies[product.currency]),
          "value": product.price,
          "currency": "UAH",
        },
      },
    });
    // console.log(res.data);
    await ctx.answerCbQuery("Merch upload!");
  } else {
    return next();
  }
};
uploadActions.push(uploadMerch);

// upload trigger
// const runtimeOpts = {
//   timeoutSeconds: 540,
//   memory: "1GB",
// };

// add new page param!
// const productsUploadFunction = functions.region("europe-central2")
//     .runWith(runtimeOpts).firestore
//     .document("objects/{objectId}/uploads/start")
//     .onCreate(async (snap, context) => {
//       const objectId = context.params.objectId;
//       const uploads = snap.data();
//       try {
//         await uploadProducts(bot.telegram, objectId, uploads.sheetId, uploads.pageName);
//       } catch (error) {
//         await snap.ref.delete();
//         await bot.telegram.sendMessage(94899148, `Sheet ${error}`,
//             {parse_mode: "html"});
//       }
//       await snap.ref.delete();
//       return null;
//     });
// new admin upload main catalogs
const uploadCatalogs = async (telegram) => {
  await telegram.reply("Загружаем каталоги...");
  const settings = await store.findRecord("/settings/catalogsUpload");
  const lastUplodingTime = settings.lastUplodingTime || 0;
  const startTime = new Date();
  // for goods and catalogs
  const updatedAtTimestamp = Math.floor(startTime / 1000);
  // per page default 500
  const perPage = 500;
  // Max upload goods
  const maxUploadGoods = 2000;
  // Catalogs set array
  const catalogsIsSet = new Set();
  const catalogsDeleteSet = new Set();
  // let deletedCatalogs = 0;
  let batchCatalogs = getFirestore().batch();
  let batchCatalogsCount = 0;
  // load sheet
  const doc = new GoogleSpreadsheet("1NdlYGQb3qUiS5D7rkouhZZ8Q7KvoJ6kTpKMtF2o5oVM");
  await doc.useServiceAccountAuth(creds, "nadir@absemetov.org.ua");
  // loads document properties and worksheets
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle[`catalogs-${process.env.BOT_LANG}`];
  if (sheet) {
    // await telegram.sendMessage(94899148, `<b>Loading catalogs from ${doc.title}\n` +
    // `Count rows: ${sheet.rowCount}</b>`,
    // {parse_mode: "html"});
    await telegram.replyWithHTML(`<b>Loading [catalogs-${process.env.BOT_LANG}] from ${doc.title}\n` +
     `Count rows: ${sheet.rowCount}</b>`);
  } else {
    throw new Error(`<b>Sheet title "catalogs-${process.env.BOT_LANG}" not found!</b>`);
  }
  const rowCount = sheet.rowCount;
  // read rows
  for (let i = 1; i < rowCount; i += perPage) {
    // write batch
    const batchCatalogsDelete = getFirestore().batch();
    // get rows data, use get cell because this method have numder formats
    await sheet.loadCells({
      startRowIndex: i, endRowIndex: i + perPage, startColumnIndex: 0, endColumnIndex: 2,
    });
    // loop rows from SHEET
    for (let j = i; j < i + perPage && j < rowCount; j++) {
      // get cell insst
      const GROUP = sheet.getCell(j, 0);
      const TIMESTAMP = sheet.getCell(j, 1);
      const rowUpdatedTime = TIMESTAMP.value || 1;
      // const prodMustDel = ID.value && NAME.value && ID.backgroundColor && Object.keys(ID.backgroundColor).length === 1 && ID.backgroundColor.red === 1 && rowUpdatedTime !== "deleted";
      const newDataDetected = rowUpdatedTime > lastUplodingTime;
      const row = {
        GROUP: GROUP.value && GROUP.value.split("#") || [],
      };
      // generate catalogs array
      // const pathArrayHelper = [];
      // const delCatalogs = [];
      // const groupArray = row.GROUP.map((catalogName) => {
      //   let id = null;
      //   // let parentId = null;
      //   let orderNumber = null;
      //   // let postId = null;
      //   let nameCat = catalogName.trim();
      //   // parce catalog url
      //   const url = nameCat.match(/(.+)\[(.+)\]$/);
      //   if (url) {
      //     nameCat = url[1].trim();
      //     const partial = url[2].split(",");
      //     id = partial[0] ? partial[0].trim() : translit(nameCat);
      //     orderNumber = partial[1] && + partial[1];
      //     // postId = partial[2] && + partial[2];
      //   } else {
      //     id = translit(nameCat);
      //   }
      //   // delete catalogs
      //   if (nameCat.charAt(0) === "%") {
      //     if (id.charAt(0) === "%") {
      //       id = id.replace(/^%-*/, "");
      //     }
      //     pathArrayHelper.push(id);
      //     delCatalogs.push({id: pathArrayHelper.join("#"), del: true});
      //   } else {
      //     pathArrayHelper.push(id);
      //     delCatalogs.push({id: pathArrayHelper.join("#"), del: false});
      //   }
      //   // use ru locale
      //   const [name, nameRu] = nameCat.split("|").map((item) => item.trim());
      //   return {
      //     id,
      //     name,
      //     nameRu,
      //     url: pathArrayHelper.join("/"),
      //     parentId: pathArrayHelper.length > 1 ? pathArrayHelper.slice(0, -1).join("#") : null,
      //     orderNumber,
      //   };
      // });
      // for (const [index, value] of delCatalogs.entries()) {
      //   if (value.del) {
      //     if (checkNestedCat(index, delCatalogs)) {
      //       batchCatalogsDelete.delete(store.getQuery(`catalogs/${value.id}`));
      //       ++ deletedCatalogs;
      //     } else {
      //       // alert error
      //       throw new Error(`Delete catalog problem ${value.id}, first delete nested cat!!!`);
      //     }
      //   }
      // }
      // parse catalog cell
      const pathArrayHelper = [];
      const catUrlArray = [];
      const groupArray = [];
      let delCatalogs = false;
      for (const catalogOpt of row.GROUP) {
        const options = catalogOpt.match(/^\s*([\wа-яА-ЯіїєґІЇЄҐ][\wа-яА-ЯіїєґІЇЄҐ\s(),-]*[\wа-яА-ЯіїєґІЇЄҐ)])\s*\|?\s*([\wа-яА-Я][\wа-яА-Я\s(),-]*[\wа-яА-Я)])?\s*\[\s*([\w][\w-]*[\w])?\s*,\s*([\d]+\s*)\s*,?\s*(del)?\s*\]\s*$/);
        if (options) {
          const id = options[3] ? options[3] : translit(options[1]);
          pathArrayHelper.push(id);
          const docPath = pathArrayHelper.join("#");
          if (delCatalogs) {
            // delCatalogs.push({id: pathArrayHelper.join("#")});
            if (!catalogsDeleteSet.has(docPath)) {
              catalogsDeleteSet.add(docPath);
              batchCatalogsDelete.delete(store.getQuery(`catalogs/${docPath}`));
            }
            // ++ deletedCatalogs;
          } else {
            // delete catalog and all nested
            if (options[5]) {
              // delCatalogs.push({id: pathArrayHelper.join("#")});
              if (!catalogsDeleteSet.has(docPath)) {
                catalogsDeleteSet.add(docPath);
                batchCatalogsDelete.delete(store.getQuery(`catalogs/${docPath}`));
              }
              delCatalogs = true;
              // ++ deletedCatalogs;
            } else {
              if (options[2]) {
                catUrlArray.push({
                  name: options[1],
                  nameRu: options[2],
                  url: pathArrayHelper.join("/"),
                });
              } else {
                catUrlArray.push({
                  name: options[1],
                  url: pathArrayHelper.join("/"),
                });
              }
              groupArray.push({
                id,
                name: options[1],
                nameRu: options[2],
                docPath,
                parentId: pathArrayHelper.length > 1 ? pathArrayHelper.slice(0, -1).join("#") : null,
                orderNumber: +options[4],
                pathArray: [...catUrlArray],
              });
            }
          }
        } else {
          throw new Error(`In row <b>${j + 1}</b>, Catalog format problem use name|nameRu[id, orderNumber, del]!`);
        }
      }
      // new data detected
      if (row.GROUP.length && newDataDetected) {
        const catalog = {
          groupName: groupArray.map((cat) => cat.name),
          groupNameRu: groupArray.map((cat) => cat.nameRu),
          group: groupArray.map((cat) => cat.id),
          groupOrder: groupArray.map((cat) => cat.orderNumber),
          groupLength: groupArray.length,
        };
        const regExpNames = /^[^<>]+$/;
        // validate product
        const rulesProductRow = {
          "groupName.*": `required|string|max:90|regex:${regExpNames}`,
          "groupNameRu.*": `string|max:90|regex:${regExpNames}`,
          "group.*": "required|alpha_dash|max:40",
          "groupOrder.*": "required|integer|min:1",
          "groupLength": "required|min:1|max:7",
        };
        const validateProductRow = new Validator(catalog, rulesProductRow);
        // check fails
        if (validateProductRow.fails()) {
          let errorRow = `In row <b>${j + 1}</b> catalog\n`;
          for (const [key, error] of Object.entries(validateProductRow.errors.all())) {
            // errorRow += `Column <b>${key}</b> => <b>${error}</b> \n${JSON.stringify(catalog)}`;
            errorRow += `Column <b>${key}</b> => <b>${error}</b>\n`;
          }
          throw new Error(errorRow);
        }
        if (validateProductRow.passes()) {
          // check limit goods
          if (catalogsIsSet.size === maxUploadGoods) {
            throw new Error(`Limit <b>${maxUploadGoods}</b> catalogs!`);
          }
          // save catalogs to batch
          // const pathArray = [];
          // const catUrlArray = [];
          for (const catalog of groupArray) {
            // helper url for algolia
            // helpArray.push(catalog.name);
            // check if catalog added to batch
            // helper arrays
            // pathArray.push(catalog.id);
            // if (catalog.nameRu) {
            //   catUrlArray.push({
            //     name: catalog.name,
            //     nameRu: catalog.nameRu,
            //     url: pathArray.join("/"),
            //   });
            // } else {
            //   catUrlArray.push({
            //     name: catalog.name,
            //     url: pathArray.join("/"),
            //   });
            // }
            if (!catalogsIsSet.has(catalog.docPath)) {
              catalogsIsSet.add(catalog.docPath);
              const catalogRef = getFirestore().collection("catalogs").doc(catalog.docPath);
              batchCatalogs.set(catalogRef, {
                "name": catalog.name,
                "nameRu": catalog.nameRu || FieldValue.delete(),
                "parentId": catalog.parentId,
                "orderNumber": catalog.orderNumber,
                "updatedAt": updatedAtTimestamp,
                "pathArray": catalog.pathArray,
              }, {merge: true});
              // if 500 items commit
              if (++batchCatalogsCount === perPage) {
                await batchCatalogs.commit();
                // batchCatalogs = firebase.firestore().batch();
                batchCatalogs = getFirestore().batch();
                batchCatalogsCount = 0;
              }
            }
          }
        }
      }
    }
    await batchCatalogsDelete.commit();
    // send done info
    // await telegram.sendMessage(94899148, `<b>${i + perPage - 1} rows scaned from ${rowCount}</b>`,
    //     {parse_mode: "html"});
    await telegram.replyWithHTML(`<b>${i + perPage - 1} rows scaned from ${rowCount}</b>`);
    // save cell changes
    await sheet.saveUpdatedCells();
    // clear cache
    sheet.resetLocalCache(true);
  }
  // commit last catalog batch
  if (batchCatalogsCount !== perPage) {
    await batchCatalogs.commit();
  }
  // save lastUplodingTime
  await store.updateRecord("/settings/catalogsUpload", {
    lastUplodingTime: updatedAtTimestamp,
  });
  // send notify
  const uploadTime = new Date() - startTime;
  // await telegram.sendMessage(94899148, `Data uploaded in ${Math.floor(uploadTime/1000)}s\n` +
  //     `Catalogs added: ${catalogsIsSet.size}\n` +
  //     `${deletedCatalogs > 0 ? `Deleted Catalogs: ${deletedCatalogs}` : ""}`,
  // {parse_mode: "html"});
  await telegram.replyWithHTML(`Data uploaded in ${Math.floor(uploadTime/1000)}s\n` +
    `Catalogs added: ${catalogsIsSet.size}\n` +
    `${catalogsDeleteSet.size > 0 ? `Deleted Catalogs: ${catalogsDeleteSet.size}` : ""}`);
};
// new uploader
const uploadProductsNew = async (telegram, objectId, sheetId, pageName) => {
  const object = await store.findRecord(`objects/${objectId}`);
  // upload to merchant
  if (pageName === "upload-to-merchant" && process.env.BOT_LANG === "uk") {
    await uploadToMerchant(telegram, object.name);
    return;
  }
  const lastUplodingTime = object.lastUplodingTime || 0;
  const startTime = new Date();
  // for goods and catalogs
  const updatedAtTimestamp = Math.floor(startTime / 1000);
  // per page default 500
  const perPage = 500;
  // Max upload goods
  const maxUploadGoods = 2000;
  // Products set array
  const productIsSet = new Set();
  let deletedProducts = 0;
  // load sheet
  const doc = new GoogleSpreadsheet(sheetId);
  await doc.useServiceAccountAuth(creds, "nadir@absemetov.org.ua");
  // loads document properties and worksheets
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle[pageName];
  if (sheet) {
    await telegram.sendMessage(94899148, `<b>Loading goods from ${doc.title}\n`+
    `Count rows: ${sheet.rowCount}</b>`,
    {parse_mode: "html"});
  } else {
    throw new Error(`<b>Sheet title ${pageName} not found!</b>`);
  }
  const rowCount = sheet.rowCount;
  // read rows
  for (let i = 1; i < rowCount; i += perPage) {
    // write batch
    // const batchGoods = firebase.firestore().batch();
    // const batchGoodsDelete = firebase.firestore().batch();
    // const batchCatalogsDelete = firebase.firestore().batch();
    const batchGoods = getFirestore().batch();
    const batchGoodsDelete = getFirestore().batch();
    // const batchCatalogsDelete = getFirestore().batch();
    // get rows data, use get cell because this method have numder formats
    await sheet.loadCells({
      startRowIndex: i, endRowIndex: i + perPage, startColumnIndex: 0, endColumnIndex: 11,
    });
    // loop rows from SHEET
    for (let j = i; j < i + perPage && j < rowCount; j++) {
      // get cell insst
      const ORDER_BY = sheet.getCell(j, 0);
      const ID = sheet.getCell(j, 1);
      const NAME = sheet.getCell(j, 2);
      const PURCHASE_PRICE = sheet.getCell(j, 3);
      const PRICE = sheet.getCell(j, 4);
      // const CURRENCY = sheet.getCell(j, 5);
      const UNIT = sheet.getCell(j, 5);
      const GROUP = sheet.getCell(j, 6);
      const TAGS = sheet.getCell(j, 7);
      const BRAND = sheet.getCell(j, 8);
      const TIMESTAMP = sheet.getCell(j, 9);
      const NAME_RU = sheet.getCell(j, 10);
      const rowUpdatedTime = TIMESTAMP.value || 1;
      // const prodMustDel = ID.value && NAME.value && ID.backgroundColor && Object.keys(ID.backgroundColor).length === 1 && ID.backgroundColor.red === 1 && rowUpdatedTime !== "deleted";
      const prodMustDel = ID.value && NAME.value && ORDER_BY.value === "delete" && rowUpdatedTime !== "deleted";
      const newDataDetected = !prodMustDel && rowUpdatedTime > lastUplodingTime;
      const row = {
        ORDER_BY: ORDER_BY.value && ORDER_BY.value.toString().trim().replace(/^!\s*/, ""),
        ID: ID.value && ID.value.toString().trim(),
        NAME: NAME.value && NAME.value.toString().trim(),
        NAME_RU: NAME_RU.value && NAME_RU.value.toString().trim(),
        PURCHASE_PRICE: PURCHASE_PRICE.value,
        PRICE: PRICE.value,
        // CURRENCY: CURRENCY.value,
        UNIT: UNIT.value,
        GROUP: GROUP.value && GROUP.value.split("#") || [],
        TAGS: TAGS.value && TAGS.value.split(",") || [],
        BRAND: BRAND.value ? BRAND.value.match(/^\s*([\wа-яА-ЯіїєґІЇЄҐ][\wа-яА-ЯіїєґІЇЄҐ\s()-]*[\wа-яА-ЯіїєґІЇЄҐ)])\s*\[?\s*(\w[\w.-]*\w\s*)?\]?\s*$/) || [] : [],
        AVAILABILITY: ORDER_BY.value && ORDER_BY.value.toString().trim().charAt(0) !== "!",
      };
      // generate catalogs array
      // const pathArrayHelper = [];
      // const groupArray = row.GROUP.map((catalogName) => {
      //   let id = null;
      //   // let parentId = null;
      //   let orderNumber = null;
      //   // let postId = null;
      //   let nameCat = catalogName.trim();
      //   // parce catalog url
      //   const url = nameCat.match(/(.+)\[(.+)\]$/);
      //   if (url) {
      //     nameCat = url[1].trim();
      //     const partial = url[2].split(",");
      //     id = partial[0] ? partial[0].trim() : translit(nameCat);
      //     orderNumber = partial[1] && + partial[1];
      //     // postId = partial[2] && + partial[2];
      //   } else {
      //     id = translit(nameCat);
      //   }
      //   pathArrayHelper.push(id);
      //   // use ru locale
      //   const [name, nameRu] = nameCat.split("|").map((item) => item.trim());
      //   return {
      //     id,
      //     name,
      //     nameRu,
      //     url: pathArrayHelper.join("/"),
      //     parentId: pathArrayHelper.length > 1 ? pathArrayHelper.slice(0, -1).join("#") : null,
      //     orderNumber,
      //   };
      // });
      // new parcer catalogs
      const pathArrayHelper = [];
      const catUrlArray = [];
      const groupArray = [];
      for (const catalogOpt of row.GROUP) {
        const options = catalogOpt.match(/^\s*([\wа-яА-ЯіїєґІЇЄҐ][\wа-яА-ЯіїєґІЇЄҐ\s(),-]*[\wа-яА-ЯіїєґІЇЄҐ)])\s*\|?\s*([\wа-яА-Я][\wа-яА-Я\s(),-]*[\wа-яА-Я)])?\s*\[\s*([\w][\w-]*[\w])?\s*,\s*([\d]+\s*)\s*,?\s*(del)?\s*\]\s*$/);
        if (options) {
          const id = options[3] ? options[3] : translit(options[1]);
          pathArrayHelper.push(id);
          const docPath = pathArrayHelper.join("#");
          if (options[2]) {
            catUrlArray.push({
              name: options[1],
              nameRu: options[2],
              url: pathArrayHelper.join("/"),
            });
          } else {
            catUrlArray.push({
              name: options[1],
              url: pathArrayHelper.join("/"),
            });
          }
          groupArray.push({
            id,
            name: options[1],
            nameRu: options[2],
            docPath,
            // parentId: pathArrayHelper.length > 1 ? pathArrayHelper.slice(0, -1).join("#") : null,
            orderNumber: +options[4],
            pathArray: [...catUrlArray],
          });
        } else {
          throw new Error(`In row <b>${j + 1}</b>, Catalog format problem use name|nameRu[id, orderNumber, del]!`);
        }
      }
      // add to delete batch
      if (prodMustDel) {
        batchGoodsDelete.delete(store.getQuery(`objects/${objectId}/products/${row.ID}`));
        ++ deletedProducts;
        TIMESTAMP.value = "deleted";
      }
      // check if this products have ID and NAME
      if (row.ID && row.NAME && newDataDetected) {
        // generate tags array
        const tags = row.TAGS.map((tag) => tag.trim());
        // product data
        // use ru locale todo custom column NAME_RU
        // const [name, nameRu] = row.NAME.split("|").map((item) => item.trim());
        const product = {
          id: row.ID,
          name: row.NAME,
          nameRu: row.NAME_RU,
          purchasePrice: row.PURCHASE_PRICE ? row.PURCHASE_PRICE : null,
          price: row.PRICE ? roundNumber(row.PRICE) : null,
          groupName: groupArray.map((cat) => cat.name),
          groupNameRu: groupArray.map((cat) => cat.nameRu),
          group: groupArray.map((cat) => cat.id),
          groupOrder: groupArray.map((cat) => cat.orderNumber),
          groupLength: groupArray.length,
          tags,
          // currency: row.CURRENCY,
          unit: row.UNIT,
          brand: row.BRAND[1],
          brandSite: row.BRAND[2] ? "https://" + row.BRAND[2] : "",
          orderNumber: + row.ORDER_BY,
          availability: row.AVAILABILITY,
        };
        const regExpNames = /^[^<>]+$/;
        // validate product
        const rulesProductRow = {
          "id": "required|alpha_dash|max:40",
          "name": `required|string|max:90|regex:${regExpNames}`,
          "nameRu": `string|max:90|regex:${regExpNames}`,
          "purchasePrice": "numeric",
          "price": "required|numeric",
          "groupLength": "required|min:1|max:7",
          "groupName.*": `required|string|max:90|regex:${regExpNames}`,
          "groupNameRu.*": `string|max:90|regex:${regExpNames}`,
          "group.*": "required|alpha_dash|max:40",
          "groupOrder.*": "required|integer|min:1",
          "tags.*": `string|max:40|regex:${regExpNames}`,
          "brand": `string|max:40|regex:${regExpNames}`,
          "brandSite": "url",
          // "currency": "required|in:USD,EUR,RUB,UAH",
          "unit": "required|in:м,шт,кг",
          "orderNumber": "required|integer|min:1",
          "availability": "boolean",
        };
        const validateProductRow = new Validator(product, rulesProductRow);
        // check fails
        if (validateProductRow.fails()) {
          let errorRow = `In row <b>${j + 1}</b> Product ID <b>${product.id}</b>\n`;
          for (const [key, error] of Object.entries(validateProductRow.errors.all())) {
            // errorRow += `Column <b>${key}</b> => <b>${error}</b> \n${JSON.stringify(product)}`;
            errorRow += `Column <b>${key}</b> => <b>${error}</b>\n`;
          }
          throw new Error(errorRow);
        }
        if (validateProductRow.passes()) {
          // check limit goods
          if (productIsSet.size === maxUploadGoods) {
            throw new Error(`Limit <b>${maxUploadGoods}</b> goods!`);
          }
          // add products in batch, check id product is unic
          if (productIsSet.has(product.id)) {
            throw new Error(`Product ID <b>${product.id}</b> in row <b>${j + 1}</b> not unic`);
          } else {
            productIsSet.add(product.id);
          }
          const productRef = getFirestore().collection("objects").doc(objectId).collection("products").doc(product.id);
          // console.log(groupArray[groupArray.length - 1].pathArray);
          batchGoods.set(productRef, {
            "name": product.name,
            "nameRu": product.nameRu || FieldValue.delete(),
            "purchasePrice": product.purchasePrice,
            "price": product.price,
            // "currency": product.currency,
            // "currency": FieldValue.delete(),
            "unit": product.unit,
            "orderNumber": product.orderNumber,
            // "catalogId": groupArray[groupArray.length - 1].url.replace(/\//g, "#"),
            "catalogId": groupArray[groupArray.length - 1].docPath,
            // "pathArray": groupArray.map((catalog) => {
            //   if (catalog.nameRu) {
            //     return {name: catalog.name, nameRu: catalog.nameRu, url: catalog.url};
            //   } else {
            //     return {name: catalog.name, url: catalog.url};
            //   }
            // }),
            "pathArray": groupArray[groupArray.length - 1].pathArray,
            "tags": tags.length ? tags : FieldValue.delete(),
            // "tagsNames": firestore.FieldValue.delete(),
            "brand": product.brand ? product.brand : FieldValue.delete(),
            "brandSite": product.brandSite ? product.brandSite : FieldValue.delete(),
            "updatedAt": updatedAtTimestamp,
            "objectName": object.name,
            "rowNumber": j + 1,
            "workSheet": pageName,
            "availability": product.availability,
            "objectId": object.id,
          }, {merge: true});
        }
      }
    }
    // commit goods
    await batchGoods.commit();
    // delete goods and catalogs
    await batchGoodsDelete.commit();
    // await batchCatalogsDelete.commit();
    // send done info
    await telegram.sendMessage(94899148, `<b>${i + perPage - 1} rows scaned from ${rowCount}</b>`,
        {parse_mode: "html"});
    // save cell changes
    await sheet.saveUpdatedCells();
    // clear cache
    sheet.resetLocalCache(true);
  }
  // save lastUplodingTime
  await store.updateRecord(`objects/${objectId}`, {
    lastUplodingTime: updatedAtTimestamp,
  });
  // send notify
  const uploadTime = new Date() - startTime;
  await telegram.sendMessage(94899148, `Data uploaded in ${Math.floor(uploadTime/1000)}s\n` +
      `Goods added: ${productIsSet.size}\n` +
      `${deletedProducts > 0 ? `Deleted Goods: ${deletedProducts}\n<b>Don't forget to delete the product catalog!!!</b>` : ""}`,
  {parse_mode: "html"});
};

// 2nd generation
const productsUploadFunction = onDocumentCreated({
  document: "objects/{objectId}/uploads/start",
  region: "europe-central2",
  timeoutSeconds: 540,
  maxInstances: 10,
  memory: "1GiB"}, async (event) => {
  const objectId = event.params.objectId;
  const uploads = event.data.data();
  try {
    // await uploadProducts(bot.telegram, objectId, uploads.sheetId, uploads.pageName);
    await uploadProductsNew(bot.telegram, objectId, uploads.sheetId, uploads.pageName);
  } catch (error) {
    await event.data.ref.delete();
    await bot.telegram.sendMessage(94899148, `Sheet ${error}`,
        {parse_mode: "html"});
  }
  await event.data.ref.delete();
  return null;
});
// exports
exports.productsUploadFunction = productsUploadFunction;
exports.uploadForm = uploadForm;
exports.changeProduct = changeProduct;
exports.changeCatalog = changeCatalog;
exports.uploadActions = uploadActions;
exports.uploadProductsTrigger = uploadProductsTrigger;
exports.uploadCatalogs = uploadCatalogs;
