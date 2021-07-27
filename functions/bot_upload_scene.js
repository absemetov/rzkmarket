const firebase = require("firebase-admin");
const {Scenes: {BaseScene}} = require("telegraf");
const {getMainKeyboard, getBackKeyboard} = require("./bot_keyboards.js");
const {GoogleSpreadsheet} = require("google-spreadsheet");
const creds = require("./rzk-com-ua-d1d3248b8410.json");
const Validator = require("validatorjs");
const {google} = require("googleapis");
const CyrillicToTranslit = require("cyrillic-to-translit-js");
const cyrillicToTranslit = new CyrillicToTranslit();
const upload = new BaseScene("upload");

upload.enter((ctx) => {
  ctx.reply("Вставьте ссылку Google Sheet", getBackKeyboard);
});

upload.leave((ctx) => {
  ctx.reply("Menu", getMainKeyboard);
});

upload.hears("where", (ctx) => ctx.reply("You are in upload scene"));

upload.hears("back", (ctx) => {
  ctx.scene.leave();
});

upload.hears("shop", async (ctx) => {
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
});
// upload from googleSheet
upload.on("text", async (ctx) => {
  const start = new Date();
  // Max upload goods
  const maxUploadGoods = 100;
  // Catalogs set array
  const catalogsIsSet = new Map();
  const catalogsTags = new Map();
  let countUploadGoods = 0;
  // const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();
  const serverTimestamp = Math.floor(Date.now() / 1000);
  const perPage = 500;
  // Get sheetId parse url
  let sheetId;
  ctx.message.text.split("/").forEach((section) => {
    if (section.length === 44) {
      sheetId = section;
    }
  });

  if (!sheetId) {
    await ctx.replyWithMarkdown(`Sheet *${ctx.message.text}* not found, please enter valid url or sheet ID`,
        getBackKeyboard);
    return false;
  }
  // get data for check upload process
  const sessionUser = firebase.firestore().collection("sessions").doc(`${ctx.from.id}`);
  const docRef = await sessionUser.get();
  let uploadPass = false;
  if (docRef.exists) {
    uploadPass = docRef.data().uploadPass;
    const timeDiff = serverTimestamp - docRef.data().uploadTimestamp;
    // if happend error, after 570s clear rewrite uploadPass
    if (uploadPass && timeDiff > 570) {
      uploadPass = false;
    }
  }
  if (!uploadPass) {
    // set data for check upload process
    await sessionUser.set({
      uploadPass: true,
      uploadTimestamp: serverTimestamp,
    });
    // load goods
    const doc = new GoogleSpreadsheet(sheetId);
    try {
      // start upload
      await doc.useServiceAccountAuth(creds, "nadir@absemetov.org.ua");
      await doc.loadInfo(); // loads document properties and worksheets
      const sheet = doc.sheetsByIndex[0];
      await ctx.replyWithMarkdown(`Load goods from ...
Sheet name: *${doc.title}*
Count rows: *${sheet.rowCount - 1}*`);
      let rowCount = sheet.rowCount;
      // read rows
      // batches 500
      for (let i = 0; i < rowCount - 1; i += perPage) {
        // get rows data
        const rows = await sheet.getRows({limit: perPage, offset: i});
        // Get a new write batch
        const batchArray = [];
        const batchGoods = firebase.firestore().batch();
        // catalog parallel batched writes
        let batchCatalogs = firebase.firestore().batch();
        let batchCatalogsCount = 0;
        // loop rows from SHEET
        for (let j = 0; j < rows.length; j++) {
          // validate data if ID and NAME set org Name and PRICE
          // validate group
          // stop scaning if catalog empty
          if (!rows[j].group) {
            rowCount = 0;
            break;
          }
          // generate catalogs array
          let groupArray = [];
          if (rows[j].group) {
            // generate Ids
            groupArray = rows[j].group.split("#");
            groupArray = groupArray.map((catalogName, index) => {
              let parentId = null;
              if (index !== 0) {
                // Parent exist
                parentId = cyrillicToTranslit.transform(groupArray[index - 1].trim(), "-").toLowerCase();
              }
              return {
                id: cyrillicToTranslit.transform(catalogName.trim(), "-").toLowerCase(),
                name: catalogName.trim(),
                parentId: parentId,
              };
            });
          }
          // generate tags array
          let tagsArray = [];
          const tags = [];
          const tagsNames = [];
          if (rows[j].tags) {
            // generate Ids
            tagsArray = rows[j].tags.split(",");
            tagsArray.forEach((tagName) => {
              tags.push(cyrillicToTranslit.transform(tagName.trim(), "-").toLowerCase());
              tagsNames.push({
                id: cyrillicToTranslit.transform(tagName.trim(), "-").toLowerCase(),
                name: tagName,
              });
            });
          }
          const product = {
            id: rows[j].id,
            name: rows[j].name,
            price: rows[j].price ? Number(rows[j].price.replace(",", ".")) : "",
            group: groupArray,
            tags: tags,
          };
          const rulesProductRow = {
            "id": "required|alpha_dash",
            "name": "required|string",
            "price": "required|numeric",
            "group.*.id": "required|alpha_dash",
            "tags.*": "required|alpha_dash",
          };
          const validateProductRow = new Validator(product, rulesProductRow);
          // check fails
          if (validateProductRow.fails() && ((rows[j].id && rows[j].name) || (rows[j].name && rows[j].price))) {
            let errorRow = `In row *${rows[j].rowIndex}* \n`;
            for (const [key, error] of Object.entries(validateProductRow.errors.all())) {
              errorRow += `Column *${key}* => *${error}* \n`;
            }
            throw new Error(errorRow);
          }
          // save data to firestore
          if (validateProductRow.passes()) {
            // check limit goods
            if (countUploadGoods === maxUploadGoods) {
              throw new Error(`Limit *${maxUploadGoods}* goods!`);
            }
            // add products in batch
            const productRef = firebase.firestore().collection("products").doc(product.id);
            batchGoods.set(productRef, {
              "name": product.name,
              "price": product.price,
              "orderNumber": countUploadGoods,
              "catalog": groupArray[groupArray.length - 1],
              "tags": tags,
              "tagsNames": tagsNames,
              "updatedAt": serverTimestamp,
            }, {merge: true});
            // save catalogs with batch
            for (const catalog of groupArray) {
              // check if catalog added to batch
              if (!catalogsIsSet.has(catalog.id)) {
                const catalogRef = firebase.firestore().collection("catalogs").doc(catalog.id);
                batchCatalogs.set(catalogRef, {
                  "name": catalog.name,
                  "parentId": catalog.parentId,
                  "orderNumber": countUploadGoods,
                  "updatedAt": serverTimestamp,
                }, {merge: true});
                catalogsIsSet.set(catalog.id, catalog.parentId);
                // check batch limit 500
                if (++batchCatalogsCount === perPage) {
                  batchArray.push(batchCatalogs.commit());
                  batchCatalogs = firebase.firestore().batch();
                  batchCatalogsCount = 0;
                }
              }
              // Check if catalog moved
              if (catalogsIsSet.get(catalog.id) !== catalog.parentId) {
                throw new Error(`Goods *${product.name}* in row *${rows[j].rowIndex}*,
Catalog *${catalog.name}* moved from  *${catalogsIsSet.get(catalog.id)}* to  *${catalog.parentId}*, `);
              }
              // save tags to Catalogs
              if (catalogsTags.has(groupArray[groupArray.length - 1].id)) {
                const catalogsTagsArray = catalogsTags.get(groupArray[groupArray.length - 1].id);
                const newArray = [...catalogsTagsArray, ""];
                console.log("test", newArray);
                newArray.push("test");
                catalogsTags.set(groupArray[groupArray.length - 1].id, newArray);
                // console.log(catalogsTagsArray);
                // catalogsTagsArray.push(tagsNames);
                // catalogsTags.set(groupArray[groupArray.length - 1].id, catalogsTagsArray);
              } else {
                catalogsTags.set(groupArray[groupArray.length - 1].id, tagsNames);
              }
              // add items array
            }
            countUploadGoods ++;
          }
        }
        console.log(catalogsTags);
        // add bath goods to array
        batchArray.push(batchGoods.commit());
        // commit last bath catalog
        if (batchCatalogsCount > 0 && batchCatalogsCount !== perPage) {
          batchArray.push(batchCatalogs.commit());
        }
        // commit all bathes parallel
        await Promise.all(batchArray);
        await ctx.replyWithMarkdown(`*${i + perPage}* rows scan and saved from *${sheet.rowCount - 1}*`);
      }
      // after upload show upload info
      const ms = new Date() - start;
      await ctx.replyWithMarkdown(`Data uploaded in *${Math.floor(ms/1000)}*s:
Goods: *${countUploadGoods}*
Catalogs: *${catalogsIsSet.size}*`, getBackKeyboard);
      // delete old Products
      const batchProductsDelete = firebase.firestore().batch();
      const productsDeleteSnapshot = await firebase.firestore().collection("products")
          .where("updatedAt", "!=", serverTimestamp).limit(perPage).get();
      productsDeleteSnapshot.forEach((doc) =>{
        batchProductsDelete.delete(doc.ref);
      });
      await batchProductsDelete.commit();
      if (productsDeleteSnapshot.size) {
        ctx.replyWithMarkdown(`*${productsDeleteSnapshot.size}* products deleted`);
      }
      // delete old catalogs
      const batchCatalogsDelete = firebase.firestore().batch();
      const catalogsDeleteSnapshot = await firebase.firestore().collection("catalogs")
          .where("updatedAt", "!=", serverTimestamp).limit(perPage).get();
      catalogsDeleteSnapshot.forEach((doc) =>{
        batchCatalogsDelete.delete(doc.ref);
      });
      await batchCatalogsDelete.commit();
      if (catalogsDeleteSnapshot.size) {
        ctx.replyWithMarkdown(`*${catalogsDeleteSnapshot.size}* catalogs deleted`);
      }
    } catch (error) {
      await ctx.replyWithMarkdown(`Sheet ${error}`, getBackKeyboard);
    }
    // set data for check upload process done!
    await sessionUser.set({
      uploadPass: false,
    }, {merge: true});
  } else {
    await ctx.replyWithMarkdown("Processing, please wait");
  }
});

exports.upload = upload;
