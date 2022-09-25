const firebase = require("firebase-admin");
const firestore = require("firebase-admin/firestore");
const functions = require("firebase-functions");
const {Telegraf} = require("telegraf");
const {GoogleSpreadsheet} = require("google-spreadsheet");
const creds = require("./rzk-com-ua-d1d3248b8410.json");
const Validator = require("validatorjs");
const {google} = require("googleapis");
const CyrillicToTranslit = require("cyrillic-to-translit-js");
const {store, roundNumber, photoCheckUrl} = require("./bot_store_cart");
const cyrillicToTranslit = new CyrillicToTranslit();
const cyrillicToTranslitUk = new CyrillicToTranslit({preset: "uk"});
// upload from googleSheet
const uploadProducts = async (telegram, objectId, sheetId) => {
  const object = await store.findRecord(`objects/${objectId}`);
  const startTime = new Date();
  // for goods and catalogs
  const updatedAtTimestamp = Math.floor(startTime / 1000);
  // per page default 500
  const perPage = 500;
  // Max upload goods
  const maxUploadGoods = 2000;
  // Catalogs set array
  const catalogsIsSet = new Map();
  // Products set array
  const productIsSet = new Set();
  // array for save tags
  const catalogsTagsMap = new Map();
  // batch catalogs
  let batchCatalogs = firebase.firestore().batch();
  let batchCatalogsCount = 0;
  // load sheet
  const doc = new GoogleSpreadsheet(sheetId);
  await doc.useServiceAccountAuth(creds, "nadir@absemetov.org.ua");
  // loads document properties and worksheets
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle["products"];
  await telegram.sendMessage(94899148, `<b>Loading goods from ${doc.title}\n`+
  `Count rows: ${sheet.rowCount}</b>`,
  {parse_mode: "html"});
  const rowCount = sheet.rowCount;
  // read rows
  for (let i = 1; i < rowCount; i += perPage) {
    // write batch
    const batchGoods = firebase.firestore().batch();
    // get rows data, use get cell because this method have numder formats
    await sheet.loadCells({
      startRowIndex: i, endRowIndex: i + perPage, startColumnIndex: 0, endColumnIndex: 9,
    });
    // loop rows from SHEET
    for (let j = i; j < i + perPage && j < rowCount; j++) {
      const row = {
        ID: sheet.getCell(j, 0).value ? sheet.getCell(j, 0).value.toString() : sheet.getCell(j, 0).value,
        NAME: sheet.getCell(j, 1).value ? sheet.getCell(j, 1).value.trim() : sheet.getCell(j, 1).value,
        PURCHASE_PRICE: sheet.getCell(j, 2).value,
        PRICE: sheet.getCell(j, 3).value,
        CURRENCY: sheet.getCell(j, 4).value,
        UNIT: sheet.getCell(j, 5).value,
        GROUP: sheet.getCell(j, 6).value,
        TAGS: sheet.getCell(j, 7).value,
        BRAND: sheet.getCell(j, 8).value,
      };
      // check if this products have ID and NAME
      if (row.ID && row.NAME) {
        // generate catalogs array
        const pathArrayHelper = [];
        const groupArray = row.GROUP ? row.GROUP.split("#").map((catalogName, index, groupArrayOrigin) => {
          let id = null;
          let parentId = null;
          let name = catalogName.trim();
          // let parentName = null;
          // set parentId and parentName
          if (index !== 0) {
            const parentCatalog = groupArrayOrigin[index - 1].trim();
            // parentName = parentCatalog;
            // Parent exist
            const url = parentCatalog.match(/(.+)\[([[a-zA-Z0-9-_]+)\]$/);
            if (url) {
              // parentName = url[1].trim();
              parentId = url[2].trim();
            } else {
              parentId = cyrillicToTranslitUk.transform(cyrillicToTranslit.transform(parentCatalog, "-")).toLowerCase();
            }
          }
          const url = catalogName.match(/(.+)\[([[a-zA-Z0-9-_]+)\]$/);
          // url exist
          if (url) {
            name = url[1].trim();
            id = url[2].trim();
          } else {
            id = cyrillicToTranslitUk.transform(cyrillicToTranslit.transform(name, "-")).toLowerCase();
          }
          pathArrayHelper.push(id);
          return {
            id,
            name,
            url: pathArrayHelper.join("/"),
            parentId,
            // parentName,
          };
        }) : [];
        // generate tags array
        const tags = row.TAGS ? row.TAGS.split(",").map((tag) => {
          const name = tag.trim();
          const id = cyrillicToTranslitUk.transform(cyrillicToTranslit.transform(name, "-")).toLowerCase();
          return {id, name};
        }) : [];
        // product data
        const product = {
          id: row.ID,
          name: row.NAME,
          purchasePrice: row.PURCHASE_PRICE ? roundNumber(row.PURCHASE_PRICE) : null,
          price: row.PRICE ? roundNumber(row.PRICE) : null,
          groupLength: groupArray.length ? groupArray.length : null,
          tags: tags.length ? tags.map((tag) => tag.id) : firestore.FieldValue.delete(),
          currency: row.CURRENCY,
          unit: row.UNIT,
          brand: row.BRAND,
        };
        // validate product
        const rulesProductRow = {
          "id": "required|alpha_dash|max:16",
          "name": "required|string",
          "purchasePrice": "numeric",
          "price": "required|numeric",
          "groupLength": "required|max:5",
          "group.*.id": "alpha_dash|max:16",
          "tags.*": "alpha_dash|max:12",
          "currency": "required|in:USD,EUR,RUB,UAH",
          "unit": "required|in:м,шт",
        };
        const validateProductRow = new Validator(product, rulesProductRow);
        // check fails
        if (validateProductRow.fails()) {
          let errorRow = `In row <b>${j + 1}</b> Product ID <b>${product.id}</b>\n`;
          for (const [key, error] of Object.entries(validateProductRow.errors.all())) {
            errorRow += `Column <b>${key}</b> => <b>${error}</b> \n`;
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
            throw new Error(`Product ID <b>${product.id}</b> in row <b>${j + 1}</b> is exist`);
          } else {
            productIsSet.add(product.id);
          }
          const productRef = firebase.firestore().collection("objects").doc(objectId)
              .collection("products").doc(product.id);
          batchGoods.set(productRef, {
            "name": product.name,
            "purchasePrice": product.purchasePrice,
            "price": product.price,
            "currency": product.currency,
            "unit": product.unit,
            "orderNumber": productIsSet.size,
            "catalogId": groupArray[groupArray.length - 1].id,
            // "catalog": groupArray[groupArray.length - 1],
            // "catalogsNamePath": groupArray.map((item) => item.name).join("#"),
            "pathArray": groupArray.map((catalog) => {
              return {name: catalog.name, url: catalog.url};
            }),
            // "path": groupArray.map((catalog) => catalog.id).join("/"),
            "tags": tags.length ? tags.map((tag) => tag.id) : firestore.FieldValue.delete(),
            "tagsNames": tags.length ? tags : firestore.FieldValue.delete(),
            "brand": product.brand ? product.brand : firestore.FieldValue.delete(),
            "updatedAt": updatedAtTimestamp,
            "objectName": object.name,
          }, {merge: true});
          // save catalogs to batch
          const pathArray = [];
          const catUrlArray = [];
          for (const catalog of groupArray) {
            // helper url for algolia
            // helpArray.push(catalog.name);
            // check if catalog added to batch
            if (!catalogsIsSet.has(catalog.id)) {
              catalogsIsSet.set(catalog.id, {parentId: catalog.parentId});
              // catalogsIsSet.set(pathArray.join("-"));
              const catalogRef = firebase.firestore().collection("objects").doc(objectId)
                  .collection("catalogs").doc(catalog.id);
              batchCatalogs.set(catalogRef, {
                "name": catalog.name,
                "parentId": catalog.parentId,
                // "parentName": catalog.parentName,
                "orderNumber": catalogsIsSet.size,
                "updatedAt": updatedAtTimestamp,
                "tags": firestore.FieldValue.delete(),
                // "hierarchicalUrl": pathArray.join(" > "),
                "pathArray": [...catUrlArray],
                // "path": pathArray.length ? pathArray.join("/") : null,
              }, {merge: true});
              // helper arrays
              pathArray.push(catalog.id);
              catUrlArray.push({
                name: catalog.name,
                url: pathArray.join("/"),
              });
              // if 500 items commit
              if (++batchCatalogsCount === perPage) {
                await batchCatalogs.commit();
                batchCatalogs = firebase.firestore().batch();
                batchCatalogsCount = 0;
              }
            }
            // check if catalog moved
            if (catalogsIsSet.get(catalog.id).parentId !== catalog.parentId) {
              throw new Error(`Catalog <b>${catalog.name}</b> moved from  <b>${catalogsIsSet.get(catalog.id).parentId}</b> to  <b>${catalog.parentId}</b> in row <b>${j + 1}</b>`);
            }
          }
          // generate tags Map for last catalog
          for (const tagsRow of tags) {
            if (catalogsTagsMap.has(groupArray[groupArray.length - 1].id)) {
              if (!catalogsTagsMap.get(groupArray[groupArray.length - 1].id).has(tagsRow.id)) {
                catalogsTagsMap.get(groupArray[groupArray.length - 1].id).set(tagsRow.id, tagsRow.name);
              }
            } else {
              catalogsTagsMap.set(groupArray[groupArray.length - 1].id, new Map());
              catalogsTagsMap.get(groupArray[groupArray.length - 1].id).set(tagsRow.id, tagsRow.name);
            }
          }
        }
      }
    }
    // commit goods
    await batchGoods.commit();
    // send done info
    await telegram.sendMessage(94899148, `<b>${i + perPage - 1} rows scaned from ${rowCount}</b>`,
        {parse_mode: "html"});
    // clear cache
    sheet.resetLocalCache(true);
  }
  // commit last catalog batch
  if (batchCatalogsCount !== perPage) {
    await batchCatalogs.commit();
  }
  // save catalogs tags
  let batchCatalogsTags = firebase.firestore().batch();
  let batchCatalogsTagsCount = 0;
  for (const catalog of catalogsTagsMap) {
    const catalogRef = firebase.firestore().collection("objects").doc(objectId)
        .collection("catalogs").doc(catalog[0]);
    batchCatalogsTags.set(catalogRef, {
      "tags": Array.from(catalog[1], ([id, name]) => ({id, name})),
    }, {merge: true});
    // by 500 catalogs commit batch
    if (++batchCatalogsTagsCount === perPage) {
      await batchCatalogsTags.commit();
      batchCatalogsTags = firebase.firestore().batch();
      batchCatalogsTagsCount = 0;
    }
  }
  if (batchCatalogsTagsCount !== perPage) {
    await batchCatalogsTags.commit();
  }
  // start delete trigger
  try {
    await deleteProducts(telegram, objectId, updatedAtTimestamp);
  } catch (error) {
    // await ctx.replyWithMarkdown(`Sheet ${error}`);
    await telegram.sendMessage(94899148, `<b>Delete products error ${error}</b>`,
        {parse_mode: "html"});
  }
  // send notify
  const uploadTime = new Date() - startTime;
  await telegram.sendMessage(94899148, `<b>Data uploaded in ${Math.floor(uploadTime/1000)}s\n` +
      `Goods: ${productIsSet.size}\nCatalogs: ${catalogsIsSet.size}</b>`,
  {parse_mode: "html"});
};

// delete old products
const deleteProducts = async (telegram, objectId, updatedAt) => {
  // delete old Products
  const batchProductsDelete = firebase.firestore().batch();
  const productsDeleteSnapshot = await firebase.firestore().collection("objects").doc(objectId)
      .collection("products")
      .where("updatedAt", "<", updatedAt).limit(500).get();
  productsDeleteSnapshot.forEach((doc) =>{
    batchProductsDelete.delete(doc.ref);
  });
  await batchProductsDelete.commit();
  if (productsDeleteSnapshot.size) {
    await telegram.sendMessage(94899148, `<b>${productsDeleteSnapshot.size} products deleted</b>`,
        {parse_mode: "html"});
  }
  // delete old catalogs
  const batchCatalogsDelete = firebase.firestore().batch();
  const catalogsDeleteSnapshot = await firebase.firestore().collection("objects").doc(objectId)
      .collection("catalogs")
      .where("updatedAt", "<", updatedAt).limit(500).get();
  catalogsDeleteSnapshot.forEach((doc) =>{
    batchCatalogsDelete.delete(doc.ref);
  });
  await batchCatalogsDelete.commit();
  if (catalogsDeleteSnapshot.size) {
    await telegram.sendMessage(94899148, `<b>${catalogsDeleteSnapshot.size} catalogs deleted</b>`,
        {parse_mode: "html"});
  }
};
// create object handler
const uploadActions = [];
const createObject = async (ctx, next) => {
  if (ctx.state.routeName === "upload") {
    const objectId = ctx.state.param;
    const todo = ctx.state.params.get("todo");
    const object = await store.findRecord(`objects/${objectId}`);
    const uploads = await store.findRecord(`objects/${objectId}/uploads/start`);
    try {
      // upload goods
      if (todo === "uploadProducts") {
        const uploading = uploads && uploads.uploadProductsStart && (Math.floor(new Date() / 1000) - uploads.uploadProductsStart) < 540;
        if (!uploading) {
          await ctx.replyWithHTML(`Начинаем загрузку товаров ${object.name}\n`);
          const uploadProductsStart = Math.floor(Date.now() / 1000);
          // run trigger event, delete doc if it exist
          if (uploads) {
            await store.getQuery(`objects/${objectId}/uploads/start`).delete();
          }
          await store.createRecord(`objects/${objectId}/uploads/start`, {
            uploadProductsStart,
            sheetId: object.sheetId,
          });
        } else {
          await ctx.replyWithHTML(`<b>Products loading...please wait ${540 - (Math.floor(new Date() / 1000) - uploads.uploadProductsStart)}s</b>`);
        }
        await ctx.answerCbQuery();
        return;
      }
      // update object from link or main menu
      if (todo === "updateObject") {
        const doc = new GoogleSpreadsheet(object.sheetId);
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
        const USD = roundNumber(sheet.getCellByA1("B6").value);
        const EUR = roundNumber(sheet.getCellByA1("B7").value);
        const UAH = roundNumber(sheet.getCellByA1("B8").value);
        const RUB = roundNumber(sheet.getCellByA1("B9").value);
        const objectCheck = {
          id,
          name,
          description,
          phoneArray,
          address,
          USD,
          EUR,
          UAH,
          RUB,
        };
        const rulesObject = {
          "id": "required|alpha_dash|max:9",
          "name": "required|string",
          "description": "required|string",
          "phoneArray": "required",
          "phoneArray.*": ["required", `regex:/${process.env.BOT_PHONEREGEXP}`],
          "address": "required|string",
          "USD": "required|numeric",
          "EUR": "required|numeric",
          "UAH": "required|numeric",
          "RUB": "required|numeric",
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
          currencies: {
            USD,
            EUR,
            UAH,
            RUB,
          },
        });
        await ctx.replyWithHTML(`Данные обновлены ${objectCheck.name} /objects`);
      }
    } catch (error) {
      await ctx.replyWithHTML(`Sheet ${error}`);
    }
    await ctx.answerCbQuery("Удачных продаж!");
  } else {
    return next();
  }
};
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
uploadActions.push(createObject);
// upload Merch Centere
// merch center
const uploadMerch = async (ctx, next) => {
  if (ctx.state.routeName === "uploadMerch") {
    const productId = ctx.state.param;
    const objectId = ctx.state.params.get("o");
    const object = await store.findRecord(`objects/${objectId}`);
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
    const res = await content.products.insert({
      merchantId: "120890507",
      resource: {
        "channel": "online",
        "contentLanguage": "uk",
        "offerId": product.id,
        "targetCountry": "UA",
        "title": `${product.brand ? product.brand + " - " : ""}${product.name}`,
        "brand": `${product.brand ? product.brand : "RZK Маркет"}`,
        "description": "Rzk.com.ua - Каждая вторая розетка в Украине будет куплена у нас!",
        "link": `https://rzk.com.ua/o/${objectId}/p/${product.id}`,
        "imageLink": photoUrl,
        "availability": "in stock",
        "condition": "new",
        "price": {
          "value": roundNumber(product.price * object.currencies[product.currency]),
          "currency": "UAH",
        },
      },
    });
    console.log(res.data);
    await ctx.answerCbQuery("Merch upload!");
  } else {
    return next();
  }
};
uploadActions.push(uploadMerch);

// upload trigger
const runtimeOpts = {
  timeoutSeconds: 540,
  memory: "1GB",
};
const bot = new Telegraf(process.env.BOT_TOKEN, {
  handlerTimeout: 540000,
});
exports.productsUploadFunction = functions.region("europe-central2")
    .runWith(runtimeOpts).firestore
    .document("objects/{objectId}/uploads/start")
    .onCreate(async (snap, context) => {
      const objectId = context.params.objectId;
      const uploads = snap.data();
      try {
        await uploadProducts(bot.telegram, objectId, uploads.sheetId);
      } catch (error) {
        await snap.ref.delete();
        await bot.telegram.sendMessage(94899148, `Sheet ${error}`,
            {parse_mode: "html"});
      }
      await snap.ref.delete();
      return null;
    });
exports.uploadForm = uploadForm;
exports.uploadActions = uploadActions;
