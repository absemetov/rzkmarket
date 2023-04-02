const firebase = require("firebase-admin");
const {showCart, cartWizard} = require("./bot_catalog_scene");
const {store, cart, roundNumber, photoCheckUrl} = require("./bot_store_cart");
const {parseUrl} = require("./bot_start_scene");
const firestore = require("firebase-admin/firestore");
const moment = require("moment");
const ordersActions = [];
// user orders
const userOrders = async (ctx, next) => {
  if (ctx.state.routeName === "m") {
    const startAfter = ctx.state.params.get("s");
    const endBefore = ctx.state.params.get("e");
    const userId = + ctx.state.param;
    const inlineKeyboardArray = [];
    const orderId = ctx.state.params.get("oId");
    const objectId = ctx.state.params.get("o");
    let caption = `<b>${ctx.i18n.btn.orders()}</b>`;
    const pathOrderCurrent = ctx.state.sessionMsg.url.searchParams.get("pathOrderCurrent");
    if (pathOrderCurrent) {
      caption = `Заказы от ${userId}`;
    }
    const limit = 10;
    if (orderId) {
      const order = await store.findRecord(`objects/${objectId}/orders/${orderId}`);
      if (order) {
        // show order
        const date = moment.unix(order.createdAt).locale(process.env.BOT_LANG);
        caption += "<b> > " +
        `${ctx.i18n.txt.order()} #${store.formatOrderNumber(order.userId, order.orderNumber)} (${date.fromNow()})\n` +
        `${order.objectName}\n` +
        `Статус: ${store.statuses().get(order.statusId)}\n` +
        `${order.lastName} ${order.firstName} ${order.phoneNumber}\n` +
        `${order.address}\n` +
        `Доставка: ${store.carriers().get(order.carrierId).name} ` +
        `${order.carrierNumber ? "#" + order.carrierNumber : ""}\n` +
        `Оплата: ${store.payments().get(order.paymentId)}\n` +
        `${order.comment ? order.comment + "\n" : ""}</b>`;
        let totalQty = 0;
        let totalSum = 0;
        let itemShow = 0;
        const orderProductsSorted = store.sort(order.products);
        orderProductsSorted.forEach((product, index) => {
          const productTxt = `${index + 1})<b>${product.name}</b> (${product.id})` +
        `=<b>${product.qty}${product.unit}</b>*${product.price} ${process.env.BOT_CURRENCY}` +
        `=${roundNumber(product.price * product.qty)}${process.env.BOT_CURRENCY}`;
          // truncate long string
          if ((caption + `${productTxt}\n`).length < 1000) {
            caption += `${productTxt}\n`;
            itemShow++;
          }
          totalQty += product.qty;
          totalSum += product.qty * product.price;
        });
        if (itemShow !== orderProductsSorted.length) {
          caption += `${ctx.i18n.txt.orderFuel()}\n`;
        }
        caption += `<b>${ctx.i18n.product.qty()}: ${totalQty}\n` +
          `${ctx.i18n.product.sum()}: ${roundNumber(totalSum)} ${process.env.BOT_CURRENCY}</b>`;
      }
      // share link
      inlineKeyboardArray.push([
        {text: ctx.i18n.btn.linkOrder(), url: `${process.env.BOT_SITE}/o/${objectId}/s/${order.id}`},
      ]);
      const myPathOrder = ctx.state.sessionMsg.url.searchParams.get("myPathOrder");
      inlineKeyboardArray.push([{text: ctx.i18n.btn.orders(),
        callback_data: `${myPathOrder ? myPathOrder : "m/" + userId}`}]);
    } else {
      // show all orders
      ctx.state.sessionMsg.url.searchParams.set("myPathOrder", ctx.callbackQuery.data);
      const mainQuery = firebase.firestore().collectionGroup("orders").where("userId", "==", userId).orderBy("createdAt", "desc");
      let query = mainQuery;
      if (startAfter) {
        const startAfterProduct = await store.getQuery(`objects/${objectId}/orders/${startAfter}`).get();
        query = query.startAfter(startAfterProduct);
      }
      // prev button
      if (endBefore) {
        const endBeforeProduct = await store.getQuery(`objects/${objectId}/orders/${endBefore}`).get();
        // set limit
        query = query.endBefore(endBeforeProduct).limitToLast(limit);
      } else {
        // defaul limit
        query = query.limit(limit);
      }
      // get orders
      const ordersSnapshot = await query.get();
      // render orders
      ordersSnapshot.docs.forEach((doc) => {
        const order = {id: doc.id, ...doc.data()};
        const date = moment.unix(order.createdAt).locale(process.env.BOT_LANG);
        inlineKeyboardArray.push([{text: `${ctx.i18n.txt.order()} #${store.formatOrderNumber(order.userId, order.orderNumber)},` +
          `${store.statuses().get(order.statusId)}, ${date.fromNow()}`,
        callback_data: `m/${userId}?oId=${order.id}&o=${order.objectId}`}]);
      });
      // load more button
      if (!ordersSnapshot.empty) {
        const prevNext = [];
        const endBeforeSnap = ordersSnapshot.docs[0];
        const ifBeforeProducts = await mainQuery.endBefore(endBeforeSnap).limitToLast(1).get();
        if (!ifBeforeProducts.empty) {
          prevNext.push({text: ctx.i18n.btn.previous(),
            callback_data: `m/${userId}?e=${endBeforeSnap.id}&o=${endBeforeSnap.data().objectId}`});
        }
        // startAfter
        const startAfterSnap = ordersSnapshot.docs[ordersSnapshot.docs.length - 1];
        const ifAfterProducts = await mainQuery.startAfter(startAfterSnap).limit(1).get();
        if (!ifAfterProducts.empty) {
          prevNext.push({text: ctx.i18n.btn.next(),
            callback_data: `m/${userId}?s=${startAfterSnap.id}&o=${startAfterSnap.data().objectId}`});
        }
        inlineKeyboardArray.push(prevNext);
      } else {
        inlineKeyboardArray.push([{text: ctx.i18n.txt.noOrder(), callback_data: "o"}]);
      }
      if (pathOrderCurrent) {
        inlineKeyboardArray.push([{text: "🏠 Вернуться к заказу",
          callback_data: `${pathOrderCurrent}`}]);
      }
      inlineKeyboardArray.push([{text: ctx.i18n.btn.main(), callback_data: "o"}]);
    }
    const media = await photoCheckUrl();
    await ctx.editMessageMedia({
      type: "photo",
      media,
      caption: caption + ctx.state.sessionMsg.linkHTML(),
      parse_mode: "html",
    }, {
      reply_markup: {
        inline_keyboard: inlineKeyboardArray,
      },
    });
    await ctx.answerCbQuery();
  } else {
    return next();
  }
};
// admin orders
const adminOrders = async (ctx, next) => {
  if (ctx.state.routeName === "r") {
    const startAfter = ctx.state.params.get("s");
    const endBefore = ctx.state.params.get("e");
    const todo = ctx.state.params.get("todo");
    const objectId = ctx.state.params.get("o") || ctx.state.sessionMsg.url.searchParams.get("oId");
    if (ctx.state.params.get("o")) {
      ctx.state.sessionMsg.url.searchParams.set("oId", objectId);
    }
    const page = ctx.state.sessionMsg.url.searchParams.get("page_order");
    const inlineKeyboardArray = [];
    const orderId = ctx.state.param;
    const limit = 10;
    const object = await store.findRecord(`objects/${objectId}`);
    let caption = `<b>Заказы ${object.name}</b>`;
    // todo
    // show statuses
    if (todo === "showStatuses") {
      const selectedStatus = + ctx.state.params.get("selectedStatus");
      const inlineKeyboardArray = [];
      store.statuses().forEach((value, key) => {
        if (key === selectedStatus) {
          value = "✅ " + value;
        }
        inlineKeyboardArray.push([{text: value, callback_data: `r?statusId=${key}`}]);
      });
      const pathOrder = ctx.state.sessionMsg.url.searchParams.get("pathOrder");
      inlineKeyboardArray.push([{text: "⬅️ Назад",
        callback_data: `${pathOrder ? pathOrder : "r"}`}]);
      await cartWizard[0](ctx, "Статуc заказа", inlineKeyboardArray);
      await ctx.answerCbQuery();
      return;
    }
    if (orderId) {
      // show order
      const order = await store.findRecord(`objects/${objectId}/orders/${orderId}`);
      if (order) {
        // show order
        ctx.state.sessionMsg.url.searchParams.set("pathOrderCurrent", ctx.callbackQuery.data);
        const date = moment.unix(order.createdAt).locale("ru");
        caption = `<b>${order.objectName} >` +
        ` ${ctx.i18n.txt.order()} #${store.formatOrderNumber(order.userId, order.orderNumber)}` +
        ` (${date.fromNow()})\n` +
        `${ctx.i18n.txt.buyer()}: ${order.lastName} ${order.firstName} ${order.phoneNumber}\n` +
        `${ctx.i18n.txt.delivery()}: ${order.address}, ` +
        `${store.carriers().get(order.carrierId).name} ` +
        `${order.carrierNumber ? "#" + order.carrierNumber : ""}\n` +
        `Оплата: ${store.payments().get(order.paymentId)}\n` +
        `${order.comment ? `${ctx.i18n.txt.comment()}: ` + order.comment + "\n" : ""}</b>`;
        let totalQty = 0;
        let totalSum = 0;
        let itemShow = 0;
        const orderProductsSorted = store.sort(order.products);
        orderProductsSorted.forEach((product, index) => {
          const productTxt = `${index + 1})<b>${product.name}</b> (${product.id})` +
        `=<b>${product.qty}${product.unit}</b>*${product.price}${process.env.BOT_CURRENCY}` +
        `=${roundNumber(product.price * product.qty)}${process.env.BOT_CURRENCY}`;
          // truncate long string
          if ((caption + `${productTxt}\n`).length < 950) {
            caption += `${productTxt}\n`;
            itemShow++;
          }
          totalQty += product.qty;
          totalSum += product.qty * product.price;
        });
        if (itemShow !== orderProductsSorted.length) {
          caption += "⬇️Весь список нажмите на ссылку ⬇️\n";
        }
        caption += `<b>Количество товара: ${totalQty}\n` +
          `Сумма: ${roundNumber(totalSum)} ${process.env.BOT_CURRENCY}</b>`;
      }
      // share link
      inlineKeyboardArray.push([
        {text: "Ссылка на заказ", url: `${process.env.BOT_SITE}/o/${objectId}/s/${order.id}`},
      ]);
      // create pdf
      inlineKeyboardArray.push([{text: ctx.i18n.btn.savePdf(),
        callback_data: `f/order?id=${order.id}`}]);
      // edit entries
      inlineKeyboardArray.push([{text: `📝 Статус: ${store.statuses().get(order.statusId)}`,
        callback_data: `e/${order.id}?showStatus=${order.statusId}`}]);
      inlineKeyboardArray.push([{text: `📝 Фамилия получателя: ${order.lastName}`,
        callback_data: `e/${order.id}?e=lastName`}]);
      inlineKeyboardArray.push([{text: `📝 Имя получателя: ${order.firstName}`,
        callback_data: `e/${order.id}?e=firstName`}]);
      inlineKeyboardArray.push([{text: `📝 Номер тел.: ${order.phoneNumber}`,
        callback_data: `e/${order.id}?e=phoneNumber`}]);
      inlineKeyboardArray.push([{text: `📝 Оплата: ${store.payments().get(order.paymentId)}`,
        callback_data: `e/${order.id}?showPay=${order.paymentId}`}]);
      if (order.carrierNumber) {
        inlineKeyboardArray.push([{text: `📝 Доставка: ${store.carriers().get(order.carrierId).name} ` +
        `#${order.carrierNumber}`,
        callback_data: `e/${order.id}?showCarrier=${order.carrierId}&qty=${order.carrierNumber}`}]);
      } else {
        inlineKeyboardArray.push([{text: `📝 Доставка: ${store.carriers().get(order.carrierId).name}`,
          callback_data: `e/${order.id}?showCarrier=${order.carrierId}`}]);
      }
      inlineKeyboardArray.push([{text: `📝 Адрес: ${order.address}`,
        callback_data: `e/${order.id}?e=address`}]);
      inlineKeyboardArray.push([{text: `📝 Комментарий: ${order.comment ? order.comment : ""}`,
        callback_data: `e/${order.id}?e=comment`}]);
      inlineKeyboardArray.push([{text: "📝 Редактировать товары",
        callback_data: `e/${orderId}?editProd=1`}]);
      inlineKeyboardArray.push([{text: "📝 Информация о покупателе",
        callback_data: `e?userId=${order.userId}`}]);
      inlineKeyboardArray.push([{text: "🔄 Обновить",
        callback_data: `r/${order.id}`}]);
      const pathOrder = ctx.state.sessionMsg.url.searchParams.get("pathOrder");
      inlineKeyboardArray.push([{text: "🧾 Заказы",
        callback_data: `${pathOrder ? pathOrder : "r"}`}]);
      if (page) {
        inlineKeyboardArray.push([{text: "🔍 Вернуться к поиску", callback_data: `searchOrder/${page}`}]);
      }
    } else {
      // show orders
      ctx.state.sessionMsg.url.searchParams.set("pathOrder", ctx.callbackQuery.data);
      let mainQuery = firebase.firestore().collection("objects").doc(objectId)
          .collection("orders").orderBy("createdAt", "desc");
      // filter statusId
      const statusId = + ctx.state.params.get("statusId");
      let statusUrl = "";
      if (statusId) {
        mainQuery = mainQuery.where("statusId", "==", statusId);
        statusUrl = `&statusId=${statusId}`;
      }
      let query = mainQuery;
      if (startAfter) {
        const startAfterProduct = await store.getQuery(`objects/${objectId}/orders/${startAfter}`).get();
        query = query.startAfter(startAfterProduct);
      }
      // prev button
      if (endBefore) {
        const endBeforeProduct = await store.getQuery(`objects/${objectId}/orders/${endBefore}`).get();
        // set limit
        query = query.endBefore(endBeforeProduct).limitToLast(limit);
      } else {
        // defaul limit
        query = query.limit(limit);
      }
      // get orders
      const ordersSnapshot = await query.get();
      const tagsArray = [];
      tagsArray.push({text: "📌 Статус заказа",
        callback_data: "r?todo=showStatuses"});
      // delete or close selected tag
      if (statusId) {
        tagsArray[0].callback_data = `r?todo=showStatuses&selectedStatus=${statusId}`;
        tagsArray.push({text: `❎ ${store.statuses().get(statusId)}`, callback_data: "r"});
      }
      inlineKeyboardArray.push(tagsArray);
      // render orders
      ordersSnapshot.docs.forEach((doc) => {
        const order = {id: doc.id, ...doc.data()};
        const date = moment.unix(order.createdAt).locale("ru");
        inlineKeyboardArray.push([{text: `🧾 ${order.lastName} ${order.firstName} ${store.statuses().get(order.statusId)} ` +
        `#${store.formatOrderNumber(order.userId, order.orderNumber)}, ${date.fromNow()}`,
        callback_data: `r/${order.id}`}]);
      });
      // set load more button
      if (!ordersSnapshot.empty) {
        const prevNext = [];
        // endBefore prev button e paaram
        const endBeforeSnap = ordersSnapshot.docs[0];
        const ifBeforeProducts = await mainQuery.endBefore(endBeforeSnap).limitToLast(1).get();
        if (!ifBeforeProducts.empty) {
          prevNext.push({text: "⬅️ Назад",
            callback_data: `r?e=${endBeforeSnap.id}${statusUrl}`});
        }
        // startAfter
        const startAfterSnap = ordersSnapshot.docs[ordersSnapshot.docs.length - 1];
        const ifAfterProducts = await mainQuery.startAfter(startAfterSnap).limit(1).get();
        if (!ifAfterProducts.empty) {
          prevNext.push({text: "➡️ Вперед",
            callback_data: `r?s=${startAfterSnap.id}${statusUrl}`});
        }
        inlineKeyboardArray.push(prevNext);
      } else {
        inlineKeyboardArray.push([{text: "Заказов нет", callback_data: `o/${objectId}`}]);
      }
      inlineKeyboardArray.push([{text: `🏪 ${object.name}`, callback_data: `o/${objectId}`}]);
    }
    let publicImgUrl = null;
    if (object.photoId) {
      publicImgUrl = `photos/o/${objectId}/logo/${object.photoId}/2.jpg`;
    }
    const media = await photoCheckUrl(publicImgUrl);
    await ctx.editMessageMedia({
      type: "photo",
      media,
      caption: caption + ctx.state.sessionMsg.linkHTML(),
      parse_mode: "html",
    }, {
      reply_markup: {
        inline_keyboard: inlineKeyboardArray,
      },
    });
    await ctx.answerCbQuery();
  } else {
    return next();
  }
};
ordersActions.push(adminOrders);
ordersActions.push(userOrders);

