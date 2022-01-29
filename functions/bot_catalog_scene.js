const functions = require("firebase-functions");
const firebase = require("firebase-admin");
const {download} = require("./download.js");
const fs = require("fs");
const {roundNumber, photoCheckUrl} = require("./bot_start_scene");
const bucket = firebase.storage().bucket();
const {cart, store} = require("./bot_store_cart.js");
const botConfig = functions.config().env.bot;
// catalogs actions array
const catalogsActions = [];
// show catalogs and goods
const showCatalog = async (ctx, next) => {
  if (ctx.state.routeName === "c") {
    const objectId = ctx.state.params.get("o");
    const cartButtons = await cart.cartButtons(objectId, ctx.from.id);
    const catalogId = ctx.state.param;
    const tag = ctx.state.params.get("t");
    const startAfter = ctx.state.params.get("s");
    const endBefore = ctx.state.params.get("e");
    const uploadPhotoCat = ctx.state.params.get("u");
    let publicImgUrl = null;
    const object = await store.findRecord(`objects/${objectId}`);
    if (object.logo) {
      publicImgUrl = `photos/${objectId}/logo/2/${object.logo}.jpg`;
    }
    // and show upload catalog photo
    let uUrl = "";
    if (uploadPhotoCat) {
      uUrl += "&u=1";
    }
    const inlineKeyboardArray =[];
    ctx.session.pathCatalog = ctx.callbackQuery.data;
    if (catalogId) {
      const currentCatalog = await store.findRecord(`objects/${objectId}/catalogs/${catalogId}`);
      // back button
      inlineKeyboardArray.push([{text: `⤴️ ../${currentCatalog.name}`,
        callback_data: currentCatalog.parentId ? `c/${currentCatalog.parentId}?o=${objectId}${uUrl}` :
        `c?o=${objectId}${uUrl}`}]);
      if (ctx.state.isAdmin && uploadPhotoCat) {
        inlineKeyboardArray.push([{text: `📸 Загрузить фото каталога ${currentCatalog.name}`,
          callback_data: `uploadPhotoCat/${currentCatalog.id}?o=${objectId}`}]);
      }
      // products query
      let mainQuery = firebase.firestore().collection("objects").doc(objectId)
          .collection("products").where("catalog.id", "==", currentCatalog.id)
          .orderBy("orderNumber");
      // Filter by tag
      let tagUrl = "";
      if (tag) {
        mainQuery = mainQuery.where("tags", "array-contains", tag);
        tagUrl = `&t=${tag}`;
      }
      // add tags button
      if (currentCatalog.tags) {
        const tagsArray = [];
        tagsArray.push({text: "📌 Фильтр",
          callback_data: `t/${currentCatalog.id}?o=${objectId}`});
        // Delete or close selected tag
        if (tag) {
          tagsArray[0].callback_data = `t/${currentCatalog.id}?tagSelected=${tag}&o=${objectId}`;
          tagsArray.push({text: `❎ ${tag}`, callback_data: `c/${currentCatalog.id}?o=${objectId}`});
        }
        inlineKeyboardArray.push(tagsArray);
      }
      // paginate goods, copy main query
      let query = mainQuery;
      if (startAfter) {
        const startAfterProduct = await firebase.firestore().collection("objects").doc(objectId)
            .collection("products")
            .doc(startAfter).get();
        query = query.startAfter(startAfterProduct);
      }
      // prev button
      if (endBefore) {
        const endBeforeProduct = await firebase.firestore().collection("objects").doc(objectId)
            .collection("products")
            .doc(endBefore).get();
        query = query.endBefore(endBeforeProduct).limitToLast(10);
      } else {
        query = query.limit(10);
      }
      // get products
      const productsSnapshot = await query.get();
      // get cart product
      const cartProductsArray = await store.findRecord(`objects/${objectId}/carts/${ctx.from.id}`, "products");
      // generate products array
      for (const product of productsSnapshot.docs) {
        const addButton = {text: `📦 ${roundNumber(product.data().price * object[product.data().currency])}` +
        `${botConfig.currency} ${product.data().name} (${product.id})`,
        callback_data: `aC/${product.id}?o=${objectId}`};
        // get cart products
        const cartProduct = cartProductsArray && cartProductsArray[product.id];
        if (cartProduct) {
          addButton.text = `🛒${cartProduct.qty}${cartProduct.unit} ` +
          `${roundNumber(cartProduct.price * cartProduct.qty)} ` +
          `${botConfig.currency} ${product.data().name} (${product.id})`;
          addButton.callback_data = `aC/${product.id}?qty=${cartProduct.qty}&a=1&o=${objectId}`;
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
          prevNext.push({text: "⬅️ Назад",
            callback_data: `c/${currentCatalog.id}?e=${endBeforeSnap.id}${tagUrl}&o=${objectId}`});
        }
        // startAfter
        const startAfterSnap = productsSnapshot.docs[productsSnapshot.docs.length - 1];
        const ifAfterProducts = await mainQuery.startAfter(startAfterSnap).limit(1).get();
        if (!ifAfterProducts.empty) {
          prevNext.push({text: "➡️ Вперед",
            callback_data: `c/${currentCatalog.id}?s=${startAfterSnap.id}${tagUrl}&o=${objectId}`});
        }
        inlineKeyboardArray.push(prevNext);
      }
      // get photo catalog
      if (currentCatalog.photo) {
        publicImgUrl = `photos/${objectId}/catalogs/${currentCatalog.id}/2/${currentCatalog.photo}.jpg`;
      }
    }
    // show catalog siblings, get catalogs snap index or siblings
    const catalogsSnapshot = await firebase.firestore().collection("objects").doc(objectId)
        .collection("catalogs")
        .where("parentId", "==", catalogId ? catalogId : null).orderBy("orderNumber").get();
    catalogsSnapshot.docs.forEach((doc) => {
      inlineKeyboardArray.push([{text: `🗂 ${doc.data().name}`, callback_data: `c/${doc.id}?o=${objectId}${uUrl}`}]);
    });
    cartButtons[0].text = `🏪 ${object.name}`;
    inlineKeyboardArray.push(cartButtons);
    // render
    const media = await photoCheckUrl(publicImgUrl);
    await ctx.editMessageMedia({
      type: "photo",
      media: media,
      caption: `<b>${object.name} > Каталог</b>\n` +
        `Поделиться 🔗: t.me/${ctx.state.bot_username}?start=OBJECT${objectId}CATALOG${catalogId ? catalogId : "c"}`,
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
    // get product data
    const productId = ctx.state.param;
    const objectId = ctx.state.params.get("o");
    const object = await store.findRecord(`objects/${objectId}`);
    const product = await store.findRecord(`objects/${objectId}/products/${productId}`);
    product.price = roundNumber(product.price * object[product.currency]);
    const cartButtons = await cart.cartButtons(objectId, ctx.from.id);
    let catalogUrl = `c/${product.catalog.id}?o=${objectId}`;
    if (ctx.session.pathCatalog) {
      catalogUrl = ctx.session.pathCatalog;
    }
    const inlineKeyboardArray = [];
    inlineKeyboardArray.push([{text: `⤴️ ../${product.catalog.name}`, callback_data: catalogUrl}]);
    // default add button
    const addButton = {text: "🛒 Добавить в корзину", callback_data: `aC/${product.id}?o=${objectId}`};
    // get cart products
    const cartProduct = await store.findRecord(`objects/${objectId}/carts/${ctx.from.id}`,
        `products.${productId}`);
    if (cartProduct) {
      addButton.text = `🛒 ${cartProduct.qty} ${cartProduct.unit} ` +
      ` ${roundNumber(cartProduct.qty * cartProduct.price)} ${botConfig.currency}`;
      addButton.callback_data = `aC/${product.id}?qty=${cartProduct.qty}&a=1&o=${objectId}`;
    }
    inlineKeyboardArray.push([addButton]);
    if (ctx.state.isAdmin) {
      inlineKeyboardArray.push([{text: "📸 Загрузить фото",
        callback_data: `uploadPhotoProduct/${product.id}?o=${objectId}`}]);
    }
    // chck photos
    if (product.photos && product.photos.length) {
      inlineKeyboardArray.push([{text: `🖼 Показать фото (${product.photos.length})`,
        callback_data: `showPhotos/${product.id}?o=${objectId}`}]);
    }
    // Get main photo url.
    let publicImgUrl = null;
    if (object.logo) {
      publicImgUrl = `photos/${objectId}/logo/2/${object.logo}.jpg`;
    }
    if (product.mainPhoto) {
      publicImgUrl = `photos/${objectId}/products/${product.id}/2/${product.mainPhoto}.jpg`;
    }
    // footer buttons
    cartButtons[0].text = `🏪 ${object.name}`;
    inlineKeyboardArray.push(cartButtons);
    const media = await photoCheckUrl(publicImgUrl);
    await ctx.editMessageMedia({
      type: "photo",
      media,
      caption: `<b>${object.name}\n` +
      `${product.name} (${product.id})\n` +
      `Цена ${product.price} ${botConfig.currency}</b>\n` +
      `Поделиться 🔗: t.me/${ctx.state.bot_username}?start=OBJECT${objectId}PRODUCT${productId}`,
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
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "aC") {
    let qty = ctx.state.params.get("qty");
    const number = ctx.state.params.get("number");
    const back = ctx.state.params.get("back");
    const redirectToCart = ctx.state.params.get("r");
    const added = ctx.state.params.get("a");
    const productId = ctx.state.param;
    const addValue = ctx.state.params.get("addVal");
    const objectId = ctx.state.params.get("o");
    let qtyUrl = "";
    let paramsUrl = "";
    if (qty) {
      if (number) {
        qty += number;
      }
      if (back) {
        qty = qty.slice(0, -1);
      }
    } else {
      // add first
      if (Number(number)) {
        qty = number;
      } else {
        // generate response
        const dateTimestamp = Math.floor(Date.now() / 1000);
        paramsUrl += `&${dateTimestamp}`;
      }
    }
    if (qty) {
      qtyUrl = `&qty=${qty}`;
    } else {
      qty = 0;
    }
    // add redirect param and clear path
    if (redirectToCart) {
      paramsUrl += "&r=1";
      ctx.session.pathCatalog = null;
    }
    if (added) {
      paramsUrl += "&a=1";
    }
    const object = await store.findRecord(`objects/${objectId}`);
    const product = await store.findRecord(`objects/${objectId}/products/${productId}`);
    product.price = roundNumber(product.price * object[product.currency]);
    if (product) {
      let catalogUrl = `c/${product.catalog.id}?o=${objectId}`;
      if (ctx.session.pathCatalog) {
        catalogUrl = ctx.session.pathCatalog;
      }
      // add product to cart
      if (addValue) {
        await cart.add(objectId, ctx.from.id, added ? product.id : product, addValue);
        if (!redirectToCart) {
          ctx.state.routeName = "c";
          // eslint-disable-next-line no-useless-escape
          const regPath = catalogUrl.match(/^([a-zA-Z0-9-_]+)\/?([a-zA-Z0-9-_]+)?\??([a-zA-Z0-9-_=&\/:~+]+)?/);
          ctx.state.param = regPath[2];
          const args = regPath[3];
          ctx.state.params.clear();
          if (args) {
            for (const paramsData of args.split("&")) {
              ctx.state.params.set(paramsData.split("=")[0], paramsData.split("=")[1]);
            }
          }
          ctx.callbackQuery.data = catalogUrl;
          await showCatalog(ctx, next);
        } else {
          ctx.state.routeName = "cart";
          await showCart(ctx, next);
        }
        return;
      }
      const addButtonArray = [];
      const addButton = {text: "🛒 Добавить",
        callback_data: `aC/${product.id}?addVal=${qty}${paramsUrl}&o=${objectId}`};
      const delButton = {text: "❎ Удалить",
        callback_data: `aC/${product.id}?addVal=0${paramsUrl}&o=${objectId}`};
      if (added) {
        addButtonArray.push(delButton);
      }
      addButtonArray.push(addButton);
      // get main photo url.
      let publicImgUrl = null;
      if (object.logo) {
        publicImgUrl = `photos/${objectId}/logo/2/${object.logo}.jpg`;
      }
      if (product.mainPhoto) {
        publicImgUrl = `photos/${objectId}/products/${product.id}/2/${product.mainPhoto}.jpg`;
      }
      const uploadPhotoButton =[];
      if (ctx.state.isAdmin) {
        uploadPhotoButton.push({text: "📸 Загрузить фото",
          callback_data: `uploadPhotoProduct/${product.id}?o=${objectId}`});
        uploadPhotoButton.push({text: "Загрузить в Merch",
          callback_data: `uploadMerch/${product.id}?o=${objectId}`});
      }
      const media = await photoCheckUrl(publicImgUrl);
      await ctx.editMessageMedia({
        type: "photo",
        media,
        caption: `${product.name} (${product.id})` +
        `\nЦена ${product.price} ${botConfig.currency}` +
        `\nСумма ${roundNumber(qty * product.price)} ${botConfig.currency}` +
        `\n<b>Количетво: ${qty} ${product.unit}</b>`,
        parse_mode: "html",
      }, {reply_markup: {
        inline_keyboard: [
          [{text: `⤴️ ../${product.catalog.name}`, callback_data: catalogUrl}],
          [
            {text: "7", callback_data: `aC/${product.id}?number=7${qtyUrl}${paramsUrl}&o=${objectId}`},
            {text: "8", callback_data: `aC/${product.id}?number=8${qtyUrl}${paramsUrl}&o=${objectId}`},
            {text: "9", callback_data: `aC/${product.id}?number=9${qtyUrl}${paramsUrl}&o=${objectId}`},
          ],
          [
            {text: "4", callback_data: `aC/${product.id}?number=4${qtyUrl}${paramsUrl}&o=${objectId}`},
            {text: "5", callback_data: `aC/${product.id}?number=5${qtyUrl}${paramsUrl}&o=${objectId}`},
            {text: "6", callback_data: `aC/${product.id}?number=6${qtyUrl}${paramsUrl}&o=${objectId}`},
          ],
          [
            {text: "1", callback_data: `aC/${product.id}?number=1${qtyUrl}${paramsUrl}&o=${objectId}`},
            {text: "2", callback_data: `aC/${product.id}?number=2${qtyUrl}${paramsUrl}&o=${objectId}`},
            {text: "3", callback_data: `aC/${product.id}?number=3${qtyUrl}${paramsUrl}&o=${objectId}`},
          ],
          [
            {text: "0️", callback_data: `aC/${product.id}?number=0${qtyUrl}${paramsUrl}&o=${objectId}`},
            {text: "🔙", callback_data: `aC/${product.id}?back=1${qtyUrl}${paramsUrl}&o=${objectId}`},
            {text: "AC", callback_data: `aC/${product.id}?clear=1${paramsUrl}&o=${objectId}`},
          ],
          addButtonArray,
          uploadPhotoButton,
          [
            {text: `⤴️ ${product.name} (${product.id})`, callback_data: `p/${product.id}?o=${objectId}`},
          ],
        ],
      }});
    }
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

// show cart
const showCart = async (ctx, next) => {
  if (ctx.state.routeName === "cart") {
    const clear = ctx.state.params.get("clear");
    const deleteOrderId = ctx.state.params.get("deleteOrderId");
    const objectId = ctx.state.params.get("o");
    if (deleteOrderId) {
      await store.createRecord(`users/${ctx.from.id}`, {"session": {
        "orderData": null,
      }});
    }
    // clear cart
    if (clear) {
      await cart.clear(objectId, ctx.from.id);
    }
    const inlineKeyboardArray = [];
    const object = await store.findRecord(`objects/${objectId}`);
    let msgTxt = `<b>${object.name} > Корзина</b>\n`;
    let totalQty = 0;
    let totalSum = 0;
    let itemShow = 0;
    const products = await cart.products(objectId, ctx.from.id);
    for (const [index, cartProduct] of products.entries()) {
      // check cart products price exist...
      const product = await store.findRecord(`objects/${objectId}/products/${cartProduct.id}`);
      product.price = roundNumber(product.price * object[product.currency]);
      if (product) {
        const productTxt = `${index + 1}) <b>${product.name}</b> (${product.id})` +
        `=${product.price} ${botConfig.currency}*${cartProduct.qty}${product.unit}` +
        `=${roundNumber(product.price * cartProduct.qty)}${botConfig.currency}`;
        // truncate long string
        if ((msgTxt + `${productTxt}\n`).length < 1024) {
          msgTxt += `${productTxt}\n`;
          itemShow++;
          // msgTxt = msgTxt.substring(0, 1024);
        }
        inlineKeyboardArray.push([
          {text: `${index + 1}) ${cartProduct.qty}${product.unit}=` +
          `${roundNumber(cartProduct.qty * product.price)} ${botConfig.currency} ` +
          `${product.name} (${product.id})`,
          callback_data: `aC/${product.id}?qty=${cartProduct.qty}&r=1&a=1&o=${objectId}`},
        ]);
        // update price in cart
        if (product.price !== cartProduct.price) {
          // products this is name field!!!
          const products = {
            [product.id]: {
              price: product.price,
            },
          };
          await store.createRecord(`objects/${objectId}/carts/${ctx.from.id}`, {products});
        }
        totalQty += cartProduct.qty;
        totalSum += cartProduct.qty * product.price;
      }
    }
    if (itemShow !== inlineKeyboardArray.length) {
      msgTxt += "...\n";
    }
    if (totalQty) {
      msgTxt += `<b>Количество товара: ${totalQty}\n` +
      `Сумма: ${roundNumber(totalSum)} ${botConfig.currency}</b>`;
    }

    if (inlineKeyboardArray.length < 1) {
      inlineKeyboardArray.push([
        {text: "📁 Каталог", callback_data: `c?o=${objectId}`},
      ]);
      msgTxt += "Корзина пуста";
    } else {
      const orderData = await store.findRecord(`users/${ctx.from.id}`, "session.orderData");
      if (orderData) {
        const orderId = orderData.orderNumber;
        inlineKeyboardArray.push([{text: `✅ Сохранить Заказ #${orderId} от ${orderData.lastName} ` +
        `${orderData.firstName}`, callback_data: `eO/${orderData.id}?sP=1&o=${objectId}`}]);
        // delete order from cart
        inlineKeyboardArray.push([{text: `❎ Убрать Заказ #${orderId} от ${orderData.lastName} ` +
        `${orderData.firstName}`, callback_data: `cart?deleteOrderId=${orderData.id}&o=${objectId}`}]);
      }
      // create order
      inlineKeyboardArray.push([{text: "✅ Оформить заказ",
        callback_data: `cO/payment?o=${objectId}`}]);
      // clear cart
      inlineKeyboardArray.push([{text: "🗑 Очистить корзину",
        callback_data: `cart?clear=1&o=${objectId}`}]);
    }
    // Set Main menu
    inlineKeyboardArray.push([{text: `🏪 ${object.name}`,
      callback_data: `objects/${objectId}`}]);
    // edit message
    let publicImgUrl = null;
    if (object.logo) {
      publicImgUrl = `photos/${objectId}/logo/2/${object.logo}.jpg`;
    }
    const media = await photoCheckUrl(publicImgUrl);
    await ctx.editMessageMedia({
      type: "photo",
      media,
      caption: msgTxt,
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
  // show carrier services
  async (ctx, caption, inlineKeyboardArray = []) => {
    await ctx.editMessageCaption(`<b>${caption}:</b>`,
        {
          parse_mode: "html",
          reply_markup: {
            inline_keyboard: inlineKeyboardArray,
          },
        });
  },
  async (ctx, error) => {
    const inlineKeyboardArray = [];
    let qty = ctx.state.params.get("q");
    const number = ctx.state.params.get("n");
    const back = ctx.state.params.get("b");
    const carrierId = ctx.state.params.get("cId");
    const orderId = ctx.state.params.get("oId");
    const objectId = ctx.state.params.get("o");
    let qtyUrl = "";
    if (qty) {
      if (number) {
        qty += number;
      }
      if (back) {
        qty = qty.slice(0, -1);
      }
    } else {
      // add first
      if (Number(number)) {
        qty = number;
      }
    }
    if (qty) {
      qtyUrl = `&q=${qty}`;
    } else {
      qty = 0;
    }
    // add carrier ID
    if (carrierId) {
      qtyUrl += `&cId=${carrierId}`;
    }
    // add orderId to url
    let paramsUrl = "";
    if (orderId) {
      paramsUrl = `&oId=${orderId}&o=${objectId}`;
    }
    // add rnd param to fast load
    let rnd = "";
    if (error || !Number(number)) {
      rnd = Math.random().toFixed(2).substring(2);
    }
    inlineKeyboardArray.push([
      {text: "7", callback_data: `cO/cN?n=7${qtyUrl}${paramsUrl}`},
      {text: "8", callback_data: `cO/cN?n=8${qtyUrl}${paramsUrl}`},
      {text: "9", callback_data: `cO/cN?n=9${qtyUrl}${paramsUrl}`},
    ]);
    inlineKeyboardArray.push([
      {text: "4", callback_data: `cO/cN?n=4${qtyUrl}${paramsUrl}`},
      {text: "5", callback_data: `cO/cN?n=5${qtyUrl}${paramsUrl}`},
      {text: "6", callback_data: `cO/cN?n=6${qtyUrl}${paramsUrl}`},
    ]);
    inlineKeyboardArray.push([
      {text: "1", callback_data: `cO/cN?n=1${qtyUrl}${paramsUrl}`},
      {text: "2", callback_data: `cO/cN?n=2${qtyUrl}${paramsUrl}`},
      {text: "3", callback_data: `cO/cN?n=3${qtyUrl}${paramsUrl}`},
    ]);
    inlineKeyboardArray.push([
      {text: "0️", callback_data: `cO/cN?n=0${qtyUrl}${paramsUrl}`},
      {text: "🔙", callback_data: `cO/cN?b=1${qtyUrl}${paramsUrl}`},
      {text: "AC", callback_data: `cO/cN?cId=${carrierId}${paramsUrl}`},
    ]);
    // if order change callback
    if (orderId) {
      inlineKeyboardArray.push([{text: "Выбрать отделение", callback_data: `eO/${orderId}?` +
      `sCid=${carrierId}&n=${qty}&o=${objectId}&${rnd}`}]);
      inlineKeyboardArray.push([{text: "⬅️ Назад",
        callback_data: `orders/${orderId}?o=${objectId}`}]);
    } else {
      inlineKeyboardArray.push([{text: "Выбрать отделение", callback_data: `cO/wizard?cN=${qty}` +
      `&cId=${carrierId}&${rnd}`}]);
    }
    await ctx.editMessageCaption(`Введите номер отделения:\n<b>${qty}</b>` +
      `\n${error ? "Ошибка: введите номер отделения" : ""}`,
    {
      parse_mode: "html",
      reply_markup: {
        inline_keyboard: inlineKeyboardArray,
      },
    });
  },
  async (ctx) => {
    await ctx.reply("Укажите адрес доставки (город)", {
      reply_markup: {
        keyboard: [["Отмена"]],
        resize_keyboard: true,
      }});
    await store.createRecord(`users/${ctx.from.id}`, {"session": {"scene": "wizardOrder", "cursor": 3}});
  },
  async (ctx) => {
    if (ctx.message.text.length < 2) {
      await ctx.reply("Адрес слишком короткий");
      return;
    }
    const address = ctx.message.text;
    await store.createRecord(`users/${ctx.from.id}`, {"session": {"wizardData": {address}}});
    // reply last name alert
    const lastName = ctx.from.last_name ? ctx.from.last_name : null;
    const keyboard = lastName ? [[lastName], ["Отмена"]] : [["Отмена"]];
    await ctx.reply(`Введите фамилию получателя ${lastName ? "или выберите свою" : ""}`, {
      reply_markup: {
        keyboard,
        resize_keyboard: true,
      }});
    await store.createRecord(`users/${ctx.from.id}`, {"session": {"cursor": 4}});
  },
  async (ctx) => {
    if (ctx.message.text.length < 2) {
      await ctx.reply("Фамилия слишком короткая");
      return;
    }
    const lastName = ctx.message.text;
    await store.createRecord(`users/${ctx.from.id}`, {"session": {"wizardData": {lastName}}});
    // reply first name
    const firstName = ctx.from.first_name;
    const keyboard = [[firstName], ["Отмена"]];
    await ctx.reply("Введите имя получателя или выберите свое", {
      reply_markup: {
        keyboard,
        resize_keyboard: true,
      }});
    await store.createRecord(`users/${ctx.from.id}`, {"session": {"cursor": 5}});
  },
  async (ctx) => {
    if (ctx.message.text.length < 2) {
      await ctx.reply("Имя слишком короткое");
      return;
    }
    const firstName = ctx.message.text;
    await store.createRecord(`users/${ctx.from.id}`, {"session": {"wizardData": {firstName}}});
    await ctx.reply("Введите номер телефона", {
      reply_markup: {
        keyboard: [
          [{
            text: "Отправить свой номер",
            request_contact: true,
          }],
          ["Отмена"],
        ],
        resize_keyboard: true,
      },
    });
    await store.createRecord(`users/${ctx.from.id}`, {"session": {"cursor": 6}});
  },
  async (ctx) => {
    const phoneNumberText = (ctx.message.contact && ctx.message.contact.phone_number) || ctx.message.text;
    const regexpPhoneRu = new RegExp(botConfig.phoneregexp);
    const checkPhone = phoneNumberText.match(regexpPhoneRu);
    if (!checkPhone) {
      await ctx.reply(`Введите номер телефона в формате ${botConfig.phonetemplate}`);
      return;
    }
    const phoneNumber = `${botConfig.phonecode}${checkPhone[2]}`;
    await store.createRecord(`users/${ctx.from.id}`, {"session": {"wizardData": {phoneNumber}}});
    await ctx.replyWithHTML("Комментарий к заказу:",
        {
          reply_markup: {
            keyboard: [
              ["Без комментариев"],
              ["Отмена"],
            ],
            resize_keyboard: true,
          }});
    await store.createRecord(`users/${ctx.from.id}`, {"session": {"cursor": 7}});
  },
  async (ctx) => {
    if (ctx.message.text && ctx.message.text !== "Без комментариев") {
      const comment = ctx.message.text;
      await store.createRecord(`users/${ctx.from.id}`, {"session": {"wizardData": {comment}}});
    }
    // get preorder data
    const preOrderData = await store.findRecord(`users/${ctx.from.id}`, "session.wizardData");
    await ctx.replyWithHTML("<b>Проверьте даные получателя:\n" +
        `${preOrderData.lastName} ${preOrderData.firstName} ${preOrderData.phoneNumber}\n` +
        `Адрес доставки: ${preOrderData.address}, ` +
        `${store.carriers().get(preOrderData.carrierId).name} ` +
        `${preOrderData.carrierNumber ? "#" + preOrderData.carrierNumber : ""}\n` +
        `Оплата: ${store.payments().get(preOrderData.paymentId)}\n` +
        `${preOrderData.comment ? "Комментарий: " + preOrderData.comment : ""}</b>`,
    {
      reply_markup: {
        keyboard: [
          ["Оформить заказ"],
          ["Отмена"],
        ],
        resize_keyboard: true,
      }});
    await store.createRecord(`users/${ctx.from.id}`, {"session": {"cursor": 8}});
  },
  async (ctx, next) => {
    if (ctx.message.text === "Оформить заказ") {
      // save order
      await cart.createOrder(ctx);
      await ctx.reply("Спасибо за заказ! Скоро мы с Вами свяжемся. /objects", {
        reply_markup: {
          remove_keyboard: true,
        }});
      // exit scene
      await store.createRecord(`users/${ctx.from.id}`, {"session": {"scene": null}});
    }
  },
];
// save order final
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "cO") {
    const todo = ctx.state.param;
    // first step carrier
    if (todo === "carrier") {
      // save payment and clear old data use updateRecord
      const paymentId = + ctx.state.params.get("payment_id");
      const objectId = ctx.state.params.get("o");
      // clear and set data use update
      await store.updateRecord(`users/${ctx.from.id}`, {"session.wizardData": {paymentId}});
      const inlineKeyboardArray = [];
      store.carriers().forEach((obj, key) => {
        if (obj.reqNumber) {
          inlineKeyboardArray.push([{text: obj.name, callback_data: `cO/cN?cId=${key}`}]);
        } else {
          inlineKeyboardArray.push([{text: obj.name, callback_data: `cO/wizard?cId=${key}`}]);
        }
      });
      inlineKeyboardArray.push([{text: "🛒 Корзина", callback_data: `cart?o=${objectId}`}]);
      await cartWizard[0](ctx, "Способ доставки", inlineKeyboardArray);
    }
    // set carrier number
    if (todo === "cN") {
      await cartWizard[1](ctx);
    }
    // order payment method
    if (todo === "payment") {
      const objectId = ctx.state.params.get("o");
      await store.createRecord(`users/${ctx.from.id}`, {session: {objectId}});
      // show paymets service
      const inlineKeyboardArray = [];
      store.payments().forEach((value, key) => {
        inlineKeyboardArray.push([{text: value, callback_data: `cO/carrier?payment_id=${key}&o=${objectId}`}]);
      });
      inlineKeyboardArray.push([{text: "🛒 Корзина", callback_data: `cart?o=${objectId}`}]);
      await cartWizard[0](ctx, "Способ оплаты", inlineKeyboardArray);
    }
    // save payment and goto wizard
    if (todo === "wizard") {
      const carrierId = + ctx.state.params.get("cId");
      await store.createRecord(`users/${ctx.from.id}`, {"session": {"wizardData": {carrierId}}});
      // if user not chuse carrier number
      const carrierNumber = + ctx.state.params.get("cN");
      if (carrierId === 2 && !carrierNumber) {
        // return first step error
        await cartWizard[1](ctx, "errorCurrierNumber");
        return;
      }
      // save carrierNumber
      if (carrierNumber) {
        await store.createRecord(`users/${ctx.from.id}`, {"session": {"wizardData": {carrierNumber}}});
      }
      await ctx.deleteMessage();
      cartWizard[2](ctx);
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
    const objectId = ctx.state.params.get("o");
    const catalog = await store.findRecord(`objects/${objectId}/catalogs/${catalogId}`);
    let catalogUrl = `c/${catalog.id}?o=${objectId}`;
    if (ctx.session.pathCatalog) {
      catalogUrl = ctx.session.pathCatalog;
    }
    inlineKeyboardArray.push([{text: `⤴️ ../${catalog.name}`,
      callback_data: catalogUrl}]);
    for (const tag of catalog.tags) {
      if (tag.id === ctx.state.params.get("tagSelected")) {
        inlineKeyboardArray.push([{text: `✅ ${tag.name}`, callback_data: `c/${catalog.id}?t=${tag.id}&o=${objectId}`}]);
      } else {
        inlineKeyboardArray.push([{text: `📌 ${tag.name}`, callback_data: `c/${catalog.id}?t=${tag.id}&o=${objectId}`}]);
      }
    }
    const object = await store.findRecord(`objects/${objectId}`);
    let publicImgUrl = null;
    if (object.logo) {
      publicImgUrl = `photos/${objectId}/logo/2/${object.logo}.jpg`;
    }
    const media = await photoCheckUrl(publicImgUrl);
    await ctx.editMessageMedia({
      type: "photo",
      media,
      caption: `<b>${object.name} > Фильтр</b>`,
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
  if (ctx.state.routeName === "showPhotos") {
    const productId = ctx.state.param;
    const objectId = ctx.state.params.get("o");
    const productRef = firebase.firestore().collection("objects").doc(objectId)
        .collection("products").doc(productId);
    const productSnapshot = await productRef.get();
    const product = {id: productSnapshot.id, ...productSnapshot.data()};
    let index = 0;
    for (const photoId of Object.keys(product.photos)) {
      const inlineKeyboardArray = [];
      // if admin
      if (ctx.state.isAdmin) {
        inlineKeyboardArray.push([{text: "🏷 Set main",
          callback_data: `sMPh/${product.id}?pId=${photoId}&o=${objectId}`}]);
        inlineKeyboardArray.push([{text: "🗑 Delete",
          callback_data: `dPh/${product.id}?pId=${photoId}&o=${objectId}`}]);
      }
      inlineKeyboardArray.push([{text: "❎ Закрыть", callback_data: "closePhoto"}]);
      let caption = `<b>Фото #${++index}</b> ${product.name} (${product.id})`;
      if (product.mainPhoto === photoId) {
        caption = "✅ " + caption;
      }
      const media = await photoCheckUrl(`photos/${objectId}/products/${product.id}/2/${photoId}.jpg`);
      await ctx.replyWithPhoto(media, {
        caption,
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
// set product main photo
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "sMPh") {
    const productId = ctx.state.param;
    const mainPhoto = ctx.state.params.get("pId");
    const objectId = ctx.state.params.get("o");
    await store.updateRecord(`objects/${objectId}/products/${productId}`, {
      mainPhoto,
    });
    await ctx.editMessageCaption(`Main photo updated ${productId}`,
        {
          reply_markup: {
            inline_keyboard: [
              [{text: "🗑 Delete", callback_data: `dPh/${productId}?pId=${mainPhoto}&o=${objectId}`}],
              [{text: "❎ Close", callback_data: "closePhoto"}],
            ],
          },
        });
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});
// close photo
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "closePhoto") {
    await ctx.deleteMessage();
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});
// delete photo
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "dPh") {
    const productId = ctx.state.param;
    const deleteFileId = ctx.state.params.get("pId");
    const objectId = ctx.state.params.get("o");
    const productRef = firebase.firestore().collection("objects").doc(objectId)
        .collection("products").doc(productId);
    const productSnapshot = await productRef.get();
    // if delete main Photo
    const photoField = `photos.${deleteFileId}`;
    if (productSnapshot.data().mainPhoto === deleteFileId) {
      // set new main photo inddex 1 or delete
      const photoArray = productSnapshot.data().photos && Object.keys(productSnapshot.data().photos);
      if (photoArray && photoArray.length > 1) {
        for (const photoId of photoArray) {
          if (photoId !== deleteFileId) {
            await productRef.update({
              mainPhoto: photoId,
              [photoField]: firebase.firestore.FieldValue.delete(),
            });
            break;
          }
        }
      } else {
        await productRef.update({
          mainPhoto: firebase.firestore.FieldValue.delete(),
          [photoField]: firebase.firestore.FieldValue.delete(),
        });
      }
    } else {
      await productRef.update({
        [photoField]: firebase.firestore.FieldValue.delete(),
      });
    }
    const photoExists = await bucket.file(`photos/${objectId}/products/${productId}/1/${deleteFileId}.jpg`).exists();
    if (photoExists[0]) {
      // delete photos from bucket
      for (const zoomLevel of Array(productSnapshot.data().photos[deleteFileId] + 1).keys()) {
        if (zoomLevel) {
          await bucket.file(`photos/${objectId}/products/${productId}/${zoomLevel}/${deleteFileId}.jpg`).delete();
        }
      }
      // await Promise.all([
      //   bucket.file(`photos/${objectId}/products/${productId}/3/${deleteFileId}.jpg`).delete(),
      //   bucket.file(`photos/${objectId}/products/${productId}/2/${deleteFileId}.jpg`).delete(),
      //   bucket.file(`photos/${objectId}/products/${productId}/1/${deleteFileId}.jpg`).delete(),
      // ]);
    }
    await ctx.deleteMessage();
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});
// upload photos limit 5
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "uploadPhotoProduct") {
    const objectId = ctx.state.params.get("o");
    const productId = ctx.state.param;
    // firestore session
    await store.createRecord(`users/${ctx.from.id}`, {"session": {
      "scene": "uploadPhotoProduct",
      objectId,
      productId,
    }});
    const product = await store.findRecord(`objects/${objectId}/products/${productId}`);
    await ctx.replyWithHTML(`Добавьте фото <b>${product.name} (${product.id})</b>`);
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});
// upload catalog photo
catalogsActions.push( async (ctx, next) => {
  if (ctx.state.routeName === "uploadPhotoCat") {
    const objectId = ctx.state.params.get("o");
    const catalogId = ctx.state.param;
    await store.createRecord(`users/${ctx.from.id}`, {"session": {
      "scene": "uploadPhotoCat",
      objectId,
      catalogId,
    }});
    const catalog = await store.findRecord(`objects/${objectId}/catalogs/${catalogId}`);
    await ctx.replyWithHTML(`Добавьте фото <b>${catalog.name} (${catalog.id})</b>`);
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});
// upload product photos
const uploadPhotoProduct = async (ctx, objectId, productId) => {
  if (productId && objectId) {
    const product = await store.findRecord(`objects/${objectId}/products/${productId}`);
    // get count photos to check limits 5 photos
    const photoArray = product.photos && Object.keys(product.photos);
    if (photoArray && photoArray.length > 4) {
      await ctx.reply("Limit 5 photos");
    } else {
      // upload only one photo!!!
      if (ctx.message.media_group_id) {
        await ctx.reply("Choose only one Photo!");
        return;
      }
      // get telegram file_id photos data
      const telegramPhotos = ctx.message.photo;
      if (telegramPhotos.length < 3) {
        await ctx.reply("Choose large photo!");
        return;
      }
      const fileUniqueId = telegramPhotos[2].file_unique_id;
      // loop photos
      for (const [index, photo] of telegramPhotos.entries()) {
        // without small photo
        if (index) {
          const photoUrl = await ctx.telegram.getFileLink(photo.file_id);
          try {
            // download photos from telegram server
            const photoPath = await download(photoUrl.href);
            await bucket.upload(photoPath, {
              destination: `photos/${objectId}/products/${product.id}/${index}/${fileUniqueId}.jpg`,
            });
            // save same file for 3 level zoom
            // if (telegramPhotos.length === 3 && index === 2) {
            //   await bucket.upload(photoPath, {
            //     destination: `photos/${objectId}/products/${product.id}/3/${fileUniqueId}.jpg`,
            //   });
            // }
            // delete download file
            fs.unlinkSync(photoPath);
          } catch (e) {
            console.log("Download failed");
            console.log(e.message);
            await ctx.reply(`Error upload photos ${e.message}`);
          }
        }
      }
      // save file id
      const photosField = `photos.${fileUniqueId}`;
      if (!product.mainPhoto) {
        await store.updateRecord(`objects/${objectId}/products/${productId}`, {
          mainPhoto: fileUniqueId,
          [photosField]: 2,
        });
      } else {
        await store.updateRecord(`objects/${objectId}/products/${productId}`, {
          [photosField]: 2,
        });
      }
      // if (!product.mainPhoto) {
      //   await store.updateRecord(`objects/${objectId}/products/${productId}`, {
      //     mainPhoto: fileUniqueId,
      //     photos: firebase.firestore.FieldValue.arrayUnion(fileUniqueId),
      //   });
      // } else {
      //   await store.updateRecord(`objects/${objectId}/products/${productId}`, {
      //     photos: firebase.firestore.FieldValue.arrayUnion(fileUniqueId),
      //   });
      // }
      // get catalog url (path)
      let catalogUrl = `c/${product.catalog.id}?o=${objectId}&u=1`;
      if (ctx.session.pathCatalog) {
        catalogUrl = ctx.session.pathCatalog;
      }
      const media = await photoCheckUrl(`photos/${objectId}/products/${product.id}/2/${fileUniqueId}.jpg`);
      await ctx.replyWithPhoto(media,
          {
            caption: `${product.name} (${product.id}) photo uploaded`,
            reply_markup: {
              inline_keyboard: [
                [{text: "📸 Upload photo", callback_data: `uploadPhotoProduct/${product.id}?o=${objectId}`}],
                [{text: `🖼 Show photos (${product.photos ? Object.keys(product.photos).length + 1 : 1})`,
                  callback_data: `showPhotos/${product.id}?o=${objectId}`}],
                [{text: "⤴️ Goto catalog",
                  callback_data: catalogUrl}],
              ],
            },
          });
    }
    await store.createRecord(`users/${ctx.from.id}`, {"session": {
      "scene": null,
      "objectId": null,
      "productId": null,
    }});
  } else {
    await ctx.reply("Please select a product to upload Photo");
  }
};
// upload catalog photo
const uploadPhotoCat = async (ctx, objectId, catalogId) => {
  if (catalogId && objectId) {
    const catalog = await store.findRecord(`objects/${objectId}/catalogs/${catalogId}`);
    if (ctx.message.media_group_id) {
      await ctx.reply("Choose only one Photo!");
      return;
    }
    // get telegram file_id photos data
    const origin = ctx.message.photo[3];
    const big = ctx.message.photo[2];
    const thumbnail = ctx.message.photo[1];
    // If 720*1280 photo[3] empty
    if (!origin) {
      await ctx.reply("Choose large photo!");
      return;
    }
    // delete old photos
    if (catalog.photo) {
      await bucket.deleteFiles({
        prefix: `photos/${objectId}/catalogs/${catalogId}`,
      });
    }
    // get photos url
    const resultsUrl = await Promise.all([
      ctx.telegram.getFileLink(origin.file_id),
      ctx.telegram.getFileLink(big.file_id),
      ctx.telegram.getFileLink(thumbnail.file_id),
    ]);
    const originUrl = resultsUrl[0];
    const bigUrl = resultsUrl[1];
    const thumbnailUrl = resultsUrl[2];
    try {
      // download photos from telegram server
      const results = await Promise.all([
        download(originUrl.href),
        download(bigUrl.href),
        download(thumbnailUrl.href),
      ]);
      const originFilePath = results[0];
      const bigFilePath = results[1];
      const thumbnailFilePath = results[2];
      // upload photo file
      await Promise.all([
        bucket.upload(originFilePath, {
          destination: `photos/${objectId}/catalogs/${catalog.id}/3/${origin.file_unique_id}.jpg`,
        }),
        bucket.upload(bigFilePath, {
          destination: `photos/${objectId}/catalogs/${catalog.id}/2/${origin.file_unique_id}.jpg`,
        }),
        bucket.upload(thumbnailFilePath, {
          destination: `photos/${objectId}/catalogs/${catalog.id}/1/${origin.file_unique_id}.jpg`,
        }),
      ]);
      // delete download file
      fs.unlinkSync(originFilePath);
      fs.unlinkSync(bigFilePath);
      fs.unlinkSync(thumbnailFilePath);
    } catch (e) {
      console.log("Download failed");
      console.log(e.message);
      await ctx.reply(`Error upload photos ${e.message}`);
    }
    await store.updateRecord(`objects/${objectId}/catalogs/${catalog.id}`, {
      photo: origin.file_unique_id,
    });
    // get catalog url (path)
    const catalogUrl = `c/${catalog.id}?o=${objectId}`;
    const media = await photoCheckUrl(`photos/${objectId}/catalogs/${catalog.id}/2/${origin.file_unique_id}.jpg`);
    await ctx.replyWithPhoto(media,
        {
          caption: `${catalog.name} (${catalog.id}) photo uploaded`,
          reply_markup: {
            inline_keyboard: [
              [{text: "⤴️ Goto catalog",
                callback_data: catalogUrl}],
            ],
          },
        });
    await store.createRecord(`users/${ctx.from.id}`, {"session": {
      "scene": null,
      "objectId": null,
      "catalogId": null,
    }});
  } else {
    await ctx.reply("Please select a product to upload Photo");
  }
};

exports.uploadPhotoProduct = uploadPhotoProduct;
exports.uploadPhotoCat = uploadPhotoCat;
exports.catalogsActions = catalogsActions;
exports.cartWizard = cartWizard;
exports.showCart = showCart;
