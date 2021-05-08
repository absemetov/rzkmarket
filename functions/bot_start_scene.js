const {Scenes: {BaseScene, Stage}} = require("telegraf");

// Handler factories
const {enter, leave} = Stage;

const start = new BaseScene("mono");

start.enter((ctx) => ctx.reply("Hi"));

start.leave((ctx) => ctx.reply("Bye"));

start.hears("hi", enter("greeter"));

start.on("message", (ctx) => ctx.replyWithMarkdown("Send `hi`"));

exports.start = start;
