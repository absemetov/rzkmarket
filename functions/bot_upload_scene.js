const firebase = require("firebase-admin");
const {Scenes: {BaseScene}} = require("telegraf");
const {getMainKeyboard, getBackKeyboard} = require("./bot_keyboards.js");
const {GoogleSpreadsheet} = require("google-spreadsheet");
const creds = require("./rzk-com-ua-d1d3248b8410.json");
const Validator = require("validatorjs");

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

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

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
      const rowCount = 100; // sheet.rowCount;
      const maxUploadGoods = 5000;
      // read rows
      const perPage = 100;
      let countUploadGoods = 0;
      for (let i = 0; i < rowCount - 1; i += perPage) {
        // check limit
        if (countUploadGoods > maxUploadGoods) {
          throw new Error(`Limit ${maxUploadGoods} goods!`);
        }
        // get rows data
        const rows = await sheet.getRows({limit: perPage, offset: i});

        for (let j = 0; j < rows.length; j++) {
          // validate data if ID and NAME set org Name and PRICE
          const item = {
            id: rows[j].id,
            name: rows[j].name,
            price: rows[j].price ? Number(rows[j].price.replace(",", ".")) : "",
          };
          const rulesItemRow = {
            id: "required|alpha_dash",
            name: "required|string",
            price: "required|numeric",
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
            countUploadGoods++;
            // await firebase.firestore().collection("products").doc(item.id).set({
            //   "name": item.name,
            //   "price": item.price,
            // });
          }
        }
        await sleep(10000);
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
