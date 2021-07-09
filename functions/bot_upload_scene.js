const firebase = require("firebase-admin");
const {Scenes: {BaseScene}} = require("telegraf");
const {getMainKeyboard, getBackKeyboard} = require("./bot_keyboards.js");
const {GoogleSpreadsheet} = require("google-spreadsheet");
const creds = require("./rzk-com-ua-d1d3248b8410.json");
const Validator = require("validatorjs");
const {google} = require("googleapis");
const CyrillicToTranslit = require("cyrillic-to-translit-js");

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

// function sleep(ms) {
//   return new Promise((resolve) => {
//     setTimeout(resolve, ms);
//   });
// }

upload.on("text", async (ctx) => {
  // parse url
  let sheetId;
  ctx.message.text.split("/").forEach((section) => {
    if (section.length === 44) {
      sheetId = section;
    }
  });

  if (!sheetId) {
    await ctx.replyWithMarkdown(`Sheet *${ctx.message.text}* not found, please enter valid url or sheet ID`,
        getBackKeyboard);
  }
  // get data for check upload process
  const docRef = await firebase.firestore().collection("sessions").doc(`${ctx.from.id}`).get();
  if (sheetId && !docRef.data().uploadPass) {
    console.log("upload start");
    const start = new Date();
    // set data for check upload process
    await firebase.firestore().collection("sessions").doc(`${ctx.from.id}`).set({
      uploadPass: true,
    });
    // load goods
    const doc = new GoogleSpreadsheet(sheetId);
    try {
      // start upload
      await doc.useServiceAccountAuth(creds, "nadir@absemetov.org.ua");
      await doc.loadInfo(); // loads document properties and worksheets
      const sheet = doc.sheetsByIndex[0];
      await ctx.replyWithMarkdown(`Load goods from Sheet *${doc.title + " with " + (sheet.rowCount - 1)}* rows`);
      const rowCount = sheet.rowCount;
      // Max upload goods
      const maxUploadGoods = 1;
      const cyrillicToTranslit = new CyrillicToTranslit();
      // read rows
      const perPage = 100;
      let countUploadGoods = 0;
      for (let i = 0; i < rowCount - 1; i += perPage) {
        // get rows data
        const rows = await sheet.getRows({limit: perPage, offset: i});

        for (let j = 0; j < rows.length; j++) {
          // check limit
          if (countUploadGoods > maxUploadGoods) {
            throw new Error(`Limit ${maxUploadGoods} goods!`);
          }
          // validate data if ID and NAME set org Name and PRICE
          // validate group
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
                name: catalogName.trim(),
                id: cyrillicToTranslit.transform(catalogName.trim(), "-").toLowerCase(),
                parentId: parentId,
              };
            });
          }
          const item = {
            id: rows[j].id,
            name: rows[j].name,
            price: rows[j].price ? Number(rows[j].price.replace(",", ".")) : "",
            group: groupArray,
          };
          const rulesItemRow = {
            "id": "required|alpha_dash",
            "name": "required|string",
            "price": "required|numeric",
            "group.*.id": "required|alpha_dash",
          };
          const validateItemRow = new Validator(item, rulesItemRow);
          // check fails
          if (validateItemRow.fails() && ((rows[j].id && rows[j].name) || (rows[j].name && rows[j].price))) {
            let errorRow = `In row *${rows[j].rowIndex}* \n`;
            for (const [key, error] of Object.entries(validateItemRow.errors.all())) {
              errorRow += `Column *${key}* => *${error}* \n`;
            }
            // disable parent loop
            // i = rowCount;
            // break;
            throw new Error(errorRow);
          }
          // save data to firestore
          if (validateItemRow.passes()) {
            countUploadGoods ++;
            await firebase.firestore().collection("products").doc(item.id).set({
              "name": item.name,
              "price": item.price,
              "orderNumber": countUploadGoods,
            });
            groupArray.forEach(async (catalog) => {
              await firebase.firestore().collection("catalogs").doc(catalog.id).set({
                "name": catalog.name,
                "parentId": catalog.parentId,
                "orderNumber": countUploadGoods,
              });
            });
          }
        }
        // await sleep(10000);
        await ctx.replyWithMarkdown(`*${i + perPage}* rows scan from *${sheet.rowCount - 1}*`);
      }
      // show count upload goods
      if (countUploadGoods) {
        const ms = new Date() - start;
        await ctx.replyWithMarkdown(`*${countUploadGoods}* goods uploaded in ${Math.floor(ms/1000)}s`, getBackKeyboard);
      }
    } catch (error) {
      await ctx.replyWithMarkdown(`Sheet ${error}`, getBackKeyboard);
    }
    // set data for check upload process
    await firebase.firestore().collection("sessions").doc(`${ctx.from.id}`).set({
      uploadPass: false,
    });
    console.log("upload finish");
  }
});

exports.upload = upload;
