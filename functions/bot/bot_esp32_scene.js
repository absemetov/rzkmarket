const mqtt = require("mqtt");
const client = mqtt.connect("mqtt://broker.hivemq.com");
client.subscribe("home/rele/status");
let editMsg = null;
// subsc callback
client.on("message", async function(topic, message) {
  // called each time a message is received
  const inlineKeyboard = [];
  const relays = message.toString().split(",");
  // first relay
  inlineKeyboard.push(relays[0] === "ON" ? [{text: "✅💡", callback_data: "esp32/1?action=OFF"}] :
  [{text: "☑️💡", callback_data: "esp32/1?action=ON"}]);
  // second relay
  inlineKeyboard.push(relays[1] === "ON" ? [{text: "✅💡", callback_data: "esp32/2?action=OFF"}] :
  [{text: "☑️💡", callback_data: "esp32/2?action=ON"}]);
  // link
  inlineKeyboard.push([{text: "Rzk.com.ru", url: "https://rzk.com.ru"}]);
  if (editMsg) {
    if (editMsg.callbackQuery) {
      await editMsg.editMessageText("Упраление светом в бутике" + editMsg.state.sessionMsg.linkHTML(), {
        parse_mode: "html",
        reply_markup: {
          inline_keyboard: inlineKeyboard,
        }});
    } else {
      await editMsg.reply("Упраление светом в бутике", {
        reply_markup: {
          inline_keyboard: inlineKeyboard,
        }});
    }
  }
  // client.end();
});
const esp32Actions = [];
// handler
const esp32Handler = async (ctx) => {
  editMsg = ctx;
  client.publish("home/rele", "update");
  await ctx.reply("Загружаем меню...");
};
// esp32 controller
esp32Actions.push(async (ctx, next) => {
  if (ctx.state.routeName === "esp32") {
    editMsg = ctx;
    const releNumber = ctx.state.param;
    const action = ctx.state.params.get("action");
    // on off rele
    client.publish("home/rele", `${action}_${releNumber}`);
    // client.publish("home/rele/status", "status");
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

exports.esp32Handler = esp32Handler;
exports.esp32Actions = esp32Actions;
