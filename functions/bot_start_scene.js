const {Scenes: {BaseScene}} = require("telegraf");
const {getMainKeyboard} = require("./bot_keyboards.js");

const start = new BaseScene("start");

start.enter((ctx) => {
  ctx.reply("Выберите меню", getMainKeyboard);
});

exports.start = start;
