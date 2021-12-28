const firebase = require("firebase-admin");
const {GoogleSpreadsheet} = require("google-spreadsheet");
const creds = require("./rzk-com-ua-d1d3248b8410.json");
const Validator = require("validatorjs");
const {google} = require("googleapis");
const CyrillicToTranslit = require("cyrillic-to-translit-js");
const {store} = require("./bot_store_cart.js");
const {roundNumber} = require("./bot_start_scene");
const cyrillicToTranslit = new CyrillicToTranslit();
const cyrillicToTranslitUk = new CyrillicToTranslit({preset: "uk"});
// merch center
async (ctx) => {
  const content = google.content("v2.1");
  // add scope content in admin.google!!!
  const auth = new google.auth.JWT({
    keyFile: "./rzk-com-ua-d1d3248b8410.json",
    scopes: ["https://www.googleapis.com/auth/content"],
    subject: "nadir@absemetov.org.ua",
  });
  google.options({auth: auth});
  // Do the magic
  const res = await content.products.insert({
    merchantId: "120890507",
    resource: {
      "channel": "online",
      "contentLanguage": "ru",
      "offerId": "01-29-12-00-152-117",
      "targetCountry": "UA",
      "title": "Gunsan Moderna Крем Розетка с заземлением и крышкой (Склад: Днепр)",
      "description": "Rzk.com.ua - Каждая вторая розетка в Украине будет куплена у нас!",
      "link": "https://rzk.com.ua/p/01-29-12-00-152-117",
      "imageLink": "https://www.gunsanelectric.com/i/content/1517_1_visagekremkapaklitopraklipriz.png",
      "availability": "in stock",
      "condition": "new",
      "price": {
        "value": 51,
        "currency": "UAH",
      },
    },
  });
  console.log(res.data);
};
// upload from googleSheet
const uploadProducts = async (ctx, objectId, sheetId) => {
  const start = new Date();
  // Max upload goods
  const maxUploadGoods = 100;
  // Catalogs set array
  const catalogsIsSet = new Map();
  // Products set array
  const productIsSet = new Set();
  // const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();
  const serverTimestamp = Math.floor(Date.now() / 1000);
  // Get sheetId parse url
  // const objectId = ctx.state.param;
  // const object = await store.findRecord(`objects/${objectId}`);
  // const sheetId = object.spreadsheets.split("/").reduce((sum, section) => {
  //   if (section.length === 44) {
  //     return section;
  //     // return;
  //   } else {
  //     // save data
  //     return sum;
  //   }
  // }, "");
  // const sheetUrl = object.spreadsheets && object.spreadsheets.match(/d\/(.*)\/edit#gid=([0-9]+)/);
  // if (!sheetUrl) {
  //   await ctx.replyWithMarkdown("SheetID or listID not found, please check you url (object.spreadsheets)");
  //   return false;
  // }
  // const sheetId = sheetUrl[1];
  // const listId = sheetUrl[2];
  // get data for check upload process
  let uploading = ctx.session.uploading;
  const uplodingTime = ctx.session.uploadStartAt && serverTimestamp - ctx.session.uploadStartAt;
  // kill process
  if (ctx.session.uploading && uplodingTime > 570) {
    uploading = false;
  }
  if (!uploading) {
    // set data for check upload process
    ctx.session.uploading = true;
    ctx.session.uploadStartAt = serverTimestamp;
    // load goods
    const doc = new GoogleSpreadsheet(sheetId);
    // try {
    await doc.useServiceAccountAuth(creds, "nadir@absemetov.org.ua");
    await doc.loadInfo(); // loads document properties and worksheets
    const sheet = doc.sheetsByTitle["products"];
    await ctx.replyWithMarkdown(`Loading goods from ...
Sheet name: *${doc.title}*
Count rows: *${sheet.rowCount}*`);
    let rowCount = sheet.rowCount;
    // per page default 500
    const perPage = 500;
    // read rows
    // batches 500
    // test load cells
    // for (let i = 1; i < rowCount; i += perPage) {
    //   console.log("row", i + 1 );
    //   // boundaries must be +1
    //   await sheet.loadCells({
    //     startRowIndex: i, endRowIndex: i + perPage, startColumnIndex: 0, endColumnIndex: 2,
    //   });
    //   for (let j = i; j < i + perPage && j < rowCount; j++) {
    //     console.log(j + 1, sheet.getCell(j, 0).value, sheet.getCell(j, 1).value);
    //   }
    //   // clear chash save memory
    //   sheet.resetLocalCache(true);
    // }

    for (let i = 1; i < rowCount; i += perPage) {
      // get rows data
      // const rows = await sheet.getRows({limit: perPage, offset: i});
      // use get cell because this method have numder formats
      // GridRange object
      await sheet.loadCells({
        startRowIndex: i, endRowIndex: i + perPage, startColumnIndex: 0, endColumnIndex: 8,
      });
      // Get a new write batch
      const batchArray = [];
      const batchGoods = firebase.firestore().batch();
      // catalog parallel batched writes
      let batchCatalogs = firebase.firestore().batch();
      let batchCatalogsCount = 0;
      // catalog Tags batch
      const batchCatalogsTags = firebase.firestore().batch();
      // loop rows from SHEET
      for (let j = i; j < i + perPage && j < rowCount; j++) {
        // Stop scan if ID = "stop"
        const row = {
          ID: sheet.getCell(j, 0).value ? sheet.getCell(j, 0).value.toString() : sheet.getCell(j, 0).value,
          NAME: sheet.getCell(j, 1).value ? sheet.getCell(j, 1).value.trim() : sheet.getCell(j, 1).value,
          PURCHASE_PRICE: sheet.getCell(j, 2).value,
          PRICE: sheet.getCell(j, 3).value,
          CURRENCY: sheet.getCell(j, 4).value,
          UNIT: sheet.getCell(j, 5).value,
          GROUP: sheet.getCell(j, 6).value,
          TAGS: sheet.getCell(j, 7).value,
        };
        // stop loop
        if (row.ID === "stop") {
          rowCount = 0;
          break;
        }
        // validate group
        // generate catalogs array
        let groupArray = [];
        if (row.GROUP) {
          // generate Ids
          groupArray = row.GROUP.split("#");
          groupArray = groupArray.map((catalogName, index) => {
            let id = null;
            let parentId = null;
            let name = catalogName.trim();
            if (index !== 0) {
              // Parent exist
              const url = groupArray[index - 1].match(/(.+)\[([[a-zA-Z0-9-_]+)\]$/);
              if (url) {
                parentId = url[2];
              } else {
                parentId = cyrillicToTranslit.transform(groupArray[index - 1].trim(), "-").toLowerCase();
                parentId = cyrillicToTranslitUk.transform(parentId).toLowerCase();
              }
            }
            const url = catalogName.match(/(.+)\[([[a-zA-Z0-9-_]+)\]$/);
            if (url) {
              name = url[1];
              id = url[2];
            } else {
              id = cyrillicToTranslit.transform(catalogName.trim(), "-").toLowerCase();
              id = cyrillicToTranslitUk.transform(id).toLowerCase();
            }
            return {
              id,
              name,
              parentId: parentId,
            };
          });
        }
        // generate tags array
        let tagsArray = [];
        const tags = [];
        const tagsNames = [];
        if (row.TAGS) {
          // generate Ids
          tagsArray = row.TAGS.split(",");
          tagsArray.forEach((tagName) => {
            tagName = tagName.trim();
            let tagId = cyrillicToTranslit.transform(tagName, "-").toLowerCase();
            tagId = cyrillicToTranslitUk.transform(tagId).toLowerCase();
            let tagHidden = false;
            if (tagId.substring(0, 1) === "+") {
              tagHidden = true;
              tagName = tagName.substring(1).trim();
              tagId = cyrillicToTranslit.transform(tagName, "-").toLowerCase();
              tagId = cyrillicToTranslitUk.transform(tagId).toLowerCase();
            }
            tagsNames.push({
              id: tagId,
              name: tagName,
              hidden: tagHidden,
            });
            tags.push(tagId);
          });
        }
        // price mutation
        // const purchasePrice = rows[j].PURCHASE_PRICE &&
        //   Number(rows[j].PURCHASE_PRICE.replace(",", ".").replace(/\s+/g, ""));
        // const price = rows[j].PRICE && Number(rows[j].PRICE.replace(",", ".").replace(/\s+/g, ""));
        const product = {
          id: row.ID,
          name: row.NAME,
          purchasePrice: roundNumber(row.PURCHASE_PRICE),
          price: roundNumber(row.PRICE),
          group: groupArray,
          tags: tags,
          currency: row.CURRENCY,
          unit: row.UNIT,
        };
        // required for arrays dont work
        const rulesProductRow = {
          "id": "required|alpha_dash|max:16",
          "name": "required|string",
          "purchasePrice": "numeric",
          "price": "required|numeric",
          "group.*.id": "alpha_dash|max:16",
          "tags.*": "alpha_dash|max:12",
          "currency": "required|in:USD,EUR,RUB,UAH",
          "unit": "required|in:м,шт",
        };
        const validateProductRow = new Validator(product, rulesProductRow);
        // validate data if ID and NAME set org Name and PRICE
        // check fails If product have ID Name Price else this commet etc...
        if (validateProductRow.fails() && (product.id && product.name && product.price)) {
          let errorRow = `In row *${j + 1}* Product ID *${product.id}*\n`;
          for (const [key, error] of Object.entries(validateProductRow.errors.all())) {
            errorRow += `Column *${key}* => *${error}* \n`;
          }
          ctx.session.uploading = false;
          throw new Error(errorRow);
        }
        // group is required!!!
        if (product.group.length === 0 && (product.id && product.name && product.price)) {
          ctx.session.uploading = false;
          throw new Error(`Group required in row ${j + 1}`);
        }
        // save data to firestore
        if (validateProductRow.passes()) {
          // check limit goods
          if (productIsSet.size === maxUploadGoods) {
            ctx.session.uploading = false;
            throw new Error(`Limit *${maxUploadGoods}* goods!`);
          }
          // add products in batch
          // check id product is unic
          if (productIsSet.has(product.id)) {
            ctx.session.uploading = false;
            throw new Error(`Product ID *${product.id}* in row *${j + 1}* is exist`);
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
            "catalog": groupArray[groupArray.length - 1],
            "tags": tags,
            "tagsNames": tagsNames,
            "updatedAt": serverTimestamp,
          }, {merge: true});
          // save catalogs to batch
          for (const catalog of groupArray) {
            // check if catalog added to batch
            if (!catalogsIsSet.has(catalog.id)) {
              catalogsIsSet.set(catalog.id, {parentId: catalog.parentId, tags: new Set()});
              const catalogRef = firebase.firestore().collection("objects").doc(objectId)
                  .collection("catalogs").doc(catalog.id);
              batchCatalogs.set(catalogRef, {
                "name": catalog.name,
                "parentId": catalog.parentId,
                "orderNumber": catalogsIsSet.size,
                "updatedAt": serverTimestamp,
                "tags": firebase.firestore.FieldValue.delete(),
              }, {merge: true});
              // check batch limit 500
              if (++batchCatalogsCount === perPage) {
                batchArray.push(batchCatalogs.commit());
                batchCatalogs = firebase.firestore().batch();
                batchCatalogsCount = 0;
              }
            }
            // Check if catalog moved
            if (catalogsIsSet.get(catalog.id).parentId !== catalog.parentId) {
              ctx.session.uploading = false;
              throw new Error(`Goods *${product.name}* in row *${j + 1}*,
Catalog *${catalog.name}* moved from  *${catalogsIsSet.get(catalog.id).parentId}* to  *${catalog.parentId}*, `);
            }
          }
          // add tags Catalogs TODO delete TAGS!!!!
          if (tagsNames.length) {
            for (const tagsRow of tagsNames) {
              if (!catalogsIsSet.get(groupArray[groupArray.length - 1].id).tags.has(tagsRow.id)) {
                // if hidden tag not save
                if (!tagsRow.hidden) {
                  const catalogRef = firebase.firestore().collection("objects").doc(objectId)
                      .collection("catalogs").doc(groupArray[groupArray.length - 1].id);
                  batchCatalogsTags.set(catalogRef, {
                    "tags": firebase.firestore.FieldValue.arrayUnion({
                      id: tagsRow.id,
                      name: tagsRow.name,
                    }),
                  }, {merge: true});
                }
              }
              // Add tags value to tmp Map
              catalogsIsSet.get(groupArray[groupArray.length - 1].id).tags.add(tagsRow.id);
            }
          }
        }
      }
      // add bath goods to array
      batchArray.push(batchGoods.commit());
      // commit last batch catalog
      if (batchCatalogsCount > 0 && batchCatalogsCount !== perPage) {
        batchArray.push(batchCatalogs.commit());
      }
      // commit all bathes parallel with tags delete option
      await Promise.all(batchArray);
      // commit catalogs tags
      await batchCatalogsTags.commit();
      await ctx.replyWithMarkdown(`*${i + perPage}* rows scaned from *${sheet.rowCount}*`);
      // clear cache
      sheet.resetLocalCache(true);
    }
    // after upload show upload info
    const ms = new Date() - start;
    await ctx.replyWithMarkdown(`Data uploaded in *${Math.floor(ms/1000)}*s:
Goods: *${productIsSet.size}*
Catalogs: *${catalogsIsSet.size}*`);
    // delete old Products
    const batchProductsDelete = firebase.firestore().batch();
    const productsDeleteSnapshot = await firebase.firestore().collection("objects").doc(objectId)
        .collection("products")
        .where("updatedAt", "!=", serverTimestamp).limit(perPage).get();
    productsDeleteSnapshot.forEach((doc) =>{
      batchProductsDelete.delete(doc.ref);
    });
    await batchProductsDelete.commit();
    if (productsDeleteSnapshot.size) {
      await ctx.replyWithMarkdown(`*${productsDeleteSnapshot.size}* products deleted`);
    }
    // delete old catalogs
    const batchCatalogsDelete = firebase.firestore().batch();
    const catalogsDeleteSnapshot = await firebase.firestore().collection("objects").doc(objectId)
        .collection("catalogs")
        .where("updatedAt", "!=", serverTimestamp).limit(perPage).get();
    catalogsDeleteSnapshot.forEach((doc) =>{
      batchCatalogsDelete.delete(doc.ref);
    });
    await batchCatalogsDelete.commit();
    if (catalogsDeleteSnapshot.size) {
      await ctx.replyWithMarkdown(`*${catalogsDeleteSnapshot.size}* catalogs deleted`);
    }
    // } catch (error) {
    //   await ctx.replyWithMarkdown(`Sheet ${error}`);
    // }
    // set data for check upload process done!
    // await ctx.state.cart.setSessionData({
    //   uploading: false,
    // });
    ctx.session.uploading = false;
  } else {
    throw new Error("Uploading..., please wait");
  }
};
// create object handler
const uploadActions = [];
const createObject = async (ctx, next) => {
  if (ctx.state.routeName === "upload") {
    const objectId = ctx.state.param;
    const todo = ctx.state.params.get("todo");
    const object = await store.findRecord(`objects/${objectId}`);
    let sheetId = "";
    if (todo === "updateObject" || todo === "uploadProducts") {
      sheetId = object.sheetId;
    } else {
      const sessionFire = await store.findRecord(`users/${ctx.from.id}`, "session");
      sheetId =sessionFire.sheetId;
    }
    try {
      // upload goods
      if (todo === "uploadProducts") {
        await uploadProducts(ctx, object.id, sheetId);
        await ctx.replyWithHTML(`Товары загружены ${object.name}, удачных продаж!\n`);
        return;
      }
      // start upload
      const doc = new GoogleSpreadsheet(sheetId);
      await doc.useServiceAccountAuth(creds, "nadir@absemetov.org.ua");
      await doc.loadInfo(); // loads document properties and worksheets
      const sheet = doc.sheetsByTitle["info"]; // doc.sheetsById[listId];
      await sheet.loadCells("B1:B9"); // loads a range of cells
      const id = sheet.getCellByA1("B1").value;
      const name = sheet.getCellByA1("B2").value;
      const description = sheet.getCellByA1("B3").value;
      const phoneNumber = sheet.getCellByA1("B4").value;
      const address = sheet.getCellByA1("B5").value;
      const USD = roundNumber(sheet.getCellByA1("B6").value);
      const EUR = roundNumber(sheet.getCellByA1("B7").value);
      const UAH = roundNumber(sheet.getCellByA1("B8").value);
      const RUB = roundNumber(sheet.getCellByA1("B9").value);
      let messageTxt = "";
      const objectCheck = {
        id,
        name,
        description,
        phoneNumber,
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
        "phoneNumber": "required|string",
        "address": "required|string",
        "USD": "required|numeric",
        "EUR": "required|numeric",
        "UAH": "required|numeric",
        "RUB": "required|numeric",
      };
      const validateObject = new Validator(objectCheck, rulesObject);
      if (validateObject.fails()) {
        let errorRow = "";
        for (const [key, error] of Object.entries(validateObject.errors.all())) {
          errorRow += `field *${key}* => *${error}* \n`;
        }
        throw new Error(errorRow);
      }
      // actions
      if (todo === "createObject" || todo === "updateObject") {
        await store.createRecord(`objects/${objectId}`, {
          name,
          description,
          phoneNumber,
          address,
          sheetId,
          USD,
          EUR,
          UAH,
          RUB,
        });
        if (object) {
          messageTxt = `Данные обновлены ${object.name} /objects`;
        } else {
          messageTxt = `Объект ${name} создан! /objects`;
        }
      }
      await ctx.replyWithHTML(messageTxt);
      // get object data
    } catch (error) {
      await ctx.replyWithMarkdown(`Sheet ${error}`);
    }
    await ctx.answerCbQuery();
  } else {
    return next();
  }
};
// show upload form when send link
const uploaForm = async (ctx, sheetId) => {
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
    const phoneNumber = sheet.getCellByA1("B4").value;
    const address = sheet.getCellByA1("B5").value;
    const USD = roundNumber(sheet.getCellByA1("B6").value);
    const EUR = roundNumber(sheet.getCellByA1("B7").value);
    const UAH = roundNumber(sheet.getCellByA1("B8").value);
    const RUB = roundNumber(sheet.getCellByA1("B9").value);
    let messageTxt = "";
    const object = {
      id,
      name,
      description,
      phoneNumber,
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
      "phoneNumber": "required|string",
      "address": "required|string",
      "USD": "required|numeric",
      "EUR": "required|numeric",
      "UAH": "required|numeric",
      "RUB": "required|numeric",
    };
    const validateObject = new Validator(object, rulesObject);
    if (validateObject.fails()) {
      let errorRow = "";
      for (const [key, error] of Object.entries(validateObject.errors.all())) {
        errorRow += `field *${key}* => *${error}* \n`;
      }
      throw new Error(errorRow);
    }
    // message confirmed
    messageTxt = `Sheet name: <b>${doc.title}</b>\n` +
    `id: <b>${id}</b>\n` +
    `name: <b>${name}</b>\n` +
    `description: <b>${description}</b>\n` +
    `phoneNumber: <b>${phoneNumber}</b>\n` +
    `address: <b>${address}</b>\n`;
    // check object
    const objectRzk = await store.findRecord(`objects/${id}`);
    const inlineKeyboardArray = [];
    let txtBtn = "";
    if (objectRzk) {
      txtBtn = "Обновить";
    } else {
      txtBtn = "Создать";
    }
    inlineKeyboardArray.push([{text: `${txtBtn} объект ${name}`, callback_data: `upload/${id}?todo=createObject`}]);
    await ctx.replyWithHTML(messageTxt, {
      reply_markup: {
        inline_keyboard: inlineKeyboardArray,
      }});
    // get object data
  } catch (error) {
    await ctx.replyWithMarkdown(`Sheet ${error}`);
  }
};
uploadActions.push(createObject);
exports.uploaForm = uploaForm;
exports.uploadActions = uploadActions;
