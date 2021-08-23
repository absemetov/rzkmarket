const {Scenes: {BaseScene}} = require("telegraf");
const {getMainKeyboard} = require("./bot_keyboards.js");

const start = new BaseScene("start");

start.enter(async (ctx) => {
  // ctx.reply("Выберите меню", getMainKeyboard);
  ctx.reply("Welcome to Rzk.com.ru! Monobank rates /mono Rzk Catalog /catalog");
  // set commands
  await ctx.telegram.setMyCommands([{"command": "mono", "description": "Monobank exchange rates "},
    {"command": "catalog", "description": "RZK Market Catalog"}]);
});

start.hears("where", (ctx) => ctx.reply("You are in start scene"));

exports.start = start;
