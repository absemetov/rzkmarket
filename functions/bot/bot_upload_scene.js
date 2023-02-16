const firebase = require("firebase-admin");
const firestore = require("firebase-admin/firestore");
const functions = require("firebase-functions");
const {Telegraf} = require("telegraf");
const {GoogleSpreadsheet} = require("google-spreadsheet");
const creds = require("./rzk-com-ua-d1d3248b8410.json");
const Validator = require("validatorjs");
const {google} = require("googleapis");
const {store, roundNumber, photoCheckUrl, translit, encodeCyrillic} = require("./bot_store_cart");
const bot = new Telegraf(process.env.BOT_TOKEN, {
  handlerTimeout: 540000,
});
// check nested catalogs
function checkNestedCat(indexId, delCatalogs) {
  for (const [index, value] of delCatalogs.entries()) {
    if (index > indexId) {
      if (!value.del) {
        return false;
      }
    }
  }
  return true;
}
// upload from googleSheet
const uploadProducts = async (telegram, objectId, sheetId) => {
  const object = await store.findRecord(`objects/${objectId}`);
  const lastUplodingTime = object.lastUplodingTime || 0;
  const startTime = new Date();
  // for goods and catalogs
  const updatedAtTimestamp = Math.floor(startTime / 1000);
  // per page default 500
  const perPage = 500;
  // Max upload goods
  const maxUploadGoods = 2000;
  // Catalogs set array
  // const catalogsIsSet = new Map();
  const catalogsIsSet = new Set();
  // Products set array
  const productIsSet = new Set();
  let deletedProducts = 0;
  let deletedCatalogs = 0;
  // array for save tags
  // const catalogsTagsMap = new Map();
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
    const batchGoodsDelete = firebase.firestore().batch();
    const batchCatalogsDelete = firebase.firestore().batch();
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
      const CURRENCY = sheet.getCell(j, 5);
      const UNIT = sheet.getCell(j, 6);
      const GROUP = sheet.getCell(j, 7);
      const TAGS = sheet.getCell(j, 8);
      const BRAND = sheet.getCell(j, 9);
      const TIMESTAMP = sheet.getCell(j, 10);
      const rowUpdatedTime = TIMESTAMP.value || 1;
      const prodMustDel = ID.value && NAME.value && ID.backgroundColor && Object.keys(ID.backgroundColor).length === 1 && ID.backgroundColor.red === 1 && rowUpdatedTime !== "deleted";
      const newDataDetected = !prodMustDel && rowUpdatedTime > lastUplodingTime;
      const row = {
        ORDER_BY: ORDER_BY.value,
        ID: ID.value ? ID.value.toString() : ID.value,
        NAME: NAME.value ? NAME.value.toString().trim() : NAME.value,
        PURCHASE_PRICE: PURCHASE_PRICE.value,
        PRICE: PRICE.value,
        CURRENCY: CURRENCY.value,
        UNIT: UNIT.value,
        GROUP: GROUP.value && GROUP.value.split("#") || [],
        TAGS: TAGS.value && TAGS.value.split(",") || [],
        BRAND: BRAND.value,
      };
      // generate catalogs array
      const pathArrayHelper = [];
      const delCatalogs = [];
      const groupArray = row.GROUP.map((catalogName, index, groupArrayOrigin) => {
        let id = null;
        // let parentId = null;
        let orderNumber = null;
        // let postId = null;
        let name = catalogName.trim();
        // parce catalog url
        const url = name.match(/(.+)\[(.+)\]$/);
        if (url) {
          name = url[1].trim();
          const partial = url[2].split(",");
          id = partial[0] ? partial[0].trim() : translit(name);
          orderNumber = partial[1] && + partial[1];
          // postId = partial[2] && + partial[2];
        } else {
          id = translit(name);
        }
        // delete catalogs
        if (name.charAt(0) === "%") {
          if (id.charAt(0) === "%") {
            id = id.replace(/^%-*/, "");
          }
          pathArrayHelper.push(id);
          delCatalogs.push({id: pathArrayHelper.join("#"), del: true});
        } else {
          pathArrayHelper.push(id);
          delCatalogs.push({id: pathArrayHelper.join("#"), del: false});
        }
        // delete special char
        return {
          id,
          name,
          url: pathArrayHelper.join("/"),
          parentId: pathArrayHelper.length > 1 ? pathArrayHelper.slice(0, -1).join("#") : null,
          orderNumber,
        };
      });
      // add to delete batch
      if (prodMustDel) {
        batchGoodsDelete.delete(store.getQuery(`objects/${objectId}/products/${row.ID}`));
        ++ deletedProducts;
        for (const [index, value] of delCatalogs.entries()) {
          if (value.del) {
            if (checkNestedCat(index, delCatalogs)) {
              batchCatalogsDelete.delete(store.getQuery(`objects/${objectId}/catalogs/${value.id}`));
              ++ deletedCatalogs;
            } else {
              // alert error
              throw new Error(`Delete catalog problem ${value.id}, first delete nested cat!!!`);
            }
          }
        }
        TIMESTAMP.value = "deleted";
      }
      // check if this products have ID and NAME
      if (row.ID && row.NAME && newDataDetected) {
        // generate tags array
        const tags = row.TAGS.map((tag) => {
          return tag.trim();
        });
        // product data
        const product = {
          id: row.ID,
          name: row.NAME,
          purchasePrice: row.PURCHASE_PRICE ? roundNumber(row.PURCHASE_PRICE) : null,
          price: row.PRICE ? roundNumber(row.PRICE) : null,
          group: groupArray.map((cat) => cat.id),
          groupOrder: groupArray.map((cat) => cat.orderNumber),
          groupLength: groupArray.length,
          tags,
          currency: row.CURRENCY,
          unit: row.UNIT,
          brand: row.BRAND,
          orderNumber: row.ORDER_BY,
        };
        // validate product
        const rulesProductRow = {
          "id": "required|alpha_dash|max:40",
          "name": "required|string|max:90",
          "purchasePrice": "numeric",
          "price": "required|numeric",
          "groupLength": "required|min:1|max:5",
          "group.*": "alpha_dash|max:40",
          "groupOrder.*": "integer|min:1",
          "tags.*": "string|max:40",
          "brand": "string|max:40",
          "currency": "required|in:USD,EUR,RUB,UAH",
          "unit": "required|in:м,шт,кг",
          "orderNumber": "required|integer|min:1",
        };
        const validateProductRow = new Validator(product, rulesProductRow);
        // check fails
        if (validateProductRow.fails()) {
          let errorRow = `In row <b>${j + 1}</b> Product ID <b>${product.id}</b>\n`;
          for (const [key, error] of Object.entries(validateProductRow.errors.all())) {
            errorRow += `Column <b>${key}</b> => <b>${error}</b> \n${JSON.stringify(product)}`;
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
          const productRef = firebase.firestore().collection("objects").doc(objectId)
              .collection("products").doc(product.id);
          batchGoods.set(productRef, {
            "name": product.name,
            "purchasePrice": product.purchasePrice,
            "price": product.price,
            "currency": product.currency,
            "unit": product.unit,
            "orderNumber": product.orderNumber,
            "catalogId": groupArray[groupArray.length - 1].url.replace(/\//g, "#"),
            "pathArray": groupArray.map((catalog) => {
              return {name: catalog.name, url: catalog.url};
            }),
            "tags": tags.length ? tags : firestore.FieldValue.delete(),
            // "tagsNames": firestore.FieldValue.delete(),
            "brand": product.brand ? product.brand : firestore.FieldValue.delete(),
            "updatedAt": updatedAtTimestamp,
            "objectName": object.name,
            "rowNumber": j + 1,
          }, {merge: true});
          // save catalogs to batch
          const pathArray = [];
          const catUrlArray = [];
          for (const catalog of groupArray) {
            // helper url for algolia
            // helpArray.push(catalog.name);
            // check if catalog added to batch
            // helper arrays
            pathArray.push(catalog.id);
            catUrlArray.push({
              name: catalog.name,
              url: pathArray.join("/"),
            });
            if (!catalogsIsSet.has(pathArray.join("#"))) {
              catalogsIsSet.add(pathArray.join("#"));
              const catalogRef = firebase.firestore().collection("objects").doc(objectId)
                  .collection("catalogs").doc(pathArray.join("#"));
              batchCatalogs.set(catalogRef, {
                "name": catalog.name,
                "parentId": catalog.parentId,
                "orderNumber": catalog.orderNumber ? catalog.orderNumber : catalogsIsSet.size,
                "updatedAt": updatedAtTimestamp,
                "pathArray": [...catUrlArray],
              }, {merge: true});
              // if 500 items commit
              if (++batchCatalogsCount === perPage) {
                await batchCatalogs.commit();
                batchCatalogs = firebase.firestore().batch();
                batchCatalogsCount = 0;
              }
            }
          }
        }
      }
    }
    // commit goods
    await batchGoods.commit();
    // delete goods and catalogs
    await batchGoodsDelete.commit();
    await batchCatalogsDelete.commit();
    // send done info
    await telegram.sendMessage(94899148, `<b>${i + perPage - 1} rows scaned from ${rowCount}</b>`,
        {parse_mode: "html"});
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
  await store.updateRecord(`objects/${objectId}`, {
    lastUplodingTime: updatedAtTimestamp,
  });
  // send notify
  const uploadTime = new Date() - startTime;
  await telegram.sendMessage(94899148, `<b>Data uploaded in ${Math.floor(uploadTime/1000)}s\n` +
      `Goods added: ${productIsSet.size}\nCatalogs added: ${catalogsIsSet.size}</b>\nDeleted Goods: ${deletedProducts}\nDeleted Catalogs: ${deletedCatalogs}`,
  {parse_mode: "html"});
};

// create object handler
const uploadActions = [];
const createObject = async (ctx, next) => {
  if (ctx.state.routeName === "upload") {
    const objectId = ctx.state.param;
    const todo = ctx.state.params.get("todo");
    const object = await store.findRecord(`objects/${objectId}`);
    const uploads = await store.findRecord(`objects/${objectId}/uploads/start`);
    // test upload local obj Saky
    // await uploadProducts(ctx.telegram, objectId, object.sheetId);
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
        await sheet.loadCells("B1:B11"); // loads a range of cells
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
        const postId = sheet.getCellByA1("B10").value;
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
          postId,
        };
        const rulesObject = {
          "id": "required|alpha_dash|max:20",
          "name": "required|string",
          "description": "required|string",
          "phoneArray": "required",
          "phoneArray.*": ["required", `regex:/${process.env.BOT_PHONEREGEXP}`],
          "address": "required|string",
          "USD": "required|numeric",
          "EUR": "required|numeric",
          "UAH": "required|numeric",
          "RUB": "required|numeric",
          "postId": "integer|min:1",
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
          postId: postId ? postId : firestore.FieldValue.delete(),
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
  const productName = encodeCyrillic(ctx.state.sessionMsg.url.searchParams.get("pName"), true);
  const productId = ctx.state.sessionMsg.url.searchParams.get("cPId");
  // const sheetId = ctx.state.sessionMsg.url.searchParams.get("sheetId");
  // add desc
  if (todo === "desc") {
    await store.updateRecord(`objects/${objectId}/products/${productId}`, {
      [todo]: newValue === "del" ? firestore.FieldValue.delete() : newValue,
    });
    await ctx.replyWithHTML(`<b>${productName} (${productId}) desc ${newValue === "del" ? "deleted" : newValue}</b>`);
    return;
  }
  // add postId
  if (todo === "postId") {
    // validate and save
    newValue = + newValue;
    if (Number.isInteger(newValue)) {
      await store.updateRecord(`objects/${objectId}/products/${productId}`, {
        [todo]: newValue ? newValue : firestore.FieldValue.delete(),
      });
      await ctx.replyWithHTML(`<b>${productName} (${productId}) postId ${newValue ? newValue : "deleted"}</b>`);
    } else {
      await ctx.replyWithHTML(`<b>${todo}</b> must be a integer!` + ctx.state.sessionMsg.linkHTML(), {
        reply_markup: {
          force_reply: true,
          input_field_placeholder: todo,
        }});
    }
    return;
  }
  const productRowNumber = ctx.state.sessionMsg.url.searchParams.get("cRowN");
  const object = await store.findRecord(`objects/${objectId}`);
  const doc = new GoogleSpreadsheet(object.sheetId);
  try {
    // start upload
    await doc.useServiceAccountAuth(creds, "nadir@absemetov.org.ua");
    await doc.loadInfo(); // loads document properties and worksheets
    const sheet = doc.sheetsByTitle["products"]; // doc.sheetsById[listId];
    await sheet.loadCells(`A${productRowNumber}:K${productRowNumber}`); // loads a range of cells
    const ID = sheet.getCellByA1(`B${productRowNumber}`);
    const TIMESTAMP = sheet.getCellByA1(`K${productRowNumber}`);
    // check current value
    // dont use strict equality diff types
    if (ID.value != productId) {
      await ctx.replyWithHTML(`${productName} (${productId}) not found in sheet row ${productRowNumber}`);
      return;
    }
    // delete product
    if (todo === "del") {
      if (newValue === "del") {
        // delete from firestore
        await store.getQuery(`objects/${objectId}/products/${productId}`).delete();
        // add color style and note
        ID.backgroundColor = {red: 1};
        // ID.note = "deleted";
        TIMESTAMP.value = "deleted";
        await ID.save();
        await TIMESTAMP.save();
        await ctx.replyWithHTML(`<b>${productName} (${productId}) deleted</b>`);
      } else {
        await ctx.replyWithHTML(`<b>${newValue}</b> must be a del!`);
      }
      return;
    }
    const cell = sheet.getCellByA1(`${column}${productRowNumber}`);
    const oldData = cell.value;
    if (todo === "price" || todo === "pPrice") {
      // comma to dot
      newValue = + newValue.replace(",", ".");
      if (isNaN(newValue)) {
        await ctx.replyWithHTML(`<b>${todo}</b> must be a number!` + ctx.state.sessionMsg.linkHTML(), {
          reply_markup: {
            force_reply: true,
            input_field_placeholder: todo,
          }});
        return;
      }
      // convert to number
    }
    // update the cell contents and formatting
    cell.value = newValue;
    await cell.save();
    // firestore update data
    await store.updateRecord(`objects/${objectId}/products/${productId}`, {
      [todo]: newValue,
    });
    await ctx.replyWithHTML(`${productName} (${productId}) <b>field ${todo} changed ${oldData} to ${newValue}</b>`);
  } catch (error) {
    await ctx.replyWithHTML(`Sheet ${error}`);
  }
};
// change catalog
const changeCatalog = async (ctx, newValue) => {
  const objectId = ctx.state.sessionMsg.url.searchParams.get("oId");
  const catalogId = ctx.state.sessionMsg.url.searchParams.get("upload-catalogId");
  const scene = ctx.state.sessionMsg.url.searchParams.get("scene");
  let caption = "updated";
  let field = "";
  if (scene === "upload-desc") {
    field = "desc";
    if (newValue === "del") {
      newValue = firestore.FieldValue.delete();
      caption = "deleted";
    }
  }
  if (scene === "upload-postId") {
    field = "postId";
    if (newValue === "del") {
      newValue = firestore.FieldValue.delete();
      caption = "deleted";
    } else {
      // validate postId
      newValue = + newValue;
      if (!Number.isInteger(newValue)) {
        await ctx.replyWithHTML(`<b>${newValue}</b> must be a integer!` + ctx.state.sessionMsg.linkHTML(), {
          reply_markup: {
            force_reply: true,
            input_field_placeholder: "postId",
          }});
        return;
      }
    }
  }
  await store.updateRecord(`objects/${objectId}/catalogs/${catalogId}`, {
    [field]: newValue,
  });
  await ctx.replyWithHTML(`<b>${catalogId}</b> ${field} ${caption}`);
};
// upload Merch Centere
// merch center
const uploadMerch = async (ctx, next) => {
  if (ctx.state.routeName === "uploadMerch") {
    const productId = ctx.state.param;
    const objectId = ctx.state.sessionMsg.url.searchParams.get("oId");
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
    // const res = await content.products.insert({
    await content.products.insert({
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
    // console.log(res.data);
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
exports.changeProduct = changeProduct;
exports.changeCatalog = changeCatalog;
exports.uploadActions = uploadActions;
