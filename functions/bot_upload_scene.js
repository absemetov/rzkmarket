const {Scenes: {Stage, BaseScene}} = require("telegraf");
const {getMainKeyboard, getBackKeyboard} = require("./bot_keyboards.js");
const {GoogleSpreadsheet} = require("google-spreadsheet");
const creds = require("./rzk-com-ua-d1d3248b8410.json");

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
      ctx.replyWithMarkdown(`*${sheet.rowCount}* rows found`);
    } catch (error) {
      ctx.replyWithMarkdown(`Error *${error}*`);
    }
  } else {
    ctx.replyWithMarkdown(`Sheet *${ctx.message.text}* not found, please enter valid url or sheet ID`);
  }
});

exports.upload = upload;
