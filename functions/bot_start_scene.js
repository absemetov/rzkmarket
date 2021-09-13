const {Markup, Scenes: {BaseScene}} = require("telegraf");
// const {getMainKeyboard} = require("./bot_keyboards.js");
const start = new BaseScene("start");

start.enter(async (ctx) => {
  // ctx.reply("Выберите меню", getMainKeyboard);
  // ctx.reply("Welcome to Rzk.com.ru! Monobank rates /mono Rzk Catalog /catalog");
  // reply with photo necessary to show ptoduct
  await ctx.replyWithPhoto("https://picsum.photos/450/150/?random",
      {
        caption: "Welcome to Rzk Market Ukraine 🇺🇦",
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([Markup.button.callback("📁 Catalog", "c")]),
      });
  // set commands
  await ctx.telegram.setMyCommands([
    {"command": "mono", "description": "Monobank exchange rates "},
    {"command": "start", "description": "RZK Market Shop"},
    {"command": "upload", "description": "Upload goods"},
  ]);
  ctx.scene.enter("catalog");
});


start.hears("where", (ctx) => ctx.reply("You are in start scene"));

exports.start = start;
