const firebase = require("firebase-admin");
const {Scenes: {Stage, BaseScene}} = require("telegraf");
const {getMainKeyboard, getBackKeyboard} = require("./bot_keyboards.js");
const {GoogleSpreadsheet} = require("google-spreadsheet");
const creds = require("./rzk-com-ua-d1d3248b8410.json");
const Validator = require("validatorjs");
const {leave} = Stage;

const upload = new BaseScene("upload");

upload.enter((ctx) => {
  ctx.reply("Вставьте ссылку Google Sheet", getBackKeyboard);
});

upload.leave((ctx) => {
  ctx.reply("Menu", getMainKeyboard);
});

upload.hears("where", (ctx) => ctx.reply("You are in upload scene"));

upload.hears("back", leave());

// upload goods from sheet
upload.on("text", async (ctx) => {
  // parse url
  let sheetId;
  ctx.message.text.split("/").forEach((section) => {
    if (section.length === 44) {
      sheetId = section;
    }
  });
  if (sheetId) {
    // load goods
    const doc = new GoogleSpreadsheet(sheetId);
    try {
      await doc.useServiceAccountAuth(creds, "nadir@absemetov.org.ua");
      await doc.loadInfo(); // loads document properties and worksheets
      const sheet = doc.sheetsByIndex[0];
      ctx.replyWithMarkdown(`Load goods from sheet *${doc.title + " with " + (sheet.rowCount - 1)}* rows`);
      // read rows

      const perPage = 100;
      const rowCount = sheet.rowCount;
      let countUploadGoods = 0;
      for (let i = 0; i < rowCount - 1; i += perPage) {
        console.log(`rowCount ${sheet.rowCount - 1}, limit: ${perPage}, offset: ${i}`);
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
          if (validateItemRow.fails() && ((rows[j].id && rows[j].name) || (rows[j].name && rows[j].price))) {
            for (const [key, error] of Object.entries(validateItemRow.errors.all())) {
              ctx.replyWithMarkdown(`Row *${rows[j].rowIndex}* Column *${key}* Error *${error}*`);
            }
            // disable parent loop
            i = rowCount;
            break;
          }
          // save data to firestore
          if (validateItemRow.passes()) {
            countUploadGoods++;
            await firebase.firestore().collection("products").doc(item.id).set({
              "name": item.name,
              "price": item.price,
            });
          }
        }
        ctx.replyWithMarkdown(`*${i + perPage}* rows scan from *${sheet.rowCount - 1}*`);
      }
      // show count upload goods
      if (countUploadGoods) {
        ctx.replyWithMarkdown(`*${countUploadGoods}* goods uploaded`);
      }
    } catch (error) {
      ctx.replyWithMarkdown(`Sheet Error *${error}*`);
    }
  } else {
    ctx.replyWithMarkdown(`Sheet *${ctx.message.text}* not found, please enter valid url or sheet ID`);
  }
});

exports.upload = upload;
