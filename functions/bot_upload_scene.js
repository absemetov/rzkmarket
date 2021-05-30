const {Scenes: {Stage, BaseScene}} = require("telegraf");

const {getMainKeyboard, getBackKeyboard} = require("./bot_keyboards.js");

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
  const path = ctx.message.text.split("/");
  ctx.replyWithMarkdown(`Sheet *${path}* not found, please enter valid url`);
});

exports.upload = upload;
