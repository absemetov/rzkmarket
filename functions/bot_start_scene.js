const {Scenes: {BaseScene, Stage}} = require("telegraf");
const {getMainKeyboard} = require("./bot_keyboards.js");

// Handler factories
const {leave} = Stage;

const start = new BaseScene("start");

start.enter((ctx) => {
  const {mainKeyboard} = getMainKeyboard(ctx);
  ctx.reply("Choose language / Выбери язык", mainKeyboard);
});

start.leave((ctx) => ctx.reply("Bye"));

start.command("saveme", leave());

exports.start = start;
