const {Scenes: {BaseScene}} = require("telegraf");
const {getMainKeyboard} = require("./bot_keyboards.js");

const start = new BaseScene("start");

start.enter((ctx) => {
  ctx.reply("Выберите меню", getMainKeyboard);
});

start.hears("where", (ctx) => ctx.reply("You are in start scene"));

exports.start = start;
