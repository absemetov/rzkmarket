const {Markup} = require("telegraf");

exports.getMainKeyboard = Markup.keyboard(["mono", "upload"]).resize();

exports.getMonoKeyboard = Markup.keyboard(["USD", "EUR", "RUB", "back"]).resize();

exports.getBackKeyboard = Markup.keyboard(["back"]).resize();
