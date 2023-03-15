const firebase = require("firebase-admin");
const firestore = require("firebase-admin/firestore");
const {cart, store, roundNumber, photoCheckUrl, deletePhotoStorage, encodeCyrillic} = require("./bot_store_cart");
const {searchProductHandle, algoliaIndexProducts} = require("./bot_search");
const {parseUrl} = require("./bot_start_scene");
// catalogs actions array
const catalogsActions = [];
// show catalogs and goods
const showCatalog = async (ctx, next) => {
  if (ctx.state.routeName === "c") {
    // get btn url
    const inlineKeyboard = ctx.callbackQuery.message.reply_markup.inline_keyboard;
    let urlBtn = new URL(process.env.BOT_SITE);
    inlineKeyboard.forEach((btnArray) => {
      if (btnArray[0].url) {
        urlBtn = new URL(btnArray[0].url);
      }
    });
    const objectId = ctx.state.params.get("o") || ctx.state.sessionMsg.url.searchParams.get("oId");
    if (ctx.state.params.get("o")) {
      ctx.state.sessionMsg.url.searchParams.set("oId", objectId);
    }
    const cartButtons = await cart.cartButtons(objectId, ctx);
    let catalogId = ctx.state.param;
    const tag = ctx.state.params.get("t");
    const sessionTag = urlBtn.searchParams.getAll("sessionTag")[tag];
    const tagName = sessionTag && encodeCyrillic(sessionTag, true) || null;
    const startAfter = ctx.state.params.get("s");
    const endBefore = ctx.state.params.get("e");
    const upCatalog = ctx.state.params.get("up");
    const inCatalog = ctx.state.params.get("in");
    let publicImgUrl = null;
    const object = await store.findRecord(`objects/${objectId}`);
    if (object.photoId) {
      publicImgUrl = `photos/o/${objectId}/logo/${object.photoId}/2.jpg`;
    }
    const inlineKeyboardArray =[];
    const pathC = ctx.callbackQuery.data
        .replace("?up=1", "")
        .replace("?in=1", "");
    ctx.state.sessionMsg.url.searchParams.set("pathC", pathC);
    ctx.state.sessionMsg.url.searchParams.delete("cart");
    let currentCatalog;
    if (catalogId) {
      const pathUrl = ctx.state.sessionMsg.url.searchParams.get("pathU") || "";
      if (upCatalog) {
        // clear last cat
        catalogId = pathUrl.split(/#[a-zA-Z0-9-_]+$/)[0];
      } else if (inCatalog) {
        catalogId = `${pathUrl ? `${pathUrl}#` : ""}${catalogId}`;
      } else {
        catalogId = pathUrl;
      }
      ctx.state.sessionMsg.url.searchParams.set("pathU", catalogId);
      currentCatalog = await store.findRecord(`objects/${objectId}/catalogs/${catalogId}`);
      if (!currentCatalog) {
        await ctx.answerCbQuery("Catalog not found");
        return;
      }
      // back button
      inlineKeyboardArray.push([{text: `⤴️ ${currentCatalog.pathArray.length > 1 ? currentCatalog.pathArray[currentCatalog.pathArray.length - 2].name : ctx.i18n.btn.catalog()}`,
        callback_data: currentCatalog.parentId ? `c/${currentCatalog.parentId.substring(currentCatalog.parentId.lastIndexOf("#") + 1)}?up=1` : "c"}]);
      if (ctx.state.isAdmin && ctx.state.sessionMsg.url.searchParams.get("editMode")) {
        inlineKeyboardArray.push([{text: `📸 Загрузить фото каталога ${currentCatalog.name}`,
          callback_data: `u/${currentCatalog.id.substring(currentCatalog.id.lastIndexOf("#") + 1)}?todo=cat`}]);
        inlineKeyboardArray.push([{text: `📖 Описание ${currentCatalog.name}`,
          callback_data: `u/${currentCatalog.id.substring(currentCatalog.id.lastIndexOf("#") + 1)}?todo=desc`}]);
        inlineKeyboardArray.push([{text: `📖 PostId ${currentCatalog.name}`,
          callback_data: `u/${currentCatalog.id.substring(currentCatalog.id.lastIndexOf("#") + 1)}?todo=postId`}]);
      }
      // products query
      let mainQuery = firebase.firestore().collection("objects").doc(objectId)
          .collection("products").where("catalogId", "==", currentCatalog.id)
          .orderBy("orderNumber");
      // Filter by tag
      let tagUrl = "";
      if (tagName) {
        mainQuery = mainQuery.where("tags", "array-contains", tagName);
        tagUrl = `&t=${tag}`;
      }
      // show catalog siblings, get catalogs snap index or siblings
      const catalogsSnapshot = await firebase.firestore().collection("objects").doc(objectId)
          .collection("catalogs").where("parentId", "==", catalogId).orderBy("orderNumber").get();
      catalogsSnapshot.docs.forEach((doc) => {
        inlineKeyboardArray.push([{text: `🗂 ${doc.data().name}`, callback_data: `c/${doc.id.substring(doc.id.lastIndexOf("#") + 1)}?in=1`}]);
      });
      // paginate goods, copy main query
      let query = mainQuery;
      if (startAfter) {
        // get session
        const startAfterSession = ctx.state.sessionMsg.url.searchParams.get("s");
        const startAfterProduct = await firebase.firestore().collection("objects").doc(objectId)
            .collection("products")
            .doc(startAfterSession).get();
        query = query.startAfter(startAfterProduct);
      }
      // prev button
      if (endBefore) {
        const endBeforeSession = ctx.state.sessionMsg.url.searchParams.get("e");
        const endBeforeProduct = await firebase.firestore().collection("objects").doc(objectId)
            .collection("products")
            .doc(endBeforeSession).get();
        query = query.endBefore(endBeforeProduct).limitToLast(10);
      } else {
        query = query.limit(10);
      }
      // get products
      const productsSnapshot = await query.get();
      // get products tags
      if (!productsSnapshot.empty && catalogsSnapshot.empty) {
        const tagsArray = [];
        tagsArray.push({text: ctx.i18n.btn.filter(),
          callback_data: `t/${currentCatalog.id.substring(currentCatalog.id.lastIndexOf("#") + 1)}`});
        // Delete or close selected tag
        if (tag) {
          tagsArray[0].callback_data = `t/${currentCatalog.id.substring(currentCatalog.id.lastIndexOf("#") + 1)}?tS=${tag}`;
          tagsArray.push({text: `❎ ${tagName}`, callback_data: `c/${currentCatalog.id.substring(currentCatalog.id.lastIndexOf("#") + 1)}`});
        }
        inlineKeyboardArray.push(tagsArray);
      }
      // get cart product
      const cartProductsArray = await store.findRecord(`objects/${objectId}/carts/${ctx.from.id}`, "products");
      // generate products array
      for (const product of productsSnapshot.docs) {
        const addButton = {text: `📦 ${roundNumber(product.data().price * object.currencies[product.data().currency]).toLocaleString("ru-RU")}` +
        `${process.env.BOT_CURRENCY} ${product.data().name} (${product.id}) ${product.data().brand ? product.data().brand : ""}`,
        callback_data: `p/${product.id}`};
        // get cart products
        const cartProduct = cartProductsArray && cartProductsArray[product.id];
        if (cartProduct) {
          addButton.text = `🛒${cartProduct.qty}${cartProduct.unit} ` +
          `${roundNumber(cartProduct.price * cartProduct.qty).toLocaleString("ru-RU")} ` +
          `${process.env.BOT_CURRENCY} ${product.data().name} (${product.id}) ${product.data().brand ? product.data().brand : ""}`;
          addButton.callback_data = `p/${product.id}`;
        }
        inlineKeyboardArray.push([addButton]);
      }
      // Set load more button
      if (!productsSnapshot.empty) {
        const prevNext = [];
        // endBefore prev button e paaram
        const endBeforeSnap = productsSnapshot.docs[0];
        const ifBeforeProducts = await mainQuery.endBefore(endBeforeSnap).limitToLast(1).get();
        if (!ifBeforeProducts.empty) {
          // set session
          ctx.state.sessionMsg.url.searchParams.set("e", endBeforeSnap.id);
          prevNext.push({text: ctx.i18n.btn.previous(),
            callback_data: `c/${currentCatalog.id.substring(currentCatalog.id.lastIndexOf("#") + 1)}?e=1${tagUrl}`});
        }
        // startAfter
        const startAfterSnap = productsSnapshot.docs[productsSnapshot.docs.length - 1];
        const ifAfterProducts = await mainQuery.startAfter(startAfterSnap).limit(1).get();
        if (!ifAfterProducts.empty) {
          // set session
          ctx.state.sessionMsg.url.searchParams.set("s", startAfterSnap.id);
          prevNext.push({text: ctx.i18n.btn.next(),
            callback_data: `c/${currentCatalog.id.substring(currentCatalog.id.lastIndexOf("#") + 1)}?s=1${tagUrl}`});
        }
        inlineKeyboardArray.push(prevNext);
      }
      // get photo catalog
      if (currentCatalog.photoId) {
        publicImgUrl = `photos/o/${objectId}/c/${currentCatalog.id.replace(/#/g, "-")}/${currentCatalog.photoId}/2.jpg`;
      }
    } else {
      ctx.state.sessionMsg.url.searchParams.delete("pathU");
      const catalogsSnapshot = await firebase.firestore().collection("objects").doc(objectId)
          .collection("catalogs")
          .where("parentId", "==", null).orderBy("orderNumber").get();
      catalogsSnapshot.docs.forEach((doc) => {
        inlineKeyboardArray.push([{text: `🗂 ${doc.data().name}`, callback_data: `c/${doc.id.substring(doc.id.lastIndexOf("#") + 1)}?in=1`}]);
      });
    }
    // cart buttons
    cartButtons[0].text = `🏪 ${object.name}`;
    inlineKeyboardArray.push(cartButtons);
    inlineKeyboardArray.push([
      {
        text: `${catalogId ? currentCatalog.name : ctx.i18n.btn.catalog()}`,
        url: `${process.env.BOT_SITE}/o/${objectId}/c${catalogId ? "/" + catalogId.replace(/#/g, "/") : ""}?${urlBtn.searchParams.toString()}`,
      },
    ]);
    // render
    const media = await photoCheckUrl(publicImgUrl);
    await ctx.editMessageMedia({
      type: "photo",
      media,
      caption: `<b>${object.name} > ${currentCatalog && currentCatalog.pathArray ? `${ctx.i18n.btn.catalog()} > ${currentCatalog.pathArray.map((cat) => cat.name).join(" > ")}` : ctx.i18n.btn.catalog()}</b>\n` +
        `${currentCatalog && currentCatalog.postId ? `RZK Market Channel <a href="t.me/${process.env.BOT_CHANNEL}/${currentCatalog.postId}">t.me/${process.env.BOT_CHANNEL}/${currentCatalog.postId}</a>` : ""} ` + ctx.state.sessionMsg.linkHTML(),
      parse_mode: "html",
    }, {reply_markup: {
      inline_keyboard: inlineKeyboardArray,
    }});
    await ctx.answerCbQuery();
  } else {
    return next();
  }
};
catalogsActions.push(showCatalog);

// show product
const showProduct = async (ctx, next) => {
  if (ctx.state.routeName === "p") {
    // enable edit mode
    const editOn = ctx.state.params.get("editOn");
    const editOff = ctx.state.params.get("editOff");
    const page = ctx.state.sessionMsg.url.searchParams.get("page");
    const fromCart = ctx.state.sessionMsg.url.searchParams.get("cart");
    // edit mode
    if (editOn) {
      // uUrl += "&u=1";
      ctx.state.sessionMsg.url.searchParams.set("editMode", true);
      await ctx.answerCbQuery("Edit Mode Enable");
    }
    if (editOff) {
      ctx.state.sessionMsg.url.searchParams.delete("editMode");
      await ctx.answerCbQuery("Edit Mode disable");
    }
    // get product data
    const productId = ctx.state.param;
    const objectId = ctx.state.params.get("o") || ctx.state.sessionMsg.url.searchParams.get("oId");
    if (ctx.state.params.get("o")) {
      ctx.state.sessionMsg.url.searchParams.set("oId", objectId);
    }
    const object = await store.findRecord(`objects/${objectId}`);
    const product = await store.findRecord(`objects/${objectId}/products/${productId}`);
    if (!product) {
      await ctx.answerCbQuery("Product not found");
      return;
    }
    ctx.state.sessionMsg.url.searchParams.set("pathU", product.catalogId);
    const productPrice = roundNumber(product.price * object.currencies[product.currency]);
    const cartButtons = await cart.cartButtons(objectId, ctx);
    let catalogUrl = `c/${product.catalogId.substring(product.catalogId.lastIndexOf("#") + 1)}`;
    const sessionPathCatalog = ctx.state.sessionMsg.url.searchParams.get("pathC");
    if (sessionPathCatalog && !page && !fromCart) {
      catalogUrl = sessionPathCatalog;
    } else {
      ctx.state.sessionMsg.url.searchParams.set("pathC", catalogUrl);
    }
    const inlineKeyboardArray = [];
    inlineKeyboardArray.push([{text: `⤴️ ${product.pathArray[product.pathArray.length - 1].name}`, callback_data: catalogUrl}]);
    // default add button
    const addButton = {text: ctx.i18n.btn.buy(), callback_data: `k/${product.id}`};
    // get cart products
    const prodBtns = [];
    const cartProduct = await store.findRecord(`objects/${objectId}/carts/${ctx.from.id}`,
        `products.${productId}`);
    // ctx.state.sessionMsg.url.searchParams.delete("pCart");
    ctx.state.sessionMsg.url.searchParams.delete("cPrice");
    if (cartProduct) {
      // ctx.state.sessionMsg.url.searchParams.set("pCart", true);
      ctx.state.sessionMsg.url.searchParams.set("cPrice", cartProduct.price);
      addButton.text = `🛒 ${cartProduct.qty} ${cartProduct.unit} ` +
      ` ${roundNumber(cartProduct.qty * cartProduct.price).toLocaleString("ru-RU")} ${process.env.BOT_CURRENCY}`;
      addButton.callback_data = `k/${product.id}?qty=${cartProduct.qty}`;
      prodBtns.push(addButton);
      prodBtns.push({text: ctx.i18n.btn.del(), callback_data: `a/${productId}`});
    } else {
      prodBtns.push(addButton);
    }
    inlineKeyboardArray.push(prodBtns);
    // add session vars
    ctx.state.sessionMsg.url.searchParams.set("pName", encodeCyrillic(`${product.brand ? product.brand + " " : ""}${product.name}`));
    ctx.state.sessionMsg.url.searchParams.set("pPrice", productPrice);
    ctx.state.sessionMsg.url.searchParams.set("pUnit", product.unit);
    ctx.state.sessionMsg.url.searchParams.set("TTL", 1);
    // chck photos
    if (product.photos && product.photos.length) {
      inlineKeyboardArray.push([{text: `🖼 Фото (${product.photos.length})`,
        callback_data: `s/${product.id}`}]);
    }
    // Get main photo url.
    let publicImgUrl = null;
    if (object.photoId) {
      publicImgUrl = `photos/o/${objectId}/logo/${object.photoId}/2.jpg`;
    }
    if (product.mainPhoto) {
      publicImgUrl = `photos/o/${objectId}/p/${product.id}/${product.mainPhoto}/2.jpg`;
    }
    // footer buttons
    cartButtons[0].text = `🏪 ${object.name}`;
    inlineKeyboardArray.push(cartButtons);
    // get btn url
    const inlineKeyboard = ctx.callbackQuery.message.reply_markup.inline_keyboard;
    let urlBtn = new URL(process.env.BOT_SITE);
    inlineKeyboard.forEach((btnArray) => {
      if (btnArray[0].url) {
        urlBtn = new URL(btnArray[0].url);
      }
    });
    inlineKeyboardArray.push([
      {
        text: `${product.brand ? product.brand + " " : ""}${product.name}`,
        url: `${process.env.BOT_SITE}/o/${objectId}/p/${product.id}?${urlBtn.searchParams.toString()}`,
      },
    ]);
    // search btn
    if (page) {
      inlineKeyboardArray.push([{text: ctx.i18n.btn.backToSearch(), callback_data: `search/${page}`}]);
    }
    const media = await photoCheckUrl(publicImgUrl);
    // admin btns
    if (ctx.state.isAdmin) {
      if (ctx.state.sessionMsg.url.searchParams.get("editMode")) {
        ctx.state.sessionMsg.url.searchParams.set("cRowN", product.rowNumber);
        ctx.state.sessionMsg.url.searchParams.set("ePrice", product.price);
        ctx.state.sessionMsg.url.searchParams.set("ePurchase", product.purchasePrice);
        ctx.state.sessionMsg.url.searchParams.set("eCurrency", product.currency);
        inlineKeyboardArray.push([{text: "🔒 Отключить Режим редактирования",
          callback_data: `p/${product.id}?editOff=true`}]);
      } else {
        if (cartProduct) {
          inlineKeyboardArray.push([{text: `📝 Изменить цену в корзине ${cartProduct.price.toLocaleString("ru-RU")} ${process.env.BOT_CURRENCY}`,
            callback_data: `k/${product.id}?qty=${cartProduct.price}&price=1`}]);
        }
        inlineKeyboardArray.push([{text: "📝 Включить Режим редактирования",
          callback_data: `p/${product.id}?editOn=true`}]);
      }
    }
    // set url session
    if (ctx.state.isAdmin && ctx.state.sessionMsg.url.searchParams.get("editMode")) {
      inlineKeyboardArray.push([{text: "Изменить наименовение товара",
        callback_data: `b/${product.id}?todo=name&c=C`}]);
      inlineKeyboardArray.push([{text: `Изменить закуп цену ${product.purchasePrice.toLocaleString("ru-RU")} ${product.currency}`,
        callback_data: `b/${product.id}?todo=pPrice&c=D`}]);
      inlineKeyboardArray.push([{text: `Изменить прод цену ${product.price.toLocaleString("ru-RU")} ${product.currency}`,
        callback_data: `b/${product.id}?todo=price&c=E`}]);
      inlineKeyboardArray.push([{text: "Добавить описание",
        callback_data: `b/${product.id}?todo=desc`}]);
      inlineKeyboardArray.push([{text: "Добавить пост из канала",
        callback_data: `b/${product.id}?todo=postId`}]);
      inlineKeyboardArray.push([{text: "Удалить товар",
        callback_data: `b/${product.id}?todo=del`}]);
      inlineKeyboardArray.push([{text: "Загрузить в Merch",
        callback_data: `uploadMerch/${product.id}`}]);
      inlineKeyboardArray.push([{text: "📸 Загрузить фото",
        callback_data: `u/${product.id}?todo=prod`}]);
    }
    await ctx.editMessageMedia({
      type: "photo",
      media,
      caption: `<b>${object.name}\n${product.brand ? product.brand + "\n" : ""}${product.name} (${product.id})\n</b>` +
      `${ctx.i18n.product.price()}: ${productPrice.toLocaleString("ru-RU")} ${process.env.BOT_CURRENCY} ${ctx.state.isAdmin && cartProduct ? `в корзине ${cartProduct.price.toLocaleString("ru-RU")} ${process.env.BOT_CURRENCY}` : ""}\n` +
      `${product.postId ? `RZK Market Channel <a href="t.me/${process.env.BOT_CHANNEL}/${product.postId}">t.me/${process.env.BOT_CHANNEL}/${product.postId}</a>` : ""}` + ctx.state.sessionMsg.linkHTML(),
      parse_mode: "html",
    }, {reply_markup: {
      inline_keyboard: inlineKeyboardArray,
    }});
    await ctx.answerCbQuery();
  } else {
    return next();
  }
};
catalogsActions.push(showProduct);

// add product to cart by keyboard
catalogsActions.push(async (ctx, next) => {
  if (ctx.state.routeName === "a") {
    ctx.state.sessionMsg.url.searchParams.set("TTL", 0);
    const objectId = ctx.state.sessionMsg.url.searchParams.get("oId");
    const id = ctx.state.param;
    // const product = await store.findRecord(`objects/${objectId}/products/${id}`);
    const name = encodeCyrillic(ctx.state.sessionMsg.url.searchParams.get("pName"), true);
    // const name = product.name;
    // const price = + ctx.state.sessionMsg.url.searchParams.get("pPrice");
    const unit = ctx.state.sessionMsg.url.searchParams.get("pUnit");
    // const pCart = ctx.state.sessionMsg.url.searchParams.get("pCart");
    const product = await store.findRecord(`objects/${objectId}/products/${id}`);
    const pCart = await store.findRecord(`objects/${objectId}/carts/${ctx.from.id}`, `products.${id}`);
    const redirectToCart = ctx.state.sessionMsg.url.searchParams.get("cart");
    const page = ctx.state.sessionMsg.url.searchParams.get("page");
    const qty = + ctx.state.params.get("qty") || 0;
    // TODO add if statemant
    if (page) {
      ctx.state.sessionMsg.url.searchParams.set("sQty", qty);
      ctx.state.sessionMsg.url.searchParams.set("sId", id);
      ctx.state.sessionMsg.url.searchParams.set("sObjectId", objectId);
    }
    // if product exist
    if (product) {
      const object = await store.findRecord(`objects/${objectId}`);
      const price = product.price = roundNumber(product.price * object.currencies[product.currency]);
      if (pCart) {
        if (qty) {
          // add updatedAt for control price updater
          await cart.update({
            objectId,
            userId: ctx.from.id,
            product: {
              [id]: {
                price,
                qty,
                updatedAt: Math.floor(Date.now() / 1000),
              },
            },
          });
          await ctx.answerCbQuery(`${id} = ${qty}${unit}, ${ctx.i18n.product.upd()}`);
        } else {
          await cart.delete({
            objectId,
            userId: ctx.from.id,
            id,
          });
          await ctx.answerCbQuery(`${id}, ${ctx.i18n.product.del()}`);
        }
      } else {
        // add new product
        if (qty) {
          await cart.add({
            objectId,
            userId: ctx.from.id,
            fromBot: true,
            product: {
              [id]: {
                name,
                price,
                unit,
                qty,
                createdAt: Math.floor(Date.now() / 1000),
              },
            },
          });
        }
        await ctx.answerCbQuery(`${id} = ${qty}${unit}, ${ctx.i18n.product.add()}`);
      }
    } else {
      // delete not exist cart
      if (pCart) {
        await cart.delete({
          objectId,
          userId: ctx.from.id,
          id,
        });
        await ctx.answerCbQuery(`${id} not exist!`);
      }
    }
    if (page) {
      parseUrl(ctx, `search/${page}`);
      await searchProductHandle(ctx);
      return;
    }
    if (redirectToCart) {
      parseUrl(ctx, "cart");
      await showCart(ctx);
    } else {
      const sessionPathCatalog = ctx.state.sessionMsg.url.searchParams.get("pathC");
      parseUrl(ctx, sessionPathCatalog ? sessionPathCatalog : "c");
      await showCatalog(ctx);
    }
  } else {
    return next();
  }
});

catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "k") {
    let qty = ctx.state.params.get("qty") || 0;
    const changePrice = ctx.state.params.get("price");
    const number = ctx.state.params.get("n");
    const back = ctx.state.params.get("b");
    const objectId = ctx.state.sessionMsg.url.searchParams.get("oId");
    const productId = ctx.state.param;
    const productName = encodeCyrillic(ctx.state.sessionMsg.url.searchParams.get("pName"), true);
    const productPrice = + ctx.state.sessionMsg.url.searchParams.get("pPrice");
    const productCartPrice = + ctx.state.sessionMsg.url.searchParams.get("cPrice");
    const productUnit = ctx.state.sessionMsg.url.searchParams.get("pUnit");
    ctx.state.sessionMsg.url.searchParams.set("TTL", 1);
    // use edit caption media not need
    // add number
    if (number) {
      qty += number;
    }
    // delete number
    if (back) {
      qty = qty.slice(0, -1);
    }
    // delete zerows
    qty = + qty;
    const paramsUrl = changePrice ? `qty=${qty}&price=1` : `qty=${qty}`;
    // check max qty
    if (!changePrice && qty > 20000) {
      await ctx.answerCbQuery("qty > 20000");
      return false;
    }
    // get btn url
    const inlineKeyboard = ctx.callbackQuery.message.reply_markup.inline_keyboard;
    let urlBtn = new URL(process.env.BOT_SITE);
    inlineKeyboard.forEach((btnArray) => {
      if (btnArray[0].url) {
        urlBtn = new URL(btnArray[0].url);
      }
    });
    let msg;
    if (changePrice) {
      msg = `<b>Change price in cart</b>\n${productName} (${productId}) \nNew price: ${qty.toLocaleString("ru-RU")} ${process.env.BOT_CURRENCY}`;
    } else {
      msg = `<b>${ctx.i18n.product.placeholderQty()}</b>\n${productName} (${productId})\n` +
      `<b>${ctx.i18n.product.qty()}: ${qty.toLocaleString("ru-RU")} ${productUnit}</b>\n` +
      `${ctx.i18n.product.price()}: ${productPrice.toLocaleString("ru-RU")} ${process.env.BOT_CURRENCY} ${ctx.state.isAdmin && productCartPrice ? `в корзине ${productCartPrice.toLocaleString("ru-RU")} ${process.env.BOT_CURRENCY}` : ""}\n` +
      `<b>${ctx.i18n.product.sum()}: ${ctx.state.isAdmin && productCartPrice ? roundNumber(qty * productCartPrice).toLocaleString("ru-RU") : roundNumber(qty * productPrice).toLocaleString("ru-RU")} ` +
      `${process.env.BOT_CURRENCY}</b>`;
    }
    await ctx.editMessageCaption(msg + ctx.state.sessionMsg.linkHTML(), {
      parse_mode: "html",
      reply_markup: {
        inline_keyboard: [
          [
            {text: `⤴️ ${productName}`, callback_data: `p/${productId}`},
          ],
          [
            {text: "7", callback_data: `k/${productId}?n=7&${paramsUrl}`},
            {text: "8", callback_data: `k/${productId}?n=8&${paramsUrl}`},
            {text: "9", callback_data: `k/${productId}?n=9&${paramsUrl}`},
          ],
          [
            {text: "4", callback_data: `k/${productId}?n=4&${paramsUrl}`},
            {text: "5", callback_data: `k/${productId}?n=5&${paramsUrl}`},
            {text: "6", callback_data: `k/${productId}?n=6&${paramsUrl}`},
          ],
          [
            {text: "1", callback_data: `k/${productId}?n=1&${paramsUrl}`},
            {text: "2", callback_data: `k/${productId}?n=2&${paramsUrl}`},
            {text: "3", callback_data: `k/${productId}?n=3&${paramsUrl}`},
          ],
          [
            {text: "⬅️", callback_data: `k/${productId}?b=1&${paramsUrl}`},
            {text: "0️", callback_data: `k/${productId}?n=0&${paramsUrl}`},
            {text: changePrice ? "Изменить цену" : ctx.i18n.btn.buy(), callback_data: changePrice ? `x/${productId}?${paramsUrl}` : `a/${productId}?${paramsUrl}`},
          ],
          [
            {text: productName, url: `${process.env.BOT_SITE}/o/${objectId}/p/${productId}?${urlBtn.searchParams.toString()}`},
          ],
        ],
      }});
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// show cart
const showCart = async (ctx, next) => {
  if (ctx.state.routeName === "cart") {
    ctx.state.sessionMsg.url.searchParams.delete("pathU");
    ctx.state.sessionMsg.url.searchParams.delete("pathC");
    ctx.state.sessionMsg.url.searchParams.delete("s");
    ctx.state.sessionMsg.url.searchParams.delete("e");
    const clear = ctx.state.params.get("clear");
    const clearOrder = ctx.state.params.get("clearOrder");
    const objectId = ctx.state.params.get("o") || ctx.state.sessionMsg.url.searchParams.get("oId");
    if (clearOrder) {
      ctx.state.sessionMsg.url.searchParams.delete("orderData_id");
      ctx.state.sessionMsg.url.searchParams.delete("orderData_orderNumber");
      ctx.state.sessionMsg.url.searchParams.delete("orderData_lastName");
      ctx.state.sessionMsg.url.searchParams.delete("orderData_firstName");
    }
    // clear cart
    if (clear) {
      await cart.clear(objectId, ctx.from.id);
    }
    const inlineKeyboardArray = [];
    const object = await store.findRecord(`objects/${objectId}`);
    let msgTxt = `<b>${object.name} > ${ctx.i18n.btn.cart()}</b>\n`;
    let totalQty = 0;
    let totalSum = 0;
    // let itemShow = 0;
    const products = await cart.products(objectId, ctx.from.id);
    // redirect to cart param
    ctx.state.sessionMsg.url.searchParams.set("cart", true);
    for (const [index, cartProduct] of products.entries()) {
      // check cart products price exist...
      const product = await store.findRecord(`objects/${objectId}/products/${cartProduct.id}`);
      if (product) {
        // update price in cart only for users
        const productOld = (Math.floor(Date.now() / 1000) - cartProduct.updatedAt) > 3600;
        if (!ctx.state.isAdmin && productOld && product.price !== cartProduct.price) {
          const price = roundNumber(product.price * object.currencies[product.currency]);
          cartProduct.price = price;
          // products this is name field!!!
          // const products = {
          //   [product.id]: {
          //     price: product.price,
          //   },
          // };
          // await store.createRecord(`objects/${objectId}/carts/${ctx.from.id}`, {products});
          await cart.update({
            objectId,
            userId: ctx.from.id,
            product: {
              [product.id]: {
                price,
              },
            },
          });
        }
        inlineKeyboardArray.push([
          {text: `${index + 1}) ${cartProduct.qty.toLocaleString("ru-RU")}${product.unit}*${cartProduct.price.toLocaleString("ru-RU")} ${process.env.BOT_CURRENCY}=` +
          `${product.name} (${product.id}) ${product.brand ? product.brand : ""}`,
          callback_data: `p/${product.id}`},
        ]);
        totalQty += cartProduct.qty;
        totalSum += cartProduct.qty * cartProduct.price;
      } else {
        // delete product
        await cart.delete({
          objectId,
          userId: ctx.from.id,
          id: cartProduct.id,
        });
      }
    }
    if (totalQty) {
      msgTxt += `<b>${ctx.i18n.product.qty()}: ${totalQty.toLocaleString("ru-RU")}\n` +
      `${ctx.i18n.product.sum()}: ${roundNumber(totalSum).toLocaleString("ru-RU")} ${process.env.BOT_CURRENCY}</b>`;
    }

    if (products.length) {
      // const orderData = await store.findRecord(`users/${ctx.from.id}`, "session.orderData");
      const orderDataId = ctx.state.sessionMsg.url.searchParams.get("orderData_id");
      const orderDataOrderNumber = ctx.state.sessionMsg.url.searchParams.get("orderData_orderNumber");
      const orderDataLastName = ctx.state.sessionMsg.url.searchParams.get("orderData_lastName");
      const orderDataFirstNme = ctx.state.sessionMsg.url.searchParams.get("orderData_firstName");
      const pathOrderCurrent = ctx.state.sessionMsg.url.searchParams.get("pathOrderCurrent");
      if (orderDataId) {
        inlineKeyboardArray.push([{text: `✅ Сохранить Заказ #${orderDataOrderNumber} от ${orderDataLastName} ` +
        `${orderDataFirstNme}`, callback_data: `e/${orderDataId}?saveProd=1`}]);
        inlineKeyboardArray.push([{text: "🏠 Вернуться к заказу", callback_data: `${pathOrderCurrent}`}]);
        // delete order from cart
        inlineKeyboardArray.push([{text: `❎ Убрать Заказ #${orderDataOrderNumber} от ${orderDataLastName} ` +
        `${orderDataFirstNme}`, callback_data: `cart?clearOrder=${orderDataId}`}]);
      }
      // create order
      inlineKeyboardArray.push([{text: ctx.i18n.btn.purchase(),
        callback_data: "w/payment"}]);
      // create pdf
      inlineKeyboardArray.push([{text: ctx.i18n.btn.savePdf(),
        callback_data: `f/cart?id=${ctx.from.id}`}]);
      // clear cart
      inlineKeyboardArray.push([{text: ctx.i18n.btn.clearCart(),
        callback_data: "cart?clear=1"}]);
    } else {
      inlineKeyboardArray.push([
        {text: ctx.i18n.btn.catalog(), callback_data: "c"},
      ]);
      msgTxt += ctx.i18n.txt.cartEmpty();
    }
    // Set Main menu
    inlineKeyboardArray.push([{text: `🏪 ${object.name}`,
      callback_data: `o/${objectId}`}]);
    // share cart
    if (products.length) {
      inlineKeyboardArray.push([
        {text: ctx.i18n.btn.linkCart(), url: `${process.env.BOT_SITE}/o/${objectId}/share-cart/${ctx.from.id}`},
      ]);
    }
    // edit message
    let publicImgUrl = null;
    if (object.photoId) {
      publicImgUrl = `photos/o/${objectId}/logo/${object.photoId}/2.jpg`;
    }
    const media = await photoCheckUrl(publicImgUrl);
    await ctx.editMessageMedia({
      type: "photo",
      media,
      caption: msgTxt + ctx.state.sessionMsg.linkHTML(),
      parse_mode: "html",
    }, {reply_markup: {
      inline_keyboard: inlineKeyboardArray,
    }});
    await ctx.answerCbQuery();
  } else {
    return next();
  }
};
catalogsActions.push(showCart);

// wizard scene
const cartWizard = [
  // show carrier services 0
  async (ctx, caption, inlineKeyboardArray = []) => {
    await ctx.editMessageCaption(`<b>${caption}:</b>` + ctx.state.sessionMsg.linkHTML(),
        {
          parse_mode: "html",
          reply_markup: {
            inline_keyboard: inlineKeyboardArray,
          },
        });
  },
  // 1
  async (ctx, error) => {
    const inlineKeyboardArray = [];
    let qty = ctx.state.params.get("qty") || 0;
    const number = ctx.state.params.get("n");
    const back = ctx.state.params.get("b");
    const orderId = ctx.state.params.get("oId");
    const carrierId = ctx.state.params.get("cId");
    // add number
    if (number) {
      qty += number;
    }
    // delete number
    if (back) {
      qty = qty.slice(0, -1);
    }
    // delete zerows
    qty = + qty;
    let paramsUrl = `qty=${qty}`;
    // add carrier ID
    if (carrierId) {
      paramsUrl += `&cId=${carrierId}`;
    }
    // TODO Maybe delete!!! this parapm???
    if (orderId) {
      paramsUrl += `&oId=${orderId}`;
    }
    inlineKeyboardArray.push([
      {text: "7", callback_data: `w/k?n=7&${paramsUrl}`},
      {text: "8", callback_data: `w/k?n=8&${paramsUrl}`},
      {text: "9", callback_data: `w/k?n=9&${paramsUrl}`},
    ]);
    inlineKeyboardArray.push([
      {text: "4", callback_data: `w/k?n=4&${paramsUrl}`},
      {text: "5", callback_data: `w/k?n=5&${paramsUrl}`},
      {text: "6", callback_data: `w/k?n=6&${paramsUrl}`},
    ]);
    inlineKeyboardArray.push([
      {text: "1", callback_data: `w/k?n=1&${paramsUrl}`},
      {text: "2", callback_data: `w/k?n=2&${paramsUrl}`},
      {text: "3", callback_data: `w/k?n=3&${paramsUrl}`},
    ]);
    inlineKeyboardArray.push([
      {text: "⬅️", callback_data: `w/k?b=1&${paramsUrl}`},
      {text: "0️", callback_data: `w/k?n=0&${paramsUrl}`},
      {text: "Ok", callback_data: orderId ? `e/${orderId}?cN=${qty}&saveCarrier=${carrierId}` :
      `w/setCurrier?cN=${qty}&cId=${carrierId}`},
    ]);
    // edit order mode or purchase
    if (orderId) {
      inlineKeyboardArray.push([{text: "⬅️ Назад", callback_data: `r/${orderId}`}]);
    } else {
      inlineKeyboardArray.push([{text: ctx.i18n.btn.cart(), callback_data: "cart"}]);
    }
    await ctx.editMessageCaption(`${ctx.i18n.txt.carrierNumber()}:\n<b>${qty}</b>` +
      `\n${error ? `Error: ${ctx.i18n.txt.carrierNumber()}` : ""}` + ctx.state.sessionMsg.linkHTML(),
    {
      parse_mode: "html",
      reply_markup: {
        inline_keyboard: inlineKeyboardArray,
      },
    });
  },
  // 2
  async (ctx) => {
    ctx.state.sessionMsg.url.searchParams.set("scene", "wizardOrder");
    ctx.state.sessionMsg.url.searchParams.set("cursor", 3);
    await ctx.replyWithHTML(ctx.i18n.txt.address() + ctx.state.sessionMsg.linkHTML(), {
      reply_markup: {
        force_reply: true,
        input_field_placeholder: ctx.i18n.txt.address(),
      }});
  },
  // 3
  async (ctx, address) => {
    // const address = ctx.message.text;
    ctx.state.sessionMsg.url.searchParams.set("address", address);
    ctx.state.sessionMsg.url.searchParams.set("cursor", 4);
    await ctx.replyWithHTML(`<b>${ctx.i18n.txt.lastName()}</b>` + ctx.state.sessionMsg.linkHTML(),
        {
          reply_markup: {
            force_reply: true,
            input_field_placeholder: ctx.i18n.txt.lastName(),
          },
        });
  },
  // 4
  async (ctx, lastName) => {
    ctx.state.sessionMsg.url.searchParams.set("lastName", lastName);
    // reply first name
    ctx.state.sessionMsg.url.searchParams.set("cursor", 5);
    await ctx.replyWithHTML(`<b>${ctx.i18n.txt.firstName()}</b>` + ctx.state.sessionMsg.linkHTML(),
        {
          reply_markup: {
            force_reply: true,
            input_field_placeholder: ctx.i18n.txt.firstName(),
          },
        });
  },
  // 5
  async (ctx, firstName) => {
    // const firstName = ctx.message.text;
    ctx.state.sessionMsg.url.searchParams.set("firstName", firstName);
    ctx.state.sessionMsg.url.searchParams.set("cursor", 6);
    await ctx.replyWithHTML(`<b>${ctx.i18n.txt.phoneNumber()} ${process.env.BOT_PHONETEMPLATE}</b>` + ctx.state.sessionMsg.linkHTML(), {
      reply_markup: {
        force_reply: true,
        input_field_placeholder: process.env.BOT_PHONETEMPLATE,
      },
    });
  },
  // 6
  async (ctx, phoneNumberText) => {
    // const phoneNumberText = (ctx.message.contact && ctx.message.contact.phone_number) || ctx.message.text;
    const regexpPhoneRu = new RegExp(process.env.BOT_PHONEREGEXP);
    const checkPhone = phoneNumberText.match(regexpPhoneRu);
    if (!checkPhone) {
      await ctx.replyWithHTML(`${ctx.i18n.txt.phoneNumber()} ${process.env.BOT_PHONETEMPLATE}` + ctx.state.sessionMsg.linkHTML(), {
        reply_markup: {
          force_reply: true,
          input_field_placeholder: process.env.BOT_PHONETEMPLATE,
        },
      });
      return;
    }
    const phoneNumber = `${process.env.BOT_PHONECODE}${checkPhone[2]}`;
    ctx.state.sessionMsg.url.searchParams.set("phoneNumber", phoneNumber);
    const inlineKeyboard = [];
    inlineKeyboard.push([{text: ctx.i18n.btn.proceed(), callback_data: "w/setNoComment"}]);
    inlineKeyboard.push([{text: ctx.i18n.btn.addComment(), callback_data: "w/setComment"}]);
    await ctx.replyWithHTML(ctx.i18n.txt.comment() + ctx.state.sessionMsg.linkHTML(),
        {
          reply_markup: {
            inline_keyboard: inlineKeyboard,
          }});
  },
  // 7
  async (ctx, comment) => {
    if (comment) {
      ctx.state.sessionMsg.url.searchParams.set("comment", comment);
    }
    // get preorder data
    const inlineKeyboard = [];
    inlineKeyboard.push([{text: ctx.i18n.btn.purchaseConfirm(), callback_data: "w/createOrder"}]);
    const preOrderData = ctx.state.sessionMsg.url.searchParams;
    await ctx.replyWithHTML(`<b>${ctx.i18n.txt.check()}:</b>\n` +
        `${preOrderData.get("lastName")} ${preOrderData.get("firstName")} ${preOrderData.get("phoneNumber")}\n` +
        `${preOrderData.get("address")}\n` +
        `Доставка: ${store.carriers().get(+ preOrderData.get("carrierId")).name} ` +
        `${preOrderData.get("carrierNumber") ? "#" + preOrderData.get("carrierNumber") : ""}\n` +
        `Оплата: ${store.payments().get(+ preOrderData.get("paymentId"))}\n` +
        `${preOrderData.get("comment") ? `${ctx.i18n.txt.comment()}: ${preOrderData.get("comment")}` : ""}` + ctx.state.sessionMsg.linkHTML(),
    {
      reply_markup: {
        inline_keyboard: inlineKeyboard,
      }});
  },
];
// save order final
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "w") {
    const todo = ctx.state.param;
    // order payment method
    if (todo === "payment") {
      // show paymets service
      const inlineKeyboardArray = [];
      store.payments().forEach((value, key) => {
        inlineKeyboardArray.push([{text: value, callback_data: `w/carrier?paymentId=${key}`}]);
      });
      inlineKeyboardArray.push([{text: ctx.i18n.btn.cart(), callback_data: "cart"}]);
      await cartWizard[0](ctx, "Оплата", inlineKeyboardArray);
    }
    // show carrier
    if (todo === "carrier") {
      // save payment
      const paymentId = + ctx.state.params.get("paymentId");
      ctx.state.sessionMsg.url.searchParams.set("paymentId", paymentId);
      const inlineKeyboardArray = [];
      store.carriers().forEach((obj, key) => {
        if (obj.reqNumber) {
          inlineKeyboardArray.push([{text: obj.name, callback_data: `w/k?cId=${key}`}]);
        } else {
          inlineKeyboardArray.push([{text: obj.name, callback_data: `w/wizard?cId=${key}`}]);
        }
      });
      inlineKeyboardArray.push([{text: ctx.i18n.btn.cart(), callback_data: "cart"}]);
      await cartWizard[0](ctx, "Доставка", inlineKeyboardArray);
    }
    // set carrier number by virt keyboard
    if (todo === "k") {
      await cartWizard[1](ctx);
    }
    if (todo === "setCurrier") {
      const carrierId = + ctx.state.params.get("cId");
      const carrierNumber = + ctx.state.params.get("cN");
      ctx.state.sessionMsg.url.searchParams.set("carrierId", carrierId);
      if (carrierNumber) {
        ctx.state.sessionMsg.url.searchParams.set("carrierNumber", carrierNumber);
      } else {
        await cartWizard[1](ctx, "errorCurrierNumber");
        return;
      }
      await ctx.deleteMessage();
      await cartWizard[2](ctx);
    }
    // save payment and goto wizard
    if (todo === "wizard") {
      const carrierId = + ctx.state.params.get("cId");
      // test save msg session
      ctx.state.sessionMsg.url.searchParams.set("carrierId", carrierId);
      await ctx.deleteMessage();
      await cartWizard[2](ctx);
    }
    // save last name user
    if (todo === "setCurrentLastName") {
      await ctx.deleteMessage();
      await cartWizard[4](ctx, ctx.from.last_name);
    }
    // save custom last name
    if (todo === "setLastName") {
      await ctx.deleteMessage();
      ctx.state.sessionMsg.url.searchParams.set("cursor", 4);
      await ctx.replyWithHTML("<b>Введите фамилию получателя</b>" + ctx.state.sessionMsg.linkHTML(),
          {
            reply_markup: {
              force_reply: true,
            },
          });
    }
    // save last name user
    if (todo === "setCurrentFirstName") {
      await ctx.deleteMessage();
      await cartWizard[5](ctx, ctx.from.first_name);
    }
    // save custom last name
    if (todo === "setFirstName") {
      await ctx.deleteMessage();
      ctx.state.sessionMsg.url.searchParams.set("cursor", 5);
      await ctx.replyWithHTML("<b>Введите имя получателя</b>" + ctx.state.sessionMsg.linkHTML(),
          {
            reply_markup: {
              force_reply: true,
            },
          });
    }
    // save phone number
    if (todo === "setCurrentPhoneNumber") {
      await ctx.deleteMessage();
      ctx.state.sessionMsg.url.searchParams.set("cursor", 6);
      await ctx.replyWithHTML("Нажмите кнопку Отправить свой номер" + ctx.state.sessionMsg.linkHTML(), {
        reply_markup: {
          keyboard: [
            [{
              text: "Отправить свой номер",
              request_contact: true,
            }],
            [{text: "Отмена"}],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
    }
    if (todo === "setPhoneNumber") {
      await ctx.deleteMessage();
      ctx.state.sessionMsg.url.searchParams.set("cursor", 6);
      await ctx.replyWithHTML("Введите номер телефона" + ctx.state.sessionMsg.linkHTML(), {
        reply_markup: {
          force_reply: true,
        },
      });
    }
    // set comment
    if (todo === "setComment") {
      await ctx.deleteMessage();
      ctx.state.sessionMsg.url.searchParams.set("cursor", 7);
      await ctx.replyWithHTML(ctx.i18n.txt.comment() + ctx.state.sessionMsg.linkHTML(), {
        reply_markup: {
          force_reply: true,
          input_field_placeholder: ctx.i18n.txt.comment(),
        },
      });
    }
    if (todo === "setNoComment") {
      await ctx.deleteMessage();
      await cartWizard[7](ctx);
    }
    // create order
    if (todo === "createOrder") {
      const preOrderData = ctx.state.sessionMsg.url.searchParams;
      const wizardData = {
        "objectId": preOrderData.get("oId"),
        "lastName": preOrderData.get("lastName"),
        "firstName": preOrderData.get("firstName"),
        "phoneNumber": preOrderData.get("phoneNumber"),
        "address": preOrderData.get("address"),
        "carrierId": + preOrderData.get("carrierId"),
        "paymentId": + preOrderData.get("paymentId"),
      };
      if (preOrderData.get("carrierNumber")) {
        wizardData["carrierNumber"] = + preOrderData.get("carrierNumber");
      }
      if (preOrderData.get("comment")) {
        wizardData["comment"] = preOrderData.get("comment");
      }
      try {
        await cart.createOrder(ctx, wizardData);
        await ctx.deleteMessage();
        await ctx.reply(`${ctx.i18n.txt.confirm()} /objects`, {
          reply_markup: {
            remove_keyboard: true,
          }});
      } catch (error) {
        // await ctx.reply(`${error}`);
        await ctx.answerCbQuery(`${error}`);
        return;
      }
    }
    if (todo === "cancelOrder") {
      await ctx.deleteMessage();
      await ctx.reply("Commands /objects /search", {
        reply_markup: {
          remove_keyboard: true,
        }});
    }
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});
// show tags
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "t") {
    const inlineKeyboardArray = [];
    const catalogId = ctx.state.param;
    const pathUrl = ctx.state.sessionMsg.url.searchParams.get("pathU");
    const objectId = ctx.state.sessionMsg.url.searchParams.get("oId");
    const object = await store.findRecord(`objects/${objectId}`);
    const catalog = await store.findRecord(`objects/${objectId}/catalogs/${pathUrl}`);
    let catalogUrl = `c/${catalogId}`;
    const sessionPathCatalog = ctx.state.sessionMsg.url.searchParams.get("pathC");
    if (sessionPathCatalog) {
      catalogUrl = sessionPathCatalog;
    }
    inlineKeyboardArray.push([{text: `⤴️ ${catalog.name}`,
      callback_data: catalogUrl}]);
    // get algolia tags
    const pathNames = catalog.pathArray.map((catalog) => catalog.name);
    const tags = await algoliaIndexProducts.search("", {
      hitsPerPage: 0,
      facets: ["subCategory"],
      facetFilters: [[`seller:${object.name}`], [`categories.lvl${pathNames.length - 1}:${pathNames.join(" > ")}`]],
    });
    const urlBtn = new URL(`${process.env.BOT_SITE}/o/${objectId}/c/${pathUrl.replace(/#/g, "/")}`);
    for (const [index, tag] of Object.entries(tags.facets.subCategory || {}).entries()) {
      // add session data encoded
      urlBtn.searchParams.append("sessionTag", encodeCyrillic(tag[0]));
      if (index == ctx.state.params.get("tS")) {
        inlineKeyboardArray.push([{text: `✅ ${tag[0]} (${tag[1]})`, callback_data: `c/${catalogId}?t=${index}`}]);
      } else {
        inlineKeyboardArray.push([{text: `🎚 ${tag[0]} (${tag[1]})`, callback_data: `c/${catalogId}?t=${index}`}]);
      }
    }
    inlineKeyboardArray.push([{text: catalog.name, url: urlBtn.href}]);
    let publicImgUrl = null;
    if (object.photoId) {
      publicImgUrl = `photos/o/${objectId}/logo/${object.photoId}/2.jpg`;
    }
    const media = await photoCheckUrl(publicImgUrl);
    await ctx.editMessageMedia({
      type: "photo",
      media,
      caption: `<b>${object.name} > ${ctx.i18n.btn.filter()}</b>` + ctx.state.sessionMsg.linkHTML(),
      parse_mode: "html",
    }, {reply_markup: {
      inline_keyboard: inlineKeyboardArray,
    }});
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});
// show photos
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "s") {
    const productId = ctx.state.param;
    // const pId = ctx.state.params.get("pId");
    const photoId = ctx.state.sessionMsg.url.searchParams.get("photoId");
    const todo = ctx.state.params.get("todo");
    const objectId = ctx.state.sessionMsg.url.searchParams.get("oId");
    // set main photo
    if (todo === "main") {
      await store.updateRecord(`objects/${objectId}/products/${productId}`, {
        mainPhoto: photoId,
      });
      await ctx.editMessageCaption(`Main photo updated ${productId}`+ ctx.state.sessionMsg.linkHTML(),
          {
            reply_markup: {
              inline_keyboard: [
                [{text: "🗑 Delete", callback_data: `s/${productId}?todo=delete`}],
                [{text: "❎ Закрыть", callback_data: `s/${productId}?todo=close`}],
              ],
            },
            parse_mode: "html",
          });
      return;
    }
    // close photo
    if (todo === "close") {
      await ctx.deleteMessage();
      return;
    }
    const productRef = firebase.firestore().collection("objects").doc(objectId)
        .collection("products").doc(productId);
    const productSnapshot = await productRef.get();
    // delete photo
    if (todo === "delete") {
      // if delete main Photo
      if (productSnapshot.data().mainPhoto === photoId) {
        // set new main photo index 1 or delete
        if (productSnapshot.data().photos && productSnapshot.data().photos.length > 1) {
          for (const photosId of productSnapshot.data().photos) {
            if (photosId !== photoId) {
              await productRef.update({
                mainPhoto: photosId,
                photos: firestore.FieldValue.arrayRemove(photoId),
              });
              break;
            }
          }
        } else {
          await productRef.update({
            mainPhoto: firestore.FieldValue.delete(),
            photos: firestore.FieldValue.arrayRemove(photoId),
          });
        }
      } else {
        await productRef.update({
          photos: firestore.FieldValue.arrayRemove(photoId),
        });
      }
      // delete photos from bucket
      await deletePhotoStorage(`photos/o/${objectId}/p/${productId}/${photoId}`);
      await ctx.deleteMessage();
      return;
    }
    const product = {id: productSnapshot.id, ...productSnapshot.data()};
    ctx.state.sessionMsg.url.searchParams.delete("photoId");
    for (const [index, photoId] of product.photos.entries()) {
      const inlineKeyboardArray = [];
      // if admin
      if (ctx.state.isAdmin) {
        ctx.state.sessionMsg.url.searchParams.set("photoId", photoId);
        if (product.mainPhoto !== photoId) {
          inlineKeyboardArray.push([{text: "🏷 Set main",
            callback_data: `s/${product.id}?todo=main`}]);
        }
        inlineKeyboardArray.push([{text: "🗑 Delete",
          callback_data: `s/${product.id}?todo=delete`}]);
      }
      inlineKeyboardArray.push([{text: "❎ Закрыть", callback_data: `s/${product.id}?todo=close`}]);
      let caption = `<b>Фото #${index + 1}</b> ${product.name} (${product.id})`;
      if (product.mainPhoto === photoId) {
        caption = "✅ " + caption;
      }
      const media = await photoCheckUrl(`photos/o/${objectId}/p/${product.id}/${photoId}/2.jpg`);
      await ctx.replyWithPhoto(media, {
        caption: caption + ctx.state.sessionMsg.linkHTML(),
        parse_mode: "html",
        reply_markup: {
          inline_keyboard: inlineKeyboardArray,
        },
      });
    }
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});
// upload photos
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "u") {
    const objectId = ctx.state.sessionMsg.url.searchParams.get("oId");
    const pathUrl = ctx.state.sessionMsg.url.searchParams.get("pathU");
    const todo = ctx.state.params.get("todo");
    ctx.state.sessionMsg.url.searchParams.set("scene", `upload-${todo}`);
    const paramId = ctx.state.param;
    let caption;
    if (todo === "prod") {
      ctx.state.sessionMsg.url.searchParams.set("upload-productId", paramId);
      caption = `Добавьте фото <b>${paramId}</b>`;
    }
    if (todo === "cat") {
      ctx.state.sessionMsg.url.searchParams.set("upload-catalogId", pathUrl);
      // const catalog = await store.findRecord(`objects/${objectId}/catalogs/${pathUrl}`);
      caption = `Добавьте фото <b>${pathUrl}</b>`;
    }
    if (todo === "obj") {
      // const object = await store.findRecord(`objects/${paramId}`);
      caption = `Добавьте фото <b>${objectId}</b>`;
    }
    if (todo === "desc") {
      ctx.state.sessionMsg.url.searchParams.set("upload-catalogId", pathUrl);
      caption = `Добавьте описание, del удалить<b>${pathUrl}</b>`;
    }
    if (todo === "postId") {
      ctx.state.sessionMsg.url.searchParams.set("upload-catalogId", pathUrl);
      caption = `Добавьте postId, del удалить<b>${pathUrl}</b>`;
    }
    await ctx.replyWithHTML(caption + ctx.state.sessionMsg.linkHTML(), {
      reply_markup: {
        force_reply: true,
      }});
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});
// change product data
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "b") {
    ctx.state.sessionMsg.url.searchParams.set("TTL", 1);
    const objectId = ctx.state.sessionMsg.url.searchParams.get("oId");
    const productName = encodeCyrillic(ctx.state.sessionMsg.url.searchParams.get("pName"), true);
    const price = ctx.state.sessionMsg.url.searchParams.get("ePrice");
    const purchasePrice = ctx.state.sessionMsg.url.searchParams.get("ePurchase");
    const productCurrency = ctx.state.sessionMsg.url.searchParams.get("eCurrency");
    ctx.state.sessionMsg.url.searchParams.set("scene", "changeProduct");
    const todo = ctx.state.params.get("todo");
    ctx.state.sessionMsg.url.searchParams.set("cTodo", todo);
    const column = ctx.state.params.get("c");
    ctx.state.sessionMsg.url.searchParams.set("cColumn", column);
    const productId = ctx.state.param;
    ctx.state.sessionMsg.url.searchParams.set("cPId", productId);
    if (todo === "del") {
      // first exit from product
      const sessionPathCatalog = ctx.state.sessionMsg.url.searchParams.get("pathC");
      parseUrl(ctx, sessionPathCatalog ? sessionPathCatalog : "c");
      await showCatalog(ctx);
      await ctx.replyWithHTML(`<b>${productId}</b>\n` +
      `Введите <b>${todo}</b> для подтверждения удаления` + ctx.state.sessionMsg.linkHTML(), {
        reply_markup: {
          force_reply: true,
        }});
    } else {
      await ctx.replyWithHTML(`${productName} (${productId})\nИзменить поле <b>${todo}</b>\n` +
      `<b>${objectId}</b>\n` +
      `Закупочная цена (purchasePrice) <b>${purchasePrice.toLocaleString("ru-RU")} ${productCurrency}</b>\n` +
      `Продажная цена (price) <b>${price.toLocaleString("ru-RU")} ${productCurrency}</b>\nДля удаления desc введите del\nДля удаления postId введите 0` + ctx.state.sessionMsg.linkHTML(), {
        reply_markup: {
          force_reply: true,
          input_field_placeholder: todo,
        }});
    }
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// change cart product price
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "x") {
    ctx.state.sessionMsg.url.searchParams.set("TTL", 0);
    const objectId = ctx.state.sessionMsg.url.searchParams.get("oId");
    const id = ctx.state.param;
    const price = + ctx.state.params.get("qty") || 0;
    const name = encodeCyrillic(ctx.state.sessionMsg.url.searchParams.get("pName"), true);
    const redirectToCart = ctx.state.sessionMsg.url.searchParams.get("cart");
    const page = ctx.state.sessionMsg.url.searchParams.get("page");
    if (price) {
      await cart.update({
        objectId,
        userId: ctx.from.id,
        product: {
          [id]: {
            price,
          },
        },
      });
      await ctx.answerCbQuery(`${name} (${id}) New price set ${price}`);
    } else {
      await ctx.answerCbQuery("price > 0");
      return;
    }
    if (page) {
      parseUrl(ctx, `search/${page}`);
      await searchProductHandle(ctx);
      return;
    }
    if (redirectToCart) {
      parseUrl(ctx, "cart");
      await showCart(ctx);
    } else {
      const sessionPathCatalog = ctx.state.sessionMsg.url.searchParams.get("pathC");
      parseUrl(ctx, sessionPathCatalog ? sessionPathCatalog : "c");
      await showCatalog(ctx);
    }
  } else {
    return next();
  }
});

exports.catalogsActions = catalogsActions;
exports.cartWizard = cartWizard;
exports.showCart = showCart;