// order wizard
const orderWizard = [
  async (ctx) => {
    ctx.state.sessionMsg.url.searchParams.set("scene", "editOrder");
    ctx.state.sessionMsg.url.searchParams.set("cursor", 1);
    const fieldName = ctx.state.sessionMsg.url.searchParams.get("fieldName");
    const fieldValue = ctx.state.sessionMsg.url.searchParams.get("fieldValue");
    await ctx.replyWithHTML(`Текущее значение ${fieldName}: <b>${fieldValue}</b>, ${fieldName === "comment" ? "del for delete" : ""}` + ctx.state.sessionMsg.linkHTML(), {
      reply_markup: {
        force_reply: true,
      }});
  },
  async (ctx, newValue) => {
    // save order field
    const fieldName = ctx.state.sessionMsg.url.searchParams.get("fieldName");
    if (fieldName === "phoneNumber") {
      const regexpPhone = new RegExp(process.env.BOT_PHONEREGEXP);
      const checkPhone = newValue.match(regexpPhone);
      if (!checkPhone) {
        await ctx.replyWithHTML(`Введите номер телефона в формате ${process.env.BOT_PHONETEMPLATE}` + ctx.state.sessionMsg.linkHTML(), {
          reply_markup: {
            force_reply: true,
          }});
        return;
      }
      newValue = `${process.env.BOT_PHONECODE}${checkPhone[2]}`;
    }
    const objectId = ctx.state.sessionMsg.url.searchParams.get("oId");
    const orderId = ctx.state.sessionMsg.url.searchParams.get("orderId");
    if (fieldName === "comment" && newValue === "del") {
      await store.updateRecord(`objects/${objectId}/orders/${orderId}`,
          {[fieldName]: firestore.FieldValue.delete()});
      // exit scene
      await ctx.reply(`Комментарий удален. Обновите заказ! ${fieldName}=>${newValue} 🔄`, {
        reply_markup: {
          remove_keyboard: true,
        }});
    } else {
      await store.updateRecord(`objects/${objectId}/orders/${orderId}`,
          {[fieldName]: newValue});
      // exit scene
      await ctx.reply(`Данные сохранены. Обновите заказ! ${fieldName}=>${newValue} 🔄`, {
        reply_markup: {
          remove_keyboard: true,
        }});
    }
  },
];
// edit order fields
ordersActions.push(async (ctx, next) => {
  if (ctx.state.routeName === "e") {
    const orderId = ctx.state.param;
    const editField = ctx.state.params.get("e");
    const showCarrier = + ctx.state.params.get("showCarrier");
    const qty = + ctx.state.params.get("qty") || 0;
    const carrierNumber = + ctx.state.params.get("cN") || 0;
    const carrierId = + ctx.state.params.get("saveCarrier");
    const showPaymentId = + ctx.state.params.get("showPay");
    const paymentId = + ctx.state.params.get("paymentId");
    const showStatus = + ctx.state.params.get("showStatus");
    const statusId = + ctx.state.params.get("saveStatus");
    const objectId = ctx.state.sessionMsg.url.searchParams.get("oId");
    const userId = ctx.state.params.get("userId");
    // show user info creator
    if (userId) {
      const inlineKeyboardArray = [];
      inlineKeyboardArray.push([{text: `Заказы from User ${userId}`,
        callback_data: `m/${userId}`}]);
      const pathOrderCurrent = ctx.state.sessionMsg.url.searchParams.get("pathOrderCurrent");
      inlineKeyboardArray.push([{text: "⬅️ Назад",
        callback_data: `${pathOrderCurrent}`}]);
      const userData = await store.findRecord(`users/${userId}`);
      await cartWizard[0](ctx, `User <a href="tg://user?id=${userId}">${userId}</a>\n` +
      `${userData.from ? JSON.stringify(userData.from) : ""}\nCount orders: ${userData.orderCount || 0}`, inlineKeyboardArray);
    }
    // edit produc
    const editProducts = ctx.state.params.get("editProd");
    const saveProducts = ctx.state.params.get("saveProd");
    // save products from cart
    if (saveProducts) {
      const products = await store.findRecord(`objects/${objectId}/carts/${ctx.from.id}`, "products");
      // clear cart
      await Promise.all([
        cart.clear(objectId, ctx.from.id),
        store.updateRecord(`objects/${objectId}/orders/${orderId}`, {products}),
      ]);
      // redirect to order
      parseUrl(ctx, `r/${orderId}`);
      await adminOrders(ctx);
    }
    if (editProducts) {
      // clear cart then export!!!
      const order = await store.findRecord(`objects/${objectId}/orders/${orderId}`);
      ctx.state.sessionMsg.url.searchParams.set("orderData_id", order.id);
      ctx.state.sessionMsg.url.searchParams.set("orderData_orderNumber", order.orderNumber);
      ctx.state.sessionMsg.url.searchParams.set("orderData_lastName", order.lastName);
      ctx.state.sessionMsg.url.searchParams.set("orderData_firstName", order.firstName);
      await cart.clear(objectId, ctx.from.id);
      await store.createRecord(`objects/${objectId}/carts/${ctx.from.id}`, {products: order.products}),
      // set route name
      parseUrl(ctx, "cart");
      await showCart(ctx, next);
    }
    if (editField) {
      ctx.state.sessionMsg.url.searchParams.set("orderId", orderId);
      ctx.state.sessionMsg.url.searchParams.set("fieldName", editField);
      const order = await store.findRecord(`objects/${objectId}/orders/${orderId}`);
      ctx.state.sessionMsg.url.searchParams.set("fieldValue", order[editField]);
      await orderWizard[0](ctx);
    }
    // show payment
    if (showPaymentId) {
      const inlineKeyboardArray = [];
      store.payments().forEach((value, key) => {
        if (key === showPaymentId) {
          value = "✅ " + value;
        }
        inlineKeyboardArray.push([{text: value, callback_data: `e/${orderId}?paymentId=${key}`}]);
      });
      inlineKeyboardArray.push([{text: "⬅️ Назад",
        callback_data: `r/${orderId}`}]);
      await cartWizard[0](ctx, "Способ оплаты", inlineKeyboardArray);
    }
    // save payment
    if (paymentId) {
      await store.updateRecord(`objects/${objectId}/orders/${orderId}`, {paymentId});
      parseUrl(ctx, `r/${orderId}`);
      await adminOrders(ctx);
    }
    // show carrier
    if (showCarrier) {
      const inlineKeyboardArray = [];
      store.carriers().forEach((obj, key) => {
        if (key === showCarrier) {
          obj.name = "✅ " + obj.name;
        }
        if (obj.reqNumber) {
          inlineKeyboardArray.push([{text: obj.name,
            callback_data: `w/k?cId=${key}&oId=${orderId}&qty=${qty}`}]);
        } else {
          inlineKeyboardArray.push([{text: obj.name, callback_data: `e/${orderId}?saveCarrier=${key}`}]);
        }
      });
      inlineKeyboardArray.push([{text: "⬅️ Назад",
        callback_data: `r/${orderId}`}]);
      await cartWizard[0](ctx, "Способ доставки", inlineKeyboardArray);
    }
    // save carrier
    if (carrierId) {
      if (store.carriers().get(carrierId).reqNumber && !carrierNumber) {
        // return first step error
        parseUrl(ctx, `w/k?cId=${carrierId}&oId=${orderId}`);
        await cartWizard[1](ctx, "errorCurrierNumber");
        return;
      }
      await store.updateRecord(`objects/${objectId}/orders/${orderId}`, {
        carrierId,
        carrierNumber,
      });
      // redirect to order
      parseUrl(ctx, `r/${orderId}`);
      await adminOrders(ctx);
    }
    // show status
    if (showStatus) {
      const inlineKeyboardArray = [];
      store.statuses().forEach((value, key) => {
        if (key === showStatus) {
          value = "✅ " + value;
        }
        inlineKeyboardArray.push([{text: value, callback_data: `e/${orderId}?saveStatus=${key}`}]);
      });
      inlineKeyboardArray.push([{text: "⬅️ Назад",
        callback_data: `r/${orderId}`}]);
      await cartWizard[0](ctx, "Статус заказа", inlineKeyboardArray);
    }
    // save status
    if (statusId) {
      await store.updateRecord(`objects/${objectId}/orders/${orderId}`, {statusId});
      // redirect to order
      parseUrl(ctx, `r/${orderId}`);
      await adminOrders(ctx);
    }
    await ctx.answerCbQuery();
  } else {
    return next();
  }
});

exports.ordersActions = ordersActions;
exports.orderWizard = orderWizard;
