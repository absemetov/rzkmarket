const {getFirestore} = require("firebase-admin/firestore");
const {store} = require("./bot_store_cart");
const sitesActions = [];
// site router
sitesActions.push(async (ctx, next) => {
  if (ctx.state.pathParams[0] === "site") {
    const siteId = ctx.state.pathParams[1];
    const field = ctx.state.pathParams[2];
    if (field === "createPage") {
      ctx.state.sessionMsg.url.searchParams.set("todo", field);
      await store.setSession(ctx, "editSite");
      await ctx.replyWithHTML(`<b>📃 Site: ${siteId}\nEnter new page url</b>` + ctx.state.sessionMsg.linkHTML());
      await ctx.answerCbQuery();
      return;
    }
    if (field) {
      // before set search params
      ctx.state.sessionMsg.url.searchParams.set("field", field);
      await store.setSession(ctx, "editSite");
      await ctx.replyWithHTML(`<b>💵 Site: ${siteId}\nEdit field: ${field}</b>` + ctx.state.sessionMsg.linkHTML());
      await ctx.answerCbQuery();
      return;
    }
    const inlineKeyboardArray = [];
    // show site
    if (siteId) {
      const site = await store.findRecord(`sites/${siteId}`);
      // set siteId for ediding data (page)
      ctx.state.sessionMsg.url.searchParams.set("siteId", siteId);
      // todo "site" or "page"
      ctx.state.sessionMsg.url.searchParams.set("todo", "site");
      inlineKeyboardArray.push([{text: "💵 Show all sites", callback_data: "site"}]);
      inlineKeyboardArray.push([{text: `📃 ${siteId} pages`, callback_data: "page"}]);
      if (process.env.BOT_LANG === "uk") {
        inlineKeyboardArray.push([{text: `📝 Edit site nameUk ${site.nameUk ? `✅ ${site.nameUk}` : "🚫"}`, callback_data: `site/${siteId}/nameUk`}]);
        inlineKeyboardArray.push([{text: `📝 Edit site aboutUk ${site.aboutUk ? "✅" : "🚫"}`, callback_data: `site/${siteId}/aboutUk`}]);
        inlineKeyboardArray.push([{text: `📝 Edit site descUk ${site.descRu ? "✅" : "🚫"}`, callback_data: `site/${siteId}/descUk`}]);
        inlineKeyboardArray.push([{text: `📝 Edit site titleUk ${site.titleUk ? "✅" : "🚫"}`, callback_data: `site/${siteId}/titleUk`}]);
      }
      inlineKeyboardArray.push([{text: `📝 Edit site nameRu ${site.nameRu ? `✅ ${site.nameRu}` : "🚫"}`, callback_data: `site/${siteId}/nameRu`}]);
      inlineKeyboardArray.push([{text: `📝 Edit site aboutRu ${site.aboutRu ? "✅" : "🚫"}`, callback_data: `site/${siteId}/aboutRu`}]);
      inlineKeyboardArray.push([{text: `📝 Edit site descRu ${site.descRu ? "✅" : "🚫"}`, callback_data: `site/${siteId}/descRu`}]);
      inlineKeyboardArray.push([{text: `📝 Edit site titleRu ${site.titleRu ? "✅" : "🚫"}`, callback_data: `site/${siteId}/titleRu`}]);
      inlineKeyboardArray.push([{text: `📝 Edit site contact ${site.contact ? "✅" : "🚫"}`, callback_data: `site/${siteId}/contact`}]);
      inlineKeyboardArray.push([{text: `📝 Edit site gtag ${site.gtag ? `✅ ${site.gtag}` : "🚫"}`, callback_data: `site/${siteId}/gtag`}]);
      await ctx.editMessageCaption(`<b>Site ${site.id}</b> ` + ctx.state.sessionMsg.linkHTML(), {
        parse_mode: "html",
        reply_markup: {
          inline_keyboard: inlineKeyboardArray,
        }});
    } else {
      // show all sites
      const sites = await store.findAll("sites");
      inlineKeyboardArray.push([{text: ctx.i18n.btn.main(), callback_data: "o"}]);
      sites.forEach((site) => {
        inlineKeyboardArray.push([{text: `📡 ${site.id}`, callback_data: `site/${site.id}`}]);
      });
      await ctx.editMessageCaption("<b>💵 Sites Editor</b>" + ctx.state.sessionMsg.linkHTML(), {
        parse_mode: "html",
        reply_markup: {
          inline_keyboard: inlineKeyboardArray,
        }});
    }
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});
// pages route
sitesActions.push(async (ctx, next) => {
  if (ctx.state.pathParams[0] === "page") {
    const siteId = ctx.state.sessionMsg.url.searchParams.get("siteId");
    const pageId = ctx.state.pathParams[1];
    const field = ctx.state.pathParams[2];
    if (field) {
      // before set search params
      ctx.state.sessionMsg.url.searchParams.set("field", field);
      await store.setSession(ctx, "editSite");
      await ctx.replyWithHTML(`<b>📃 Page url: ${siteId}/${pageId}\nEdit field: ${field}</b>` + ctx.state.sessionMsg.linkHTML());
      await ctx.answerCbQuery();
      return;
    }
    const inlineKeyboardArray = [];
    // show page
    if (pageId) {
      const page = await store.findRecord(`sites/${siteId}/pages/${pageId}`);
      // set siteId for ediding data (page)
      ctx.state.sessionMsg.url.searchParams.set("pageId", pageId);
      // todo "site" or "page"
      ctx.state.sessionMsg.url.searchParams.set("todo", "page");
      inlineKeyboardArray.push([{text: `📃 ${siteId} pages`, callback_data: "page"}]);
      if (process.env.BOT_LANG === "uk") {
        inlineKeyboardArray.push([{text: `📝 Edit page nameUk ${page.nameUk ? `✅ ${page.nameUk}` : "🚫"}`, callback_data: `page/${pageId}/nameUk`}]);
        inlineKeyboardArray.push([{text: `📝 Edit page aboutUk ${page.aboutUk ? "✅" : "🚫"}`, callback_data: `page/${pageId}/aboutUk`}]);
        inlineKeyboardArray.push([{text: `📝 Edit page previewUk ${page.previewUk ? "✅" : "🚫"}`, callback_data: `page/${pageId}/previewUk`}]);
        inlineKeyboardArray.push([{text: `📝 Edit page descUk ${page.descUk ? "✅" : "🚫"}`, callback_data: `page/${pageId}/descUk`}]);
        inlineKeyboardArray.push([{text: `📝 Edit page titleUk ${page.titleUk ? "✅" : "🚫"}`, callback_data: `page/${pageId}/titleUk`}]);
      }
      inlineKeyboardArray.push([{text: `📝 Edit page nameRu ${page.nameRu ? `✅ ${page.nameRu}` : "🚫"}`, callback_data: `page/${pageId}/nameRu`}]);
      inlineKeyboardArray.push([{text: `📝 Edit page aboutRu ${page.aboutRu ? "✅" : "🚫"}`, callback_data: `page/${pageId}/aboutRu`}]);
      inlineKeyboardArray.push([{text: `📝 Edit page previewRu ${page.previewRu ? "✅" : "🚫"}`, callback_data: `page/${pageId}/previewRu`}]);
      inlineKeyboardArray.push([{text: `📝 Edit page descRu ${page.descRu ? "✅" : "🚫"}`, callback_data: `page/${pageId}/descRu`}]);
      inlineKeyboardArray.push([{text: `📝 Edit page titleRu ${page.titleRu ? "✅" : "🚫"}`, callback_data: `page/${pageId}/titleRu`}]);
      inlineKeyboardArray.push([{text: `📝 Edit page catalogId ${page.catalogId ? "✅" : "🚫"}`, callback_data: `page/${pageId}/catalogId`}]);
      inlineKeyboardArray.push([{text: `📝 Edit page img ${page.img ? "✅" : "🚫"}`, callback_data: `page/${pageId}/img`}]);
      inlineKeyboardArray.push([{text: `📝 Edit page orderBy ${page.orderBy ? `✅ ${page.orderBy}` : "🚫"}`, callback_data: `page/${pageId}/orderBy`}]);
      await ctx.editMessageCaption(`<b>Page ${siteId}/${pageId}</b>\ncatalogId: ${page.catalogId ? `✅ ${page.catalogId}` : "🚫"}` + ctx.state.sessionMsg.linkHTML(), {
        parse_mode: "html",
        reply_markup: {
          inline_keyboard: inlineKeyboardArray,
        }});
    } else {
      // show all pages
      // TODO order by!!!
      const pagesSnap = await getFirestore().collection("sites").doc(siteId).collection("pages").orderBy("orderBy", "asc").get();
      inlineKeyboardArray.push([{text: `📡 ${siteId}`, callback_data: `site/${siteId}`}]);
      inlineKeyboardArray.push([{text: "➕ Create new page", callback_data: `site/${siteId}/createPage`}]);
      for (const page of pagesSnap.docs) {
        inlineKeyboardArray.push([{text: `📃 ${page.id}`, callback_data: `page/${page.id}`}]);
      }
      await ctx.editMessageCaption(`<b>📃 Pages ${siteId}</b>` + ctx.state.sessionMsg.linkHTML(), {
        parse_mode: "html",
        reply_markup: {
          inline_keyboard: inlineKeyboardArray,
        }});
    }
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});
const siteEditHandle = async (ctx, text) => {
  const siteId = ctx.state.sessionMsg.url.searchParams.get("siteId");
  const pageId = ctx.state.sessionMsg.url.searchParams.get("pageId");
  const todo = ctx.state.sessionMsg.url.searchParams.get("todo");
  const field = ctx.state.sessionMsg.url.searchParams.get("field");
  // edit site fields
  if (todo === "site") {
    await store.createRecord(`sites/${siteId}`, {
      [field]: text,
    });
    await ctx.replyWithHTML(`<b>Site ${siteId} field ${field} updated!</b>` + ctx.state.sessionMsg.linkHTML());
    await store.defaultSession(ctx);
  }
  // edit page fields
  if (todo === "page") {
    // validate orderBy field
    if (field === "orderBy") {
      text = parseInt(text);
      if (!Number.isInteger(text)) {
        ctx.replyWithHTML(`<b>Please enter integer number ${text}</b>` + ctx.state.sessionMsg.linkHTML());
        return;
      }
    }
    if (field === "catalogId") {
      const match = text.match(/\/c\/(.*)/);
      if (match) {
        text = match[1].replace(/\//g, "#");
      } else {
        ctx.replyWithHTML(`<b>Please enter valid catalog url ${text}</b>` + ctx.state.sessionMsg.linkHTML());
        return;
      }
    }
    await store.createRecord(`sites/${siteId}/pages/${pageId}`, {
      [field]: text,
    });
    await ctx.replyWithHTML(`<b>Page ${siteId}/page/${pageId} field ${field} updated!</b>` + ctx.state.sessionMsg.linkHTML());
    await store.defaultSession(ctx);
  }
  // create new page
  if (todo === "createPage") {
    // validate url
    if (/^[\w-]+$/.test(text)) {
      await store.createRecord(`sites/${siteId}/pages/${text}`, {
        orderBy: 1,
      });
      await ctx.replyWithHTML(`<b>Page ${siteId}/page/${text} created!</b>` + ctx.state.sessionMsg.linkHTML());
      await store.defaultSession(ctx);
    } else {
      ctx.replyWithHTML(`<b>Please enter valid url ${text}</b>` + ctx.state.sessionMsg.linkHTML());
    }
  }
};

exports.sitesActions = sitesActions;
exports.siteEditHandle = siteEditHandle;
