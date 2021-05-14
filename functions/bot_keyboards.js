const {Markup} = require("telegraf");

exports.getMainKeyboard = Markup.keyboard(["mono", "upload"]).resize();
