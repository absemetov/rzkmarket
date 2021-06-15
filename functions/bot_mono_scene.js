const firebase = require("firebase-admin");
const axios = require("axios");
const cc = require("currency-codes");
const {Scenes: {BaseScene}} = require("telegraf");
const {getMainKeyboard, getMonoKeyboard} = require("./bot_keyboards.js");
const {MenuTemplate, createBackMainMenuButtons} = require("telegraf-inline-menu");
const mono = new BaseScene("mono");

mono.enter((ctx) => {
  ctx.reply("Выберите валюту", getMonoKeyboard);
});

mono.leave((ctx) => {
  ctx.reply("Menu", getMainKeyboard);
});

mono.hears("where", (ctx) => ctx.reply("You are in mono scene"));

mono.hears("back", (ctx) => ctx.scene.leave());

// listen all text messages
mono.on("text", async (ctx) => {
  const currencyObj = await getCurrency();
  const currency = currencyObj[ctx.message.text];
  if (currency) {
    const date = new Date(currency.date*1000);
    const dateFormat = `${date.getDate()}/${(date.getMonth()+1)}/${date.getFullYear()}, `+
    `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
    return ctx.replyWithMarkdown(`CURRENCY: *${ctx.message.text}*\n`+
    `RATE BUY: *${currency.rateBuy}*\n`+
    `RATE SELL: *${currency.rateSell}*\n`+
    `DATE:${dateFormat}`);
  } else {
    ctx.replyWithMarkdown(`Currency *${ctx.message.text}* not found`);
  }
});

async function updateData(currenciesFirestore) {
  try {
    // get data from monobank
    const currenciesMonobank = await axios.get("https://api.monobank.ua/bank/currency");

    const usdRate = currenciesMonobank.data.find((data) => {
      return data.currencyCodeA === Number(cc.code("USD").number);
    });

    const eurRate = currenciesMonobank.data.find((data) => {
      return data.currencyCodeA === Number(cc.code("EUR").number);
    });

    const rubRate = currenciesMonobank.data.find((data) => {
      return data.currencyCodeA === Number(cc.code("RUB").number);
    });

    // save data

    const dateUpdated = Math.floor(Date.now() / 1000);

    await firebase.firestore().doc("currencies/USD").set({updated_at: dateUpdated, ...usdRate});
    await firebase.firestore().doc("currencies/EUR").set({updated_at: dateUpdated, ...eurRate});
    await firebase.firestore().doc("currencies/RUB").set({updated_at: dateUpdated, ...rubRate});

    return {USD: usdRate, EUR: eurRate, RUB: rubRate};
  } catch (error) {
    // res.send(error.response.data.errorDescription);
    return {};
  }
}

async function getCurrency(currencyName) {
  const currenciesFirestore = await firebase.firestore().collection("currencies").get();

  let currencyResult = {};
  const currencyResultOld = {};
  const dateTimestamp = Math.floor(Date.now() / 1000);

  currenciesFirestore.forEach((doc) => {
    const timeDiff = dateTimestamp - doc.data().updated_at;
    if (timeDiff < 3600) {
      currencyResult[doc.id] = doc.data();
    } else {
      currencyResultOld[doc.id] = doc.data();
    }
  });

  // if empty collection or old data
  if ( Object.keys(currencyResult).length === 0 ) {
    currencyResult = await updateData();
    // if an error in update
    if ( Object.keys(currencyResult).length === 0 ) {
      currencyResult = currencyResultOld;
    }
  }

  return currencyResult;
}

// menu
let menuText = "Выберите валюту";
const menuMono = new MenuTemplate(() => menuText);
menuMono.url("Monobank.com.ua", "https://monobank.com.ua");
menuMono.choose("select currency", ["USD", "EUR", "RUB"], {
  do: async (ctx, key) => {
    const currencyObj = await getCurrency();
    const currency = currencyObj[key];
    if (currency) {
      const date = new Date(currency.date*1000);
      const dateFormat = `${date.getDate()}/${(date.getMonth()+1)}/${date.getFullYear()}, `+
      `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
      menuText = `${key} RATE BUY: ${currency.rateBuy} RATE SELL: ${currency.rateSell} DATE:${dateFormat}`;
    } else {
      await ctx.answerCbQuery(`Currency dont found`)
    }
    // await ctx.reply('As am I!')
    // You can also go back to the parent menu afterwards for some 'quick' interactions in submenus
    return true;
  },
});
menuMono.manualRow(createBackMainMenuButtons());
const submenuTemplate = new MenuTemplate(ctx => `You chose city ${ctx.match[1]}`)
submenuTemplate.interact('Text', 'unique', {
	do: async ctx => {
		console.log('Take a look at ctx.match. It contains the chosen city', ctx.match)
		await ctx.answerCbQuery('You hit a button in a submenu')
		return false
	}
})
submenuTemplate.manualRow(createBackMainMenuButtons())

menuMono.chooseIntoSubmenu('unique', ['Gotham', 'Mos Eisley', 'Springfield'], submenuTemplate)
// menu

exports.mono = mono;
exports.menuMono = menuMono;

